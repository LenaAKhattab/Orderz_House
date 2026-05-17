/**
 * In-process SSE hub — one connection set per authenticated user id.
 * Safe for single-node deploy; reconnect + REST polling remain the fallback.
 */

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const connectionsByUser = new Map();

const HEARTBEAT_MS = 25000;

function userKey(userId) {
  return String(userId);
}

/**
 * @param {string | number} userId
 * @param {import('http').ServerResponse} res
 */
function subscribe(userId, res) {
  const key = userKey(userId);
  if (!connectionsByUser.has(key)) connectionsByUser.set(key, new Set());
  connectionsByUser.get(key).add(res);

  res.on("close", () => unsubscribe(userId, res));
  res.on("error", () => unsubscribe(userId, res));
}

/**
 * @param {string | number} userId
 * @param {import('http').ServerResponse} res
 */
function unsubscribe(userId, res) {
  const key = userKey(userId);
  const set = connectionsByUser.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connectionsByUser.delete(key);
}

/**
 * @param {string | number} userId
 * @param {object} payload — sanitized notification for client
 */
function publish(userId, payload) {
  const key = userKey(userId);
  const set = connectionsByUser.get(key);
  if (!set || set.size === 0) return;

  const data = JSON.stringify({
    event: "notification",
    notification: payload,
    unreadDelta: payload?.isRead ? 0 : 1,
  });
  const chunk = `event: notification\ndata: ${data}\n\n`;

  for (const res of [...set]) {
    try {
      if (res.writableEnded) {
        unsubscribe(userId, res);
        continue;
      }
      res.write(chunk);
    } catch {
      unsubscribe(userId, res);
    }
  }
}

function publishHeartbeat(res) {
  try {
    res.write(`: ping ${Date.now()}\n\n`);
  } catch {
    /* closed */
  }
}

function startHeartbeat(res) {
  const id = setInterval(() => publishHeartbeat(res), HEARTBEAT_MS);
  res.on("close", () => clearInterval(id));
}

function connectionCount(userId) {
  return connectionsByUser.get(userKey(userId))?.size || 0;
}

module.exports = {
  subscribe,
  unsubscribe,
  publish,
  startHeartbeat,
  connectionCount,
};
