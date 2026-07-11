/**
 * Public origin for API-hosted routes (e.g. mobile Stripe return bridge).
 * CLIENT_URL is the SPA (Vite); it does not proxy /mobile/* to this API.
 */
function getBackendPublicUrl() {
  const raw = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  const port = String(process.env.PORT || "5000").trim() || "5000";
  return `http://localhost:${port}`;
}

module.exports = { getBackendPublicUrl };
