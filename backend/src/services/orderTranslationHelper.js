const { pool } = require("../config/db");
const { translateText } = require("./translationService");

const TABLES = Object.freeze({
  orders: "orders",
  fake_orders: "fake_orders",
  fake_order_templates: "fake_order_templates",
});

/**
 * @param {string} source
 * @param {{ translatedText?: string; fallback?: boolean }} result
 * @returns {string | null}
 */
function pickEnglishTranslation(source, result) {
  const src = String(source || "").trim();
  const out = String(result?.translatedText || "").trim();
  if (!out || result?.fallback) return null;
  if (out === src) return null;
  return out;
}

/**
 * Generate cached English fields from Arabic source content.
 *
 * @param {string | null | undefined} title
 * @param {string | null | undefined} description
 * @returns {Promise<{ titleEn: string | null; descriptionEn: string | null }>}
 */
async function generateEnglishTranslations(title, description) {
  const titleSrc = String(title || "").trim();
  const descSrc = String(description || "").trim();

  const [titleResult, descResult] = await Promise.all([
    titleSrc ? translateText(titleSrc, { sourceLang: "ar", targetLang: "en" }) : Promise.resolve(null),
    descSrc ? translateText(descSrc, { sourceLang: "ar", targetLang: "en" }) : Promise.resolve(null),
  ]);

  return {
    titleEn: titleResult ? pickEnglishTranslation(titleSrc, titleResult) : null,
    descriptionEn: descResult ? pickEnglishTranslation(descSrc, descResult) : null,
  };
}

/**
 * @param {"orders" | "fake_orders" | "fake_order_templates"} table
 * @param {number} id
 * @param {{ title?: string; description?: string }} content
 */
async function persistCachedTranslations(table, id, { title, description }) {
  const tableName = TABLES[table];
  if (!tableName) return { saved: false, reason: "invalid_table" };

  const oid = Number(id);
  if (!Number.isInteger(oid) || oid < 1) return { saved: false, reason: "invalid_id" };

  const { titleEn, descriptionEn } = await generateEnglishTranslations(title, description);
  if (!titleEn && !descriptionEn) return { saved: false, reason: "no_translation" };

  await pool.query(
    `UPDATE ${tableName}
     SET title_en = COALESCE($2, title_en),
         description_en = COALESCE($3, description_en),
         updated_at = NOW()
     WHERE id = $1`,
    [oid, titleEn, descriptionEn],
  );

  return { saved: true, titleEn, descriptionEn };
}

function scheduleCachedTranslations(table, id, title, description) {
  setImmediate(() => {
    void persistCachedTranslations(table, id, { title, description }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[orderTranslation] failed to cache ${table}#${id}:`, err?.message || err);
    });
  });
}

function scheduleRealOrderTranslation(orderId, title, description) {
  scheduleCachedTranslations("orders", orderId, title, description);
}

function scheduleFakeOrderTranslation(fakeOrderId, title, description) {
  scheduleCachedTranslations("fake_orders", fakeOrderId, title, description);
}

function scheduleTemplateTranslation(templateId, title, description) {
  scheduleCachedTranslations("fake_order_templates", templateId, title, description);
}

/**
 * Map nullable DB columns to API fields (omit when empty).
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {{ title_en?: string; description_en?: string }}
 */
function mapCachedEnglishFields(row) {
  const titleEn = row?.title_en != null ? String(row.title_en).trim() : "";
  const descriptionEn = row?.description_en != null ? String(row.description_en).trim() : "";
  const out = {};
  if (titleEn) out.title_en = titleEn;
  if (descriptionEn) out.description_en = descriptionEn;
  return out;
}

module.exports = {
  generateEnglishTranslations,
  persistCachedTranslations,
  scheduleRealOrderTranslation,
  scheduleFakeOrderTranslation,
  scheduleTemplateTranslation,
  mapCachedEnglishFields,
};
