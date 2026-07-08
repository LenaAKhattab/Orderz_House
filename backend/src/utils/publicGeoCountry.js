/** ISO codes that edge proxies use for unknown / test traffic — not real countries. */
const INVALID_GEO_COUNTRY_CODES = new Set(["XX", "T1"]);

/**
 * @param {string | null | undefined} raw
 * @returns {string | null} Uppercase ISO 3166-1 alpha-2 or null
 */
function normalizePublicGeoCountryCode(raw) {
  if (raw == null || raw === "") return null;
  const code = String(raw).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  if (INVALID_GEO_COUNTRY_CODES.has(code)) return null;
  return code;
}

/**
 * Read visitor country from trusted proxy / internal test headers only (no IP lookup).
 *
 * @param {import('express').Request} req
 * @returns {{ countryCode: string | null; source: string }}
 */
function resolvePublicGeoFromRequest(req) {
  const candidates = [
    { header: "cf-ipcountry", source: "cf-ipcountry" },
    { header: "x-vercel-ip-country", source: "x-vercel-ip-country" },
    { header: "x-country-code", source: "x-country-code" },
  ];

  for (const { header, source } of candidates) {
    const raw = req.headers[header];
    const countryCode = normalizePublicGeoCountryCode(raw);
    if (countryCode) {
      return { countryCode, source };
    }
  }

  return { countryCode: null, source: "unknown" };
}

module.exports = {
  normalizePublicGeoCountryCode,
  resolvePublicGeoFromRequest,
  INVALID_GEO_COUNTRY_CODES,
};
