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

/**
 * Batched variant: one query for all cache misses. Returns Map<userId, prefs>.
 * `runner` lets a caller inside a transaction read through the same connection.
 */
async function getManyUserNotificationPreferences(userIds, runner = pool) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const now = Date.now();
  const out = new Map();
  const misses = [];
  for (const uid of ids) {
    const hit = cache.get(uid);
    if (hit && hit.expires > now) out.set(uid, hit.prefs);
    else misses.push(uid);
  }
  if (misses.length) {
    const { rows } = await runner.query(
      `SELECT id, notification_preferences FROM users WHERE id = ANY($1::bigint[])`,
      [misses],
    );
    const byId = new Map(rows.map((r) => [Number(r.id), r.notification_preferences]));
    for (const uid of misses) {
      const raw = byId.get(uid);
      const prefs = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      // Only committed reads go into the shared cache (a transaction may still roll back).
      if (runner === pool) cache.set(uid, { prefs, expires: now + TTL_MS });
      out.set(uid, prefs);
    }
  }
  return out;
}

function invalidateUserNotificationPreferences(userId) {
  const uid = Number(userId);
  if (Number.isInteger(uid) && uid > 0) cache.delete(uid);
}

module.exports = {
  getUserNotificationPreferences,
  getManyUserNotificationPreferences,
  invalidateUserNotificationPreferences,
};
