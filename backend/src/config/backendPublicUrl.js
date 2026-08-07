/**
 * Public origin for API-hosted routes (e.g. mobile Stripe return bridge).
 * CLIENT_URL is the SPA (Vite); it does not proxy /mobile/* unless the reverse
 * proxy serves the API on the same host (typical for https://orderzhouse.com).
 */

function isProductionEnv() {
  return String(process.env.NODE_ENV || "").toLowerCase() === "production";
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || "")
    .trim()
    .toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0" || h === "10.0.2.2";
}

function isLoopbackOrigin(url) {
  try {
    const u = new URL(String(url || "").trim());
    return isLoopbackHostname(u.hostname);
  } catch {
    return /localhost|127\.0\.0\.1|10\.0\.2\.2/i.test(String(url || ""));
  }
}

function originFromUrl(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s.split(",")[0].trim());
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return s.replace(/\/$/, "");
  }
}

/**
 * Public HTTPS (or http in local) origin for Stripe mobile return bridge.
 * Never prefers localhost when a public CLIENT_URL / BACKEND_PUBLIC_URL exists.
 */
function getBackendPublicUrl() {
  const configured = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  // Same-host production: SPA origin often fronts /api and /mobile via nginx.
  const clientOrigin = originFromUrl(process.env.CLIENT_URL || "");
  const allowClientFallback =
    isProductionEnv() ||
    String(process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL || "")
      .trim()
      .toLowerCase() === "true" ||
    String(process.env.MOBILE_PAYMENT_BRIDGE_USE_CLIENT_URL || "").trim() === "1";

  if (
    allowClientFallback &&
    clientOrigin &&
    /^https:\/\//i.test(clientOrigin) &&
    !isLoopbackOrigin(clientOrigin)
  ) {
    return clientOrigin;
  }

  const port = String(process.env.PORT || "5000").trim() || "5000";
  return `http://localhost:${port}`;
}

/**
 * True when mobile Stripe return URLs would be unreachable from a phone browser.
 */
function isUnsafeMobileCheckoutPublicUrl(url) {
  return isLoopbackOrigin(url);
}

module.exports = {
  getBackendPublicUrl,
  isLoopbackOrigin,
  isUnsafeMobileCheckoutPublicUrl,
  isProductionEnv,
};
