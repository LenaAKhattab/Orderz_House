/** Allowlisted UI locale from Accept-Language / body (payment telemetry). */
const ALLOWED = new Set(["ar", "en", "de", "nl", "ro"]);

function parseAllowlistedUiLocale(raw, fallback = null) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .split(",")[0]
    .split(";")[0]
    .trim()
    .slice(0, 5);
  if (ALLOWED.has(s)) return s;
  const base = s.split("-")[0];
  if (ALLOWED.has(base)) return base;
  return fallback;
}

function channelFromRequest(req) {
  const body = String(req?.body?.channel || "").trim().toLowerCase();
  if (body === "mobile" || body === "mobile_app" || body === "app") return "mobile";
  if (req?.body?.isMobile === true || req?.body?.isMobile === "1") return "mobile";
  return "web";
}

module.exports = { parseAllowlistedUiLocale, channelFromRequest, ALLOWED_UI_LOCALES: ALLOWED };
