/**
 * Detect mobile API clients via explicit header only (not User-Agent).
 * Web clients omit X-Client-Type and keep HttpOnly cookie auth.
 */
function isMobileClient(req) {
  const raw = req?.headers?.["x-client-type"];
  if (raw == null || raw === "") return false;
  return String(raw).trim().toLowerCase() === "mobile";
}

module.exports = {
  isMobileClient,
};
