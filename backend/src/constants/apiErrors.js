/**
 * Stable public API error codes + safe Arabic copy for clients.
 * Internal details belong in server logs only.
 */

/** Generic 5xx user-facing line (matches error middleware default). */
const GENERIC_5XX_AR = "حدث خطأ غير متوقع، حاول لاحقاً";

/** Default machine code when status alone is used to infer a code. */
function defaultCodeForHttpStatus(statusCode) {
  const s = Number(statusCode);
  if (s === 400) return "VALIDATION_ERROR";
  if (s === 401) return "UNAUTHORIZED";
  if (s === 403) return "FORBIDDEN";
  if (s === 404) return "NOT_FOUND";
  if (s === 409) return "CONFLICT";
  if (s === 429) return "RATE_LIMITED";
  if (s === 402) return "PAYMENT_NOT_COMPLETED";
  if (s === 502 || s === 503) return "SERVICE_UNAVAILABLE";
  if (s >= 500) return "INTERNAL_ERROR";
  return "ERROR";
}

module.exports = {
  GENERIC_5XX_AR,
  defaultCodeForHttpStatus,
};
