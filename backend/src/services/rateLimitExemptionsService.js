/**
 * Per-user rate limit exemptions (Super Admin managed).
 * Fail closed on DB errors. Short in-memory cache; invalidate on write/revoke.
 */

const { pool } = require("../config/db");
const { logRateLimitExemptionUsed, logRateLimitExemptionAudit } = require("../utils/rateLimitLog");

const ALLOWED_SCOPES = Object.freeze([
  "order_create",
  "fake_order_create",
  "training_bulk",
  "admin_write",
]);

/** Scopes that must never be exemptable (documented + validated). */
const FORBIDDEN_SCOPES = Object.freeze([
  "auth_login",
  "auth_register",
  "otp",
  "reset_password",
  "password_change",
  "deactivate_account",
  "payment",
  "stripe",
  "webhook",
  "global_api",
]);

const ALLOWED_MODES = Object.freeze(["bypass", "increased_limit"]);

const CACHE_TTL_MS = Math.max(
  5_000,
  Number(process.env.RATE_LIMIT_EXEMPTION_CACHE_TTL_MS) || 45_000,
);

/** @type {Map<string, { expiresAtMs: number, value: object|null }>} */
const cache = new Map();

function cacheKey(userId, scope) {
  return `${userId}:${scope}`;
}

function invalidateUserCache(userId) {
  const prefix = `${Number(userId)}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function invalidateAllCache() {
  cache.clear();
}

function getRunner(client) {
  return client || pool;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    scope: row.scope,
    mode: row.mode,
    maxPerMinute: row.max_per_minute != null ? Number(row.max_per_minute) : null,
    maxPerHour: row.max_per_hour != null ? Number(row.max_per_hour) : null,
    expiresAt: row.expires_at || null,
    reason: row.reason,
    notes: row.notes || null,
    isActive: Boolean(row.is_active),
    createdBy: row.created_by != null ? String(row.created_by) : null,
    revokedAt: row.revoked_at || null,
    revokedBy: row.revoked_by != null ? String(row.revoked_by) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    userEmail: row.user_email || null,
    userDisplayName: row.user_display_name || null,
  };
}

function isExpired(row, now = new Date()) {
  if (!row?.expires_at && !row?.expiresAt) return false;
  const exp = new Date(row.expires_at || row.expiresAt);
  return Number.isFinite(exp.getTime()) && exp.getTime() <= now.getTime();
}

/**
 * Active exemption for user+scope, or null. Fail closed on errors.
 */
async function findActiveExemption(userId, scope, client) {
  const uid = Number(userId);
  const sc = String(scope || "").trim();
  if (!Number.isInteger(uid) || uid < 1 || !ALLOWED_SCOPES.includes(sc)) return null;

  const key = cacheKey(uid, sc);
  const hit = cache.get(key);
  const nowMs = Date.now();
  if (hit && hit.expiresAtMs > nowMs) {
    return hit.value;
  }

  try {
    const runner = getRunner(client);
    const { rows } = await runner.query(
      `SELECT *
       FROM rate_limit_exemptions
       WHERE user_id = $1
         AND scope = $2
         AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC
       LIMIT 1`,
      [uid, sc],
    );
    const value = mapRow(rows[0] || null);
    cache.set(key, { expiresAtMs: nowMs + CACHE_TTL_MS, value });
    return value;
  } catch (err) {
    // Fail closed — do not bypass.
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        event: "rate_limit_exemption_lookup_failed",
        userId: String(uid),
        scope: sc,
        message: String(err?.message || err).slice(0, 160),
        timestamp: new Date().toISOString(),
      }),
    );
    cache.set(key, { expiresAtMs: nowMs + Math.min(10_000, CACHE_TTL_MS), value: null });
    return null;
  }
}

/**
 * express-rate-limit skip helper for a given exemption scope.
 * Logs rate_limit_exemption_used at most once per request via req flag.
 */
function createExemptionSkip(scope) {
  return async function skipIfExempt(req) {
    const uid = req?.auth?.userId;
    if (uid == null) return false;
    const exemption = await findActiveExemption(uid, scope);
    if (!exemption || exemption.mode !== "bypass") return false;
    const flag = `_rleLogged_${scope}`;
    if (!req[flag]) {
      req[flag] = true;
      try {
        logRateLimitExemptionUsed({
          req,
          scope,
          exemptionId: exemption.id,
          mode: exemption.mode,
        });
      } catch {
        /* ignore */
      }
    }
    return true;
  };
}

/**
 * Dynamic max for increased_limit mode. Returns null to use default limiter max.
 */
async function resolveIncreasedMax(req, scope, { defaultMax, windowKind }) {
  const uid = req?.auth?.userId;
  if (uid == null) return null;
  const exemption = await findActiveExemption(uid, scope);
  if (!exemption || exemption.mode !== "increased_limit") return null;

  let next = null;
  if (windowKind === "hour" && exemption.maxPerHour != null) next = exemption.maxPerHour;
  else if (windowKind === "minute" && exemption.maxPerMinute != null) next = exemption.maxPerMinute;
  else if (exemption.maxPerMinute != null) next = exemption.maxPerMinute;
  else if (exemption.maxPerHour != null && windowKind === "hour") next = exemption.maxPerHour;
  else next = Math.max(defaultMax * 10, defaultMax + 1);

  const flag = `_rleLogged_${scope}`;
  if (!req[flag]) {
    req[flag] = true;
    try {
      logRateLimitExemptionUsed({
        req,
        scope,
        exemptionId: exemption.id,
        mode: exemption.mode,
      });
    } catch {
      /* ignore */
    }
  }
  return next;
}

function createExemptionMax(scope, defaultMax, windowKind = "minute") {
  const base = Number(defaultMax) || 1;
  return async function maxForReq(req) {
    try {
      const increased = await resolveIncreasedMax(req, scope, {
        defaultMax: base,
        windowKind,
      });
      if (increased != null && Number.isFinite(increased) && increased >= 1) {
        return Math.floor(increased);
      }
    } catch {
      /* fail closed → default */
    }
    return base;
  };
}

async function assertUserExists(userId, client) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("معرّف المستخدم غير صالح.");
    err.statusCode = 400;
    err.code = "INVALID_USER_ID";
    throw err;
  }
  const runner = getRunner(client);
  const { rows } = await runner.query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [uid]);
  if (!rows[0]) {
    const err = new Error("المستخدم غير موجود.");
    err.statusCode = 404;
    err.code = "USER_NOT_FOUND";
    throw err;
  }
  return uid;
}

function normalizeCreateInput(body = {}) {
  const userId = Number(body.userId ?? body.user_id);
  const scope = String(body.scope || "").trim();
  const mode = String(body.mode || "bypass").trim().toLowerCase();
  const reason = String(body.reason || "").trim();
  const notes = body.notes != null ? String(body.notes).trim().slice(0, 2000) : null;
  const allowNoExpiry = body.allowNoExpiry === true || body.confirmPermanent === true;

  if (FORBIDDEN_SCOPES.includes(scope) || !ALLOWED_SCOPES.includes(scope)) {
    const err = new Error("نطاق الاستثناء غير مسموح.");
    err.statusCode = 400;
    err.code = "INVALID_SCOPE";
    throw err;
  }
  if (!ALLOWED_MODES.includes(mode)) {
    const err = new Error("وضع الاستثناء غير صالح.");
    err.statusCode = 400;
    err.code = "INVALID_MODE";
    throw err;
  }
  if (!reason || reason.length < 5) {
    const err = new Error("سبب الاستثناء مطلوب (5 أحرف على الأقل).");
    err.statusCode = 400;
    err.code = "REASON_REQUIRED";
    throw err;
  }

  let expiresAt = null;
  if (body.expiresAt != null && String(body.expiresAt).trim() !== "") {
    const d = new Date(body.expiresAt);
    if (!Number.isFinite(d.getTime())) {
      const err = new Error("تاريخ الانتهاء غير صالح.");
      err.statusCode = 400;
      err.code = "INVALID_EXPIRES_AT";
      throw err;
    }
    if (d.getTime() <= Date.now()) {
      const err = new Error("تاريخ الانتهاء يجب أن يكون في المستقبل.");
      err.statusCode = 400;
      err.code = "EXPIRES_IN_PAST";
      throw err;
    }
    expiresAt = d.toISOString();
  } else if (!allowNoExpiry) {
    const err = new Error(
      "يُفضّل تحديد تاريخ انتهاء. لتأكيد استثناء دائم أرسل confirmPermanent: true مع السبب.",
    );
    err.statusCode = 400;
    err.code = "EXPIRES_AT_RECOMMENDED";
    throw err;
  }

  let maxPerMinute = null;
  let maxPerHour = null;
  if (body.maxPerMinute != null && body.maxPerMinute !== "") {
    maxPerMinute = Number(body.maxPerMinute);
    if (!Number.isInteger(maxPerMinute) || maxPerMinute < 1) {
      const err = new Error("maxPerMinute غير صالح.");
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.maxPerHour != null && body.maxPerHour !== "") {
    maxPerHour = Number(body.maxPerHour);
    if (!Number.isInteger(maxPerHour) || maxPerHour < 1) {
      const err = new Error("maxPerHour غير صالح.");
      err.statusCode = 400;
      throw err;
    }
  }
  if (mode === "increased_limit" && maxPerMinute == null && maxPerHour == null) {
    // Allowed — runtime uses 10× default; document in API response warning.
  }

  return {
    userId,
    scope,
    mode,
    reason: reason.slice(0, 1000),
    notes,
    expiresAt,
    maxPerMinute,
    maxPerHour,
    permanent: !expiresAt,
  };
}

async function listExemptions({ includeInactive = false, userId = null } = {}, client) {
  const runner = getRunner(client);
  const params = [];
  const where = [];
  if (!includeInactive) {
    where.push("e.is_active = TRUE");
  }
  if (userId != null && String(userId).trim() !== "") {
    params.push(Number(userId));
    where.push(`e.user_id = $${params.length}`);
  }
  const sql = `
    SELECT e.*,
           u.email AS user_email,
           NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.father_name, u.family_name)), '') AS user_display_name
    FROM rate_limit_exemptions e
    JOIN users u ON u.id = e.user_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY e.is_active DESC, e.created_at DESC
    LIMIT 500`;
  const { rows } = await runner.query(sql, params);
  return rows.map(mapRow);
}

async function createExemption(body, actorUserId, client) {
  const input = normalizeCreateInput(body);
  const uid = await assertUserExists(input.userId, client);
  const actor = Number(actorUserId);
  const runner = getRunner(client);

  // Soft-deactivate prior active rows for same user+scope to keep one active.
  await runner.query(
    `UPDATE rate_limit_exemptions
     SET is_active = FALSE,
         revoked_at = COALESCE(revoked_at, NOW()),
         revoked_by = COALESCE(revoked_by, $3),
         updated_at = NOW()
     WHERE user_id = $1 AND scope = $2 AND is_active = TRUE`,
    [uid, input.scope, Number.isInteger(actor) ? actor : null],
  );

  const { rows } = await runner.query(
    `INSERT INTO rate_limit_exemptions (
       user_id, scope, mode, max_per_minute, max_per_hour, expires_at,
       reason, notes, is_active, created_by, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,NOW(),NOW())
     RETURNING *`,
    [
      uid,
      input.scope,
      input.mode,
      input.maxPerMinute,
      input.maxPerHour,
      input.expiresAt,
      input.reason,
      input.notes,
      Number.isInteger(actor) && actor > 0 ? actor : null,
    ],
  );

  invalidateUserCache(uid);
  const mapped = mapRow(rows[0]);
  logRateLimitExemptionAudit({
    event: "rate_limit_exemption_created",
    exemptionId: mapped.id,
    userId: mapped.userId,
    scope: mapped.scope,
    mode: mapped.mode,
    actorUserId: actor,
    permanent: input.permanent,
  });
  return { ...mapped, warning: input.permanent ? "permanent_exemption_no_expires_at" : null };
}

async function updateExemption(id, body, actorUserId, client) {
  const eid = Number(id);
  if (!Number.isInteger(eid) || eid < 1) {
    const err = new Error("معرّف الاستثناء غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const runner = getRunner(client);
  const existing = await runner.query(`SELECT * FROM rate_limit_exemptions WHERE id = $1`, [eid]);
  if (!existing.rows[0]) {
    const err = new Error("الاستثناء غير موجود.");
    err.statusCode = 404;
    throw err;
  }
  if (!existing.rows[0].is_active) {
    const err = new Error("لا يمكن تعديل استثناء ملغى. أنشئ استثناءً جديدًا.");
    err.statusCode = 400;
    throw err;
  }

  const patch = {};
  if (body.mode != null) {
    const mode = String(body.mode).trim().toLowerCase();
    if (!ALLOWED_MODES.includes(mode)) {
      const err = new Error("وضع الاستثناء غير صالح.");
      err.statusCode = 400;
      throw err;
    }
    patch.mode = mode;
  }
  if (body.reason != null) {
    const reason = String(body.reason).trim();
    if (reason.length < 5) {
      const err = new Error("سبب الاستثناء مطلوب.");
      err.statusCode = 400;
      throw err;
    }
    patch.reason = reason.slice(0, 1000);
  }
  if (body.notes !== undefined) {
    patch.notes = body.notes == null ? null : String(body.notes).trim().slice(0, 2000);
  }
  if (body.expiresAt !== undefined) {
    if (body.expiresAt == null || String(body.expiresAt).trim() === "") {
      if (body.confirmPermanent !== true && body.allowNoExpiry !== true) {
        const err = new Error("لمسح تاريخ الانتهاء يلزم confirmPermanent: true.");
        err.statusCode = 400;
        throw err;
      }
      patch.expires_at = null;
    } else {
      const d = new Date(body.expiresAt);
      if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now()) {
        const err = new Error("تاريخ الانتهاء غير صالح.");
        err.statusCode = 400;
        throw err;
      }
      patch.expires_at = d.toISOString();
    }
  }
  if (body.maxPerMinute !== undefined) {
    patch.max_per_minute =
      body.maxPerMinute == null || body.maxPerMinute === ""
        ? null
        : Math.floor(Number(body.maxPerMinute));
  }
  if (body.maxPerHour !== undefined) {
    patch.max_per_hour =
      body.maxPerHour == null || body.maxPerHour === ""
        ? null
        : Math.floor(Number(body.maxPerHour));
  }

  const sets = [];
  const params = [];
  Object.entries(patch).forEach(([col, val]) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  });
  if (!sets.length) {
    return mapRow(existing.rows[0]);
  }
  params.push(eid);
  sets.push("updated_at = NOW()");
  const { rows } = await runner.query(
    `UPDATE rate_limit_exemptions SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  invalidateUserCache(rows[0].user_id);
  logRateLimitExemptionAudit({
    event: "rate_limit_exemption_updated",
    exemptionId: String(rows[0].id),
    userId: String(rows[0].user_id),
    scope: rows[0].scope,
    mode: rows[0].mode,
    actorUserId: actorUserId,
  });
  return mapRow(rows[0]);
}

async function revokeExemption(id, actorUserId, client) {
  const eid = Number(id);
  if (!Number.isInteger(eid) || eid < 1) {
    const err = new Error("معرّف الاستثناء غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const runner = getRunner(client);
  const actor = Number(actorUserId);
  const { rows } = await runner.query(
    `UPDATE rate_limit_exemptions
     SET is_active = FALSE,
         revoked_at = NOW(),
         revoked_by = $2,
         updated_at = NOW()
     WHERE id = $1 AND is_active = TRUE
     RETURNING *`,
    [eid, Number.isInteger(actor) && actor > 0 ? actor : null],
  );
  if (!rows[0]) {
    const err = new Error("الاستثناء غير موجود أو ملغى مسبقًا.");
    err.statusCode = 404;
    throw err;
  }
  invalidateUserCache(rows[0].user_id);
  const mapped = mapRow(rows[0]);
  logRateLimitExemptionAudit({
    event: "rate_limit_exemption_revoked",
    exemptionId: mapped.id,
    userId: mapped.userId,
    scope: mapped.scope,
    mode: mapped.mode,
    actorUserId: actor,
  });
  return mapped;
}

async function searchUsersForExemption(q, client) {
  const query = String(q || "").trim();
  if (query.length < 2) return [];
  const runner = getRunner(client);
  const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
  const { rows } = await runner.query(
    `SELECT id, email,
            NULLIF(TRIM(CONCAT_WS(' ', first_name, father_name, family_name)), '') AS display_name,
            role
     FROM users
     WHERE email ILIKE $1 ESCAPE '\\'
        OR CAST(id AS TEXT) = $2
        OR CONCAT_WS(' ', first_name, father_name, family_name) ILIKE $1 ESCAPE '\\'
     ORDER BY id DESC
     LIMIT 20`,
    [like, query],
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: r.email,
    displayName: r.display_name || r.email,
    primaryRole: r.role || null,
  }));
}

module.exports = {
  ALLOWED_SCOPES,
  FORBIDDEN_SCOPES,
  ALLOWED_MODES,
  CACHE_TTL_MS,
  findActiveExemption,
  createExemptionSkip,
  createExemptionMax,
  listExemptions,
  createExemption,
  updateExemption,
  revokeExemption,
  searchUsersForExemption,
  invalidateUserCache,
  invalidateAllCache,
  normalizeCreateInput,
  isExpired,
  mapRow,
};
