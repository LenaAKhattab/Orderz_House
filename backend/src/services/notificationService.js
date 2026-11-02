const { pool } = require("../config/db");
const { sanitizeNotificationForViewer } = require("../utils/notificationViewerSanitize");
const { isAllowedByPreferences } = require("../utils/notificationPreferenceRules");
const { getUserNotificationPreferences, getManyUserNotificationPreferences } = require("./notificationPreferenceCache");
const realtimeHub = require("./notificationRealtimeHub");
const { queuePushForNotification } = require("./fcmPushService");
const { runAfterCommit, runInSavepoint, isInTransaction } = require("../config/afterCommit");

function getRunner(client) {
  return client || pool;
}

/**
 * Column limits of `notifications` (migration 025; verified against the live schema). PostgreSQL varchar(n)
 * counts characters (code points), so lengths are measured in code points — never UTF-16 units or bytes.
 * message / link are TEXT and metadata is JSONB: no length limit.
 */
const NOTIFICATION_FIELD_LIMITS = Object.freeze({
  recipientRole: 30,
  type: 120,
  title: 255,
  entityType: 60,
  dedupeKey: 255,
});
const TITLE_ELLIPSIS = "…";
const graphemeSegmenter =
  typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function codePointLength(value) {
  let n = 0;
  // eslint-disable-next-line no-unused-vars
  for (const _ of value) n += 1;
  return n;
}

/** PostgreSQL text cannot hold U+0000; lone UTF-16 surrogates are not valid Unicode text either. */
function cleanText(value) {
  let s = String(value ?? "");
  if (s.includes("\u0000")) s = s.split("\u0000").join("");
  return typeof s.toWellFormed === "function" ? s.toWellFormed() : s;
}

/**
 * Deterministic user-facing cap: keeps whole grapheme clusters (Arabic marks, emoji sequences stay intact),
 * at most `max` code points in total including the trailing ellipsis.
 */
function capDisplayText(value, max) {
  if (codePointLength(value) <= max) return value;
  const budget = max - codePointLength(TITLE_ELLIPSIS);
  const parts = graphemeSegmenter
    ? Array.from(graphemeSegmenter.segment(value), (s) => s.segment)
    : Array.from(value);
  let out = "";
  let used = 0;
  for (const part of parts) {
    const len = codePointLength(part);
    if (used + len > budget) break;
    out += part;
    used += len;
  }
  return `${out.trimEnd()}${TITLE_ELLIPSIS}`;
}

/** Structured identifiers are never truncated (a cut dedupe key could collide): reject instead. */
function assertIdentifierFits(field, value) {
  if (value == null) return;
  if (value.includes("\u0000") || codePointLength(value) > NOTIFICATION_FIELD_LIMITS[field]) {
    const err = new Error(`Notification ${field} exceeds its storage limit.`);
    err.statusCode = 400;
    err.code = "NOTIFICATION_FIELD_INVALID";
    throw err;
  }
}

/** JSONB rejects \u0000 and lone surrogate escapes: clean every string value before serializing. */
function serializeMetadata(metadata) {
  return JSON.stringify(metadata || {}, (_key, value) => (typeof value === "string" ? cleanText(value) : value));
}

const PERSIST_LOG_WINDOW_MS = 60_000;
const PERSIST_LOG_MAX_PER_WINDOW = 20;
const persistLogState = { windowStart: 0, count: 0, suppressed: 0 };

function safeLogToken(value, pattern, fallback) {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

/**
 * Bounded, content-free failure log: notification type, error class/code, transaction outcome only
 * (never titles, bodies, metadata, recipients or error messages, which can echo input values).
 * tx: none = no open transaction · survived = rolled back to the notification savepoint, business transaction
 * still usable · aborted = the transaction was already unusable · untouched = rejected before any statement.
 */
function logPersistFailure(type, err, txState, stage = "persist") {
  const now = Date.now();
  if (now - persistLogState.windowStart >= PERSIST_LOG_WINDOW_MS) {
    if (persistLogState.suppressed > 0) {
      // eslint-disable-next-line no-console
      console.error(`[notifications] persist_failed suppressed=${persistLogState.suppressed} window_ms=${PERSIST_LOG_WINDOW_MS}`);
    }
    persistLogState.windowStart = now;
    persistLogState.count = 0;
    persistLogState.suppressed = 0;
  }
  if (persistLogState.count >= PERSIST_LOG_MAX_PER_WINDOW) {
    persistLogState.suppressed += 1;
    return;
  }
  persistLogState.count += 1;
  const safeType = safeLogToken(type, /^[A-Za-z0-9_.:-]{1,120}$/, "unknown");
  const code = safeLogToken(err?.code, /^[A-Za-z0-9_]{1,40}$/, safeLogToken(err?.name, /^[A-Za-z]{1,40}$/, "unknown"));
  // eslint-disable-next-line no-console
  console.error(`[notifications] persist_failed type=${safeType} stage=${stage} code=${code} tx=${txState}`);
}

function typeHintOf(items) {
  const types = [...new Set((Array.isArray(items) ? items : [items]).map((x) => x?.type))];
  return types.length === 1 ? types[0] : "mixed";
}

function normalizeOrLog(data) {
  try {
    return normalizeCreateInput(data);
  } catch (err) {
    logPersistFailure(data?.type, err, "untouched", "validation");
    throw err;
  }
}

/**
 * Canonical isolation for notification writes. Inside an open transaction on `runner` the work runs under its
 * own SAVEPOINT (afterCommit.runInSavepoint): a failing INSERT rolls back to that savepoint, so the caller's
 * business transaction stays usable and commits normally; realtime/push registered inside are discarded with
 * it. The error is still thrown — best-effort callers (safeNotify, try/catch) swallow it, callers that treat
 * the notification as required fail exactly as before. Outside a transaction: a plain statement, no savepoint.
 */
async function persistIsolated(runner, typeHint, persist) {
  let txState = isInTransaction(runner) ? "survived" : "none";
  try {
    return await runInSavepoint(runner, persist, {
      onError: (_err, state) => {
        txState = state;
      },
    });
  } catch (err) {
    logPersistFailure(typeHint, err, txState);
    throw err;
  }
}

function mapNotification(row) {
  if (!row) return null;
  const actorName = [row.actor_first_name, row.actor_father_name, row.actor_family_name].filter(Boolean).join(" ").trim();
  return {
    id: String(row.id),
    recipientUserId: String(row.recipient_user_id),
    recipientRole: row.recipient_role || null,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    actor: row.actor_user_id
      ? {
          id: String(row.actor_user_id),
          accountId: row.actor_account_id || null,
          firstName: row.actor_first_name || null,
          fatherName: row.actor_father_name || null,
          familyName: row.actor_family_name || null,
          fullName: actorName || null,
        }
      : null,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id != null ? String(row.entity_id) : null,
    link: row.link || null,
    priority: row.priority,
    isRead: Boolean(row.is_read),
    readAt: row.read_at || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    dedupeKey: row.dedupe_key || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCreateInput(data) {
  if (!data || typeof data !== "object") {
    const err = new Error("Notification payload is required.");
    err.statusCode = 400;
    throw err;
  }
  const out = {
    recipientUserId: Number(data.recipientUserId),
    recipientRole: data.recipientRole ? String(data.recipientRole).trim() : null,
    actorUserId: data.actorUserId != null ? Number(data.actorUserId) : null,
    type: String(data.type || "").trim(),
    // User-facing text: NUL / lone surrogates removed; title capped to its varchar(255) on grapheme boundaries.
    title: capDisplayText(cleanText(data.title || "").trim(), NOTIFICATION_FIELD_LIMITS.title),
    message: cleanText(data.message || "").trim(),
    entityType: String(data.entityType || "").trim(),
    entityId: data.entityId != null ? Number(data.entityId) : null,
    link: data.link ? cleanText(data.link).trim() || null : null,
    priority: String(data.priority || "medium").trim().toLowerCase(),
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    dedupeKey: data.dedupeKey ? String(data.dedupeKey).trim() : null,
  };
  assertIdentifierFits("recipientRole", out.recipientRole);
  assertIdentifierFits("type", out.type);
  assertIdentifierFits("entityType", out.entityType);
  assertIdentifierFits("dedupeKey", out.dedupeKey);

  if (!Number.isSafeInteger(out.recipientUserId) || out.recipientUserId < 1) {
    const err = new Error("recipientUserId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (out.actorUserId != null && (!Number.isSafeInteger(out.actorUserId) || out.actorUserId < 1)) {
    const err = new Error("actorUserId is invalid.");
    err.statusCode = 400;
    throw err;
  }
  if (!out.type || !out.title || !out.message || !out.entityType) {
    const err = new Error("type, title, message, and entityType are required.");
    err.statusCode = 400;
    throw err;
  }
  if (out.entityId != null && (!Number.isSafeInteger(out.entityId) || out.entityId < 1)) {
    const err = new Error("entityId is invalid.");
    err.statusCode = 400;
    throw err;
  }
  if (!["low", "medium", "high", "critical"].includes(out.priority)) {
    const err = new Error("priority is invalid.");
    err.statusCode = 400;
    throw err;
  }
  if (out.dedupeKey === "") out.dedupeKey = null;
  return out;
}

async function shouldDeliverInApp(input) {
  try {
    const prefs = await getUserNotificationPreferences(input.recipientUserId);
    return isAllowedByPreferences(prefs, input.type, input.priority);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] preference check failed:", err?.message || err);
    return true;
  }
}

function publishRealtime(mapped) {
  if (!mapped?.recipientUserId) return;
  try {
    const viewerRole = mapped.recipientRole || null;
    const safe = sanitizeNotificationForViewer(mapped, viewerRole);
    realtimeHub.publish(mapped.recipientUserId, safe);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] realtime publish failed:", err?.message || err);
  }
}

/**
 * Realtime + push for committed notifications only. Inside an open transaction on `runner` they wait for
 * COMMIT (and never happen on rollback); otherwise they run now. Failures stay best-effort.
 */
function dispatchExternally(runner, notifications) {
  const list = notifications.filter(Boolean);
  if (!list.length) return;
  runAfterCommit(runner, () => {
    for (const n of list) {
      publishRealtime(n);
      queuePushForNotification(n);
    }
  });
}

async function createNotification(data, client) {
  const runner = getRunner(client);
  const input = normalizeOrLog(data);
  const allowed = await shouldDeliverInApp(input);
  if (!allowed) return null;
  return persistIsolated(runner, input.type, async () => {
    const { rows } = await runner.query(
      `INSERT INTO notifications (
        recipient_user_id, recipient_role, actor_user_id, type, title, message,
        entity_type, entity_id, link, priority, metadata, dedupe_key
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      RETURNING *`,
      [
        input.recipientUserId,
        input.recipientRole,
        input.actorUserId,
        input.type,
        input.title,
        input.message,
        input.entityType,
        input.entityId,
        input.link,
        input.priority,
        serializeMetadata(input.metadata),
        input.dedupeKey,
      ],
    );
    const mapped = mapNotification(rows[0]);
    dispatchExternally(runner, [mapped]);
    return mapped;
  });
}

async function createManyNotifications(items, client) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const runner = getRunner(client);
  const normalized = [];
  for (const item of items) {
    const input = normalizeOrLog(item);
    // eslint-disable-next-line no-await-in-loop
    if (await shouldDeliverInApp(input)) normalized.push(input);
  }
  if (!normalized.length) return [];
  const values = [];
  const placeholders = normalized.map((item, idx) => {
    const base = idx * 12;
    values.push(
      item.recipientUserId,
      item.recipientRole,
      item.actorUserId,
      item.type,
      item.title,
      item.message,
      item.entityType,
      item.entityId,
      item.link,
      item.priority,
      serializeMetadata(item.metadata),
      item.dedupeKey,
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12})`;
  });
  return persistIsolated(runner, typeHintOf(normalized), async () => {
    const { rows } = await runner.query(
      `INSERT INTO notifications (
        recipient_user_id, recipient_role, actor_user_id, type, title, message,
        entity_type, entity_id, link, priority, metadata, dedupe_key
      ) VALUES ${placeholders.join(",")}
      RETURNING *`,
      values,
    );
    const mapped = rows.map(mapNotification);
    dispatchExternally(runner, mapped);
    return mapped;
  });
}

async function createIfNotExists(data, dedupeKey, client) {
  const runner = getRunner(client);
  const input = normalizeOrLog({ ...data, dedupeKey: dedupeKey || data?.dedupeKey || null });
  const allowed = await shouldDeliverInApp(input);
  if (!allowed) return null;
  return persistIsolated(runner, input.type, async () => {
    const { rows } = await runner.query(
      `INSERT INTO notifications (
        recipient_user_id, recipient_role, actor_user_id, type, title, message,
        entity_type, entity_id, link, priority, metadata, dedupe_key
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING *`,
      [
        input.recipientUserId,
        input.recipientRole,
        input.actorUserId,
        input.type,
        input.title,
        input.message,
        input.entityType,
        input.entityId,
        input.link,
        input.priority,
        serializeMetadata(input.metadata),
        input.dedupeKey,
      ],
    );
    if (rows[0]) {
      const mapped = mapNotification(rows[0]);
      dispatchExternally(runner, [mapped]);
      return mapped;
    }
    if (!input.dedupeKey) return null;
    const existing = await runner.query(`SELECT * FROM notifications WHERE dedupe_key = $1 LIMIT 1`, [input.dedupeKey]);
    return mapNotification(existing.rows[0] || null);
  });
}

/**
 * Batched createIfNotExists: one multi-row insert; every item must carry its own dedupe key.
 * Preferences are checked per recipient (one batched lookup); realtime + push only for newly inserted rows.
 * Returns the inserted notifications (already-existing dedupe keys are skipped silently).
 */
async function createManyIfNotExists(items, client) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const runner = getRunner(client);
  const inputs = items.map((item) => normalizeOrLog(item));
  if (inputs.some((input) => !input.dedupeKey)) {
    const err = new Error("dedupeKey is required for every item.");
    err.statusCode = 400;
    throw err;
  }
  let prefsByUser;
  try {
    // Read through the caller's runner, under its own savepoint: a failed lookup must not abort the transaction.
    prefsByUser = await runInSavepoint(runner, () =>
      getManyUserNotificationPreferences(inputs.map((input) => input.recipientUserId), runner),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] batched preference check failed:", err?.message || err);
    prefsByUser = new Map();
  }
  const allowed = inputs.filter((input) =>
    isAllowedByPreferences(prefsByUser.get(input.recipientUserId) || {}, input.type, input.priority),
  );
  if (!allowed.length) return [];
  const values = [];
  const placeholders = allowed.map((item, idx) => {
    const base = idx * 12;
    values.push(
      item.recipientUserId,
      item.recipientRole,
      item.actorUserId,
      item.type,
      item.title,
      item.message,
      item.entityType,
      item.entityId,
      item.link,
      item.priority,
      serializeMetadata(item.metadata),
      item.dedupeKey,
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12})`;
  });
  return persistIsolated(runner, typeHintOf(allowed), async () => {
    const { rows } = await runner.query(
      `INSERT INTO notifications (
        recipient_user_id, recipient_role, actor_user_id, type, title, message,
        entity_type, entity_id, link, priority, metadata, dedupe_key
      ) VALUES ${placeholders.join(",")}
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
      RETURNING *`,
      values,
    );
    const mapped = rows.map(mapNotification);
    dispatchExternally(runner, mapped);
    return mapped;
  });
}

async function markAsRead(notificationId, userId, client, viewerRole) {
  const runner = getRunner(client);
  const nid = Number(notificationId);
  const uid = Number(userId);
  if (!Number.isInteger(nid) || nid < 1 || !Number.isInteger(uid) || uid < 1) return null;
  const { rows } = await runner.query(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = COALESCE(read_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
       AND recipient_user_id = $2
     RETURNING *`,
    [nid, uid],
  );
  const mapped = mapNotification(rows[0] || null);
  return sanitizeNotificationForViewer(mapped, viewerRole);
}

async function markAllAsRead(userId, client) {
  const runner = getRunner(client);
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return { updatedCount: 0 };
  const { rowCount } = await runner.query(
    `UPDATE notifications
     SET is_read = TRUE,
         read_at = COALESCE(read_at, NOW()),
         updated_at = NOW()
     WHERE recipient_user_id = $1
       AND is_read = FALSE`,
    [uid],
  );
  return { updatedCount: rowCount };
}

async function getUserNotifications(userId, filters = {}, client, viewerRole) {
  const runner = getRunner(client);
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return { notifications: [], total: 0, limit: 20, offset: 0 };

  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const where = [`recipient_user_id = $1`];
  const params = [uid];

  if (filters.isRead === true || filters.isRead === "true") {
    params.push(true);
    where.push(`is_read = $${params.length}`);
  } else if (filters.isRead === false || filters.isRead === "false") {
    params.push(false);
    where.push(`is_read = $${params.length}`);
  }

  if (filters.type) {
    params.push(String(filters.type).trim());
    where.push(`type = $${params.length}`);
  }
  if (filters.entityType) {
    params.push(String(filters.entityType).trim());
    where.push(`entity_type = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*)::int AS total FROM notifications ${whereSql}`;
  const listSql = `
    SELECT
      n.*,
      u.account_id AS actor_account_id,
      u.first_name AS actor_first_name,
      u.father_name AS actor_father_name,
      u.family_name AS actor_family_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.actor_user_id
    ${whereSql}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2}
  `;
  const [countRes, listRes] = await Promise.all([
    runner.query(countSql, params),
    runner.query(listSql, [...params, limit, offset]),
  ]);
  return {
    notifications: listRes.rows.map((row) => sanitizeNotificationForViewer(mapNotification(row), viewerRole)),
    total: Number(countRes.rows[0]?.total || 0),
    limit,
    offset,
  };
}

async function getUnreadCount(userId, client) {
  const runner = getRunner(client);
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return 0;
  const { rows } = await runner.query(
    `SELECT COUNT(*)::int AS unread_count
     FROM notifications
     WHERE recipient_user_id = $1
       AND is_read = FALSE`,
    [uid],
  );
  return Number(rows[0]?.unread_count || 0);
}

async function deleteNotification(notificationId, userId, client) {
  const runner = getRunner(client);
  const nid = Number(notificationId);
  const uid = Number(userId);
  if (!Number.isInteger(nid) || nid < 1 || !Number.isInteger(uid) || uid < 1) {
    return false;
  }
  const { rowCount } = await runner.query(
    `DELETE FROM notifications WHERE id = $1 AND recipient_user_id = $2`,
    [nid, uid],
  );
  return rowCount > 0;
}

async function deleteNotifications(notificationIds, userId, client) {
  const runner = getRunner(client);
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return { deletedCount: 0 };
  const ids = (Array.isArray(notificationIds) ? notificationIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return { deletedCount: 0 };
  const { rowCount } = await runner.query(
    `DELETE FROM notifications
     WHERE recipient_user_id = $1
       AND id = ANY($2::bigint[])`,
    [uid, ids],
  );
  return { deletedCount: rowCount };
}

module.exports = {
  createNotification,
  createManyNotifications,
  createIfNotExists,
  createManyIfNotExists,
  markAsRead,
  markAllAsRead,
  getUserNotifications,
  getUnreadCount,
  deleteNotification,
  deleteNotifications,
  sanitizeNotificationForViewer,
  NOTIFICATION_FIELD_LIMITS,
  // Pure helpers exposed for unit tests.
  normalizeCreateInput,
  capDisplayText,
  serializeMetadata,
};
