const { pool } = require("../config/db");
const {
  getSystemContentTranslations,
  isSystemContentLocale,
} = require("../services/systemContentTranslationsService");

/**
 * GET /api/i18n/system-content/:locale — German / Dutch / Romanian translation memory for system content.
 * Public (system content is public copy), allowlisted locales only, cacheable (ETag + short max-age).
 */
async function getSystemContent(req, res, next) {
  try {
    const locale = String(req.params.locale || "");
    if (!isSystemContentLocale(locale)) {
      return res.status(400).json({ success: false, code: "UNSUPPORTED_LOCALE", message: "Unsupported locale." });
    }
    const data = await getSystemContentTranslations(pool, locale);
    res.set("Cache-Control", "public, max-age=300");
    res.set("ETag", data.etag);
    if (req.headers["if-none-match"] === data.etag) return res.status(304).end();
    return res.status(200).json({ success: true, locale: data.locale, count: data.count, entries: data.entries });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSystemContent };
