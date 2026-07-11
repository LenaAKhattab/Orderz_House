const LOGIN_SESSION_KEY_PREFIX = "orderzhouse_login_session_id_";

/**
 * @param {string|number} userId
 */
export function getLoginSessionStorageKey(userId) {
  return `${LOGIN_SESSION_KEY_PREFIX}${userId}`;
}

/**
 * Create a new login-session id after explicit login success (not page refresh/bootstrap).
 * @param {string|number} userId
 * @returns {string|null}
 */
export function createLoginSessionId(userId) {
  if (userId == null || userId === "" || typeof sessionStorage === "undefined") return null;
  const sessionId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  sessionStorage.setItem(getLoginSessionStorageKey(userId), sessionId);
  return sessionId;
}

/**
 * @param {string|number|null|undefined} userId
 * @returns {string|null}
 */
export function getLoginSessionId(userId) {
  if (userId == null || userId === "" || typeof sessionStorage === "undefined") return null;
  const value = sessionStorage.getItem(getLoginSessionStorageKey(userId));
  return value && String(value).trim() ? String(value).trim() : null;
}

/**
 * @param {string|number|null|undefined} userId
 */
export function clearLoginSessionId(userId) {
  if (userId == null || userId === "" || typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(getLoginSessionStorageKey(userId));
}
