const { createAppError } = require("./AppError");

/**
 * User-facing Arabic error with stable public code (sent when exposeToClient is implied).
 */
function createPublicApiError(messageAr, statusCode, publicCode, cause) {
  return createAppError(messageAr, statusCode, {
    exposeToClient: true,
    publicCode,
    ...(cause !== undefined ? { cause } : {}),
  });
}

module.exports = { createPublicApiError };
