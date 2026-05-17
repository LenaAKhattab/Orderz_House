const { pool } = require("../config/db");
const { sanitizeNotificationForViewer } = require("../utils/notificationViewerSanitize");
const { isAllowedByPreferences } = require("../utils/notificationPreferenceRules");
const { getUserNotificationPreferences } = require("./notificationPreferenceCache");
const realtimeHub = require("./notificationRealtimeHub");

function getRunner(client) {
  return client || pool;
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
    title: String(data.title || "").trim(),
    message: String(data.message || "").trim(),
    entityType: String(data.entityType || "").trim(),
    entityId: data.entityId != null ? Number(data.entityId) : null,
    link: data.link ? String(data.link).trim() : null,
    priority: String(data.priority || "medium").trim().toLowerCase(),
    metadata: data.metadata && typeof data.metadata === "object" ? data.metadata : {},
    dedupeKey: data.dedupeKey ? String(data.dedupeKey).trim() : null,
  };

  if (!Number.isInteger(out.recipientUserId) || out.recipientUserId < 1) {
    const err = new Error("recipientUserId is required.");
    err.statusCode = 400;
    throw err;
  }
  if (out.actorUserId != null && (!Number.isInteger(out.actorUserId) || out.actorUserId < 1)) {
    const err = new Error("actorUserId is invalid.");
    err.statusCode = 400;
    throw err;
  }
  if (!out.type || !out.title || !out.message || !out.entityType) {
    const err = new Error("type, title, message, and entityType are required.");
    err.statusCode = 400;
    throw err;
  }
  if (out.entityId != null && (!Number.isInteger(out.entityId) || out.entityId < 1)) {
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

async function createNotification(data, client) {
  const runner = getRunner(client);
  const input = normalizeCreateInput(data);
  const allowed = await shouldDeliverInApp(input);
  if (!allowed) return null;
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
      JSON.stringify(input.metadata || {}),
      input.dedupeKey,
    ],
  );
  const mapped = mapNotification(rows[0]);
  publishRealtime(mapped);
  return mapped;
}

async function createManyNotifications(items, client) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const runner = getRunner(client);
  const normalized = [];
  for (const item of items) {
    const input = normalizeCreateInput(item);
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
      JSON.stringify(item.metadata || {}),
      item.dedupeKey,
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11}::jsonb,$${base + 12})`;
  });
  const { rows } = await runner.query(
    `INSERT INTO notifications (
      recipient_user_id, recipient_role, actor_user_id, type, title, message,
      entity_type, entity_id, link, priority, metadata, dedupe_key
    ) VALUES ${placeholders.join(",")}
    RETURNING *`,
    values,
  );
  const mapped = rows.map(mapNotification);
  mapped.forEach(publishRealtime);
  return mapped;
}

async function createIfNotExists(data, dedupeKey, client) {
  const runner = getRunner(client);
  const input = normalizeCreateInput({ ...data, dedupeKey: dedupeKey || data?.dedupeKey || null });
  const allowed = await shouldDeliverInApp(input);
  if (!allowed) return null;
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
      JSON.stringify(input.metadata || {}),
      input.dedupeKey,
    ],
  );
  if (rows[0]) {
    const mapped = mapNotification(rows[0]);
    publishRealtime(mapped);
    return mapped;
  }
  if (!input.dedupeKey) return null;
  const existing = await runner.query(`SELECT * FROM notifications WHERE dedupe_key = $1 LIMIT 1`, [input.dedupeKey]);
  return mapNotification(existing.rows[0] || null);
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

module.exports = {
  createNotification,
  createManyNotifications,
  createIfNotExists,
  markAsRead,
  markAllAsRead,
  getUserNotifications,
  getUnreadCount,
  sanitizeNotificationForViewer,
};
