const { pool } = require("../config/db");

/** @type {Map<number, { prefs: object, expires: number }>} */
const cache = new Map();
const TTL_MS = 60_000;

async function getUserNotificationPreferences(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return {};
  const now = Date.now();
  const hit = cache.get(uid);
  if (hit && hit.expires > now) return hit.prefs;

  const { rows } = await pool.query(
    `SELECT notification_preferences FROM users WHERE id = $1::bigint LIMIT 1`,
    [uid],
  );
  const raw = rows[0]?.notification_preferences;
  const prefs = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  cache.set(uid, { prefs, expires: now + TTL_MS });
  return prefs;
}

function invalidateUserNotificationPreferences(userId) {
  const uid = Number(userId);
  if (Number.isInteger(uid) && uid > 0) cache.delete(uid);
}

module.exports = {
  getUserNotificationPreferences,
  invalidateUserNotificationPreferences,
};
