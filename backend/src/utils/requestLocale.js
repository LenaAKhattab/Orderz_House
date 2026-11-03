/** Locales supported for OTP email copy (matches frontend SUPPORTED_LOCALES). */
const OTP_EMAIL_LOCALES = new Set(["ar", "en", "de", "nl", "ro"]);

const DEFAULT_OTP_EMAIL_LOCALE = "ar";

function normalizeOtpEmailLocale(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (OTP_EMAIL_LOCALES.has(s)) return s;
  const primary = s.split("-")[0];
  if (OTP_EMAIL_LOCALES.has(primary)) return primary;
  return null;
}

/**
 * Resolve locale for outbound OTP emails: explicit body/query > Accept-Language > default (ar).
 * @param {import("express").Request} [req]
 * @param {string} [explicitLocale] from req.body.locale or similar
 */
function resolveRequestLocale(req, explicitLocale) {
  const fromExplicit = normalizeOtpEmailLocale(explicitLocale);
  if (fromExplicit) return fromExplicit;

  const header = req?.headers?.["accept-language"];
  if (header) {
    const parts = String(header)
      .split(",")
      .map((p) => p.trim().split(";")[0].trim())
      .filter(Boolean);
    for (const part of parts) {
      const n = normalizeOtpEmailLocale(part);
      if (n) return n;
    }
  }

  return DEFAULT_OTP_EMAIL_LOCALE;
}

module.exports = {
  resolveRequestLocale,
  normalizeOtpEmailLocale,
  DEFAULT_OTP_EMAIL_LOCALE,
};
