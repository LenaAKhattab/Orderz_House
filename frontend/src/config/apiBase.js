/**
 * Browser API base path/URL.
 *
 * Production (and same-origin deploys): default `/api` so the page origin owns
 * API calls (https://orderzhouse.com/api/...). Avoids baking an absolute domain
 * into the SPA and removes www→apex cross-origin CORS failures.
 *
 * Override with VITE_API_BASE_URL when the API is on a different host (rare).
 * Local Vite: leave unset and use the `/api` → localhost:5000 proxy.
 */
export function getApiBaseUrl() {
  const raw = import.meta.env.VITE_API_BASE_URL;
  if (raw != null && String(raw).trim() !== "") {
    const trimmed = String(raw).trim().replace(/\/$/, "");
    // Never ship a loopback API host in a production bundle (stale .env / mis-build).
    if (import.meta.env.PROD && /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[::1\])\b/i.test(trimmed)) {
      return "/api";
    }
    return trimmed;
  }
  return "/api";
}

/**
 * Origin used to resolve backend-relative asset paths (/images/..., /api/...).
 * For relative API bases, use the current page origin in the browser.
 */
export function getApiAssetOrigin() {
  const base = getApiBaseUrl();
  if (base.startsWith("/")) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin;
    }
    return "";
  }
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}
