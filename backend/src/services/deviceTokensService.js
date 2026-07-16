const { pool } = require("../config/db");

const MAX_TOKEN_LEN = 4096;
const ALLOWED_PLATFORMS = new Set(["android", "ios", "web"]);

function getRunner(client) {
  return client || pool;
}

function maskToken(token) {
  const t = String(token || "");
  if (t.length < 12) return "[redacted]";
  return `${t.slice(0, 4)}…${t.slice(-4)}`;
}

function normalizeUpsertInput(body = {}) {
  const token = String(body.token || "").trim();
  const platform = String(body.platform || "android").trim().toLowerCase();
  const deviceId = body.deviceId != null ? String(body.deviceId).trim().slice(0, 120) : null;
  const appVersion = body.appVersion != null ? String(body.appVersion).trim().slice(0, 40) : null;

  if (!token || token.length < 20 || token.length > MAX_TOKEN_LEN) {
    const err = new Error("رمز جهاز الإشعارات غير صالح.");
    err.statusCode = 400;
    err.code = "INVALID_PUSH_TOKEN";
    throw err;
  }
  if (!ALLOWED_PLATFORMS.has(platform)) {
    const err = new Error("منصة الجهاز غير مدعومة.");
    err.statusCode = 400;
    err.code = "INVALID_PLATFORM";
    throw err;
  }

  return {
    token,
    platform,
    deviceId: deviceId || null,
    appVersion: appVersion || null,
  };
}

/**
 * Upsert an FCM token for the authenticated user.
 * Same token moves to the current user if previously owned by another account.
 */
async function upsertPushToken(userId, body, client) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("معرّف المستخدم غير صالح.");
    err.statusCode = 401;
    throw err;
  }
  const input = normalizeUpsertInput(body);
  const runner = getRunner(client);

  const { rows } = await runner.query(
    `INSERT INTO user_device_tokens (
       user_id, token, platform, device_id, app_version, is_active, last_seen_at, revoked_at, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NULL, NOW(), NOW())
     ON CONFLICT (token) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       platform = EXCLUDED.platform,
       device_id = COALESCE(EXCLUDED.device_id, user_device_tokens.device_id),
       app_version = COALESCE(EXCLUDED.app_version, user_device_tokens.app_version),
       is_active = TRUE,
       last_seen_at = NOW(),
       revoked_at = NULL,
       updated_at = NOW()
     RETURNING id, user_id, platform, device_id, app_version, is_active, last_seen_at, created_at, updated_at`,
    [uid, input.token, input.platform, input.deviceId, input.appVersion],
  );

  return {
    id: String(rows[0].id),
    userId: String(rows[0].user_id),
    platform: rows[0].platform,
    deviceId: rows[0].device_id || null,
    appVersion: rows[0].app_version || null,
    isActive: Boolean(rows[0].is_active),
    lastSeenAt: rows[0].last_seen_at,
  };
}

async function deactivatePushToken(userId, token, client) {
  const uid = Number(userId);
  const t = String(token || "").trim();
  if (!Number.isInteger(uid) || uid < 1 || !t) {
    const err = new Error("طلب إلغاء رمز الجهاز غير صالح.");
    err.statusCode = 400;
    throw err;
  }
  const runner = getRunner(client);
  const { rowCount } = await runner.query(
    `UPDATE user_device_tokens
     SET is_active = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1 AND token = $2 AND is_active = TRUE`,
    [uid, t],
  );
  return { deactivated: rowCount > 0 };
}

async function deactivateAllPushTokensForUser(userId, client) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return { deactivated: 0 };
  const runner = getRunner(client);
  const { rowCount } = await runner.query(
    `UPDATE user_device_tokens
     SET is_active = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE user_id = $1 AND is_active = TRUE`,
    [uid],
  );
  return { deactivated: rowCount || 0 };
}

async function listActiveTokensForUser(userId, client) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return [];
  const runner = getRunner(client);
  const { rows } = await runner.query(
    `SELECT id, token, platform
     FROM user_device_tokens
     WHERE user_id = $1 AND is_active = TRUE
     ORDER BY last_seen_at DESC`,
    [uid],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    token: r.token,
    platform: r.platform,
  }));
}

async function deactivateTokensByValues(tokens, client) {
  const list = (Array.isArray(tokens) ? tokens : [])
    .map((t) => String(t || "").trim())
    .filter((t) => t.length >= 20);
  if (!list.length) return 0;
  const runner = getRunner(client);
  const { rowCount } = await runner.query(
    `UPDATE user_device_tokens
     SET is_active = FALSE,
         revoked_at = NOW(),
         updated_at = NOW()
     WHERE token = ANY($1::text[]) AND is_active = TRUE`,
    [list],
  );
  return rowCount || 0;
}

module.exports = {
  MAX_TOKEN_LEN,
  ALLOWED_PLATFORMS,
  maskToken,
  normalizeUpsertInput,
  upsertPushToken,
  deactivatePushToken,
  deactivateAllPushTokensForUser,
  listActiveTokensForUser,
  deactivateTokensByValues,
};
