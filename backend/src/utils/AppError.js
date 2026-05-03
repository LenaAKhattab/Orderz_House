/**
 * Application error with an explicit safe message for API clients.
 * Set exposeToClient: true only when message is user-facing (no secrets, no vendor internals).
 *
 * @param {string} message Safe text for JSON `message` when exposeToClient is true
 * @param {number} [statusCode=500]
 * @param {{ exposeToClient?: boolean, publicCode?: string, cause?: unknown }} [options]
 */
function createAppError(message, statusCode = 500, options = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (options.exposeToClient === true) {
    err.exposeToClient = true;
  }
  if (options.publicCode) {
    err.publicCode = options.publicCode;
  }
  if (options.cause !== undefined) {
    err.cause = options.cause;
  }
  return err;
}

module.exports = { createAppError };
