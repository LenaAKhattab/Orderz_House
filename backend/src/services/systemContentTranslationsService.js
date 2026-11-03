/**
 * German / Dutch / Romanian translations of SYSTEM-authored DB content (translation memory).
 *
 * Arabic / English keep their columns (`field` / `field_en`). For the new locales the SPA loads one map
 * { source_hash → translation } per locale and resolves each field from its source text (English, else Arabic).
 * Every translation is indexed under the hash of BOTH sources (English and Arabic) when both exist, so the
 * lookup succeeds whichever source a UI path reads.
 *
 * User-generated content is never part of SYSTEM_CONTENT_SOURCES.
 */

const crypto = require("crypto");
const { systemContentHash, normalizeSystemContentSource } = require("../utils/systemContentHash");

const SYSTEM_CONTENT_LOCALES = Object.freeze(["de", "nl", "ro"]);
const CACHE_TTL_MS = 5 * 60 * 1000;
const UPSERT_BATCH = 200;

/**
 * Visible system content that a German / Dutch / Romanian page renders.
 * fields: [englishColumn | null, arabicColumn]. `where` selects rows users can reach.
 */
const SYSTEM_CONTENT_SOURCES = Object.freeze([
  { table: "categories", where: "is_active", fields: [["name_en", "name"], [null, "description"], [null, "button_label"]] },
  { table: "subcategories", where: "is_active", fields: [["name_en", "name"]] },
  { table: "sub_subcategories", where: "is_active", fields: [["name_en", "name"]] },
  {
    table: "marketplace_membership_plans",
    where: "is_active",
    fields: [["name_en", "name_ar"], ["description_en", "description_ar"], ["sale_reason_en", "sale_reason"]],
  },
  {
    table: "plans",
    where: "deleted_at IS NULL AND (is_active OR is_visible)",
    fields: [
      ["title_en", "title"],
      ["description_en", "description"],
      ["label_en", "label"],
      ["billing_text_en", "billing_text"],
      ["button_text_en", "button_text"],
      ["price_intro_text_en", "price_intro_text"],
      ["trainings_en", "trainings"],
      ["offer_label_en", "offer_label"],
      ["sale_reason_en", "sale_reason"],
    ],
  },
  {
    table: "plan_features",
    where: "plan_id IN (SELECT id FROM plans WHERE deleted_at IS NULL AND (is_active OR is_visible))",
    fields: [["feature_text_en", "feature_text"]],
  },
  { table: "plan_pages", where: "is_active", fields: [["title_en", "title"], ["subtitle_en", "subtitle"]] },
  {
    table: "platform_ui_settings",
    where: "TRUE",
    fields: [
      ["footer_app_download_title_en", "footer_app_download_title_ar"],
      [null, "footer_working_hours_title"],
      [null, "footer_working_hours_text"],
      [null, "footer_contact_location"],
    ],
  },
  { table: "popup_ads", where: "enabled", fields: [["title_en", "title_ar"], ["body_en", "body_ar"], ["cta_text_en", "cta_text"]] },
  {
    table: "public_site_pages",
    where: "is_published",
    fields: [
      ["title_en", "title"],
      ["menu_label_en", "menu_label"],
      ["content_en", "content"],
      ["meta_title_en", "meta_title"],
      ["meta_description_en", "meta_description"],
    ],
  },
  { table: "website_faq_items", where: "is_active", fields: [["question_en", "question"], ["answer_en", "answer"]] },
  { table: "website_page_blocks", where: "is_active", fields: [["title_en", "title"], ["body_en", "body"]] },
  { table: "website_pages", where: "is_active", fields: [["title_en", "title"]] },
  // Admin-authored feedback form taxonomy (Arabic only; shown to every user in the Problems & Suggestions form).
  { table: "user_feedback_categories", where: "is_active", fields: [[null, "label"]] },
  { table: "user_feedback_topics", where: "is_active", fields: [[null, "label"]] },
]);

function isSystemContentLocale(locale) {
  return SYSTEM_CONTENT_LOCALES.includes(String(locale || ""));
}

function nonEmpty(v) {
  const s = normalizeSystemContentSource(v);
  return s || "";
}

/**
 * Read every visible system-content source (read-only).
 * @returns {Promise<Array<{ table: string, id: string, field: string, en: string, ar: string, source: string, hash: string, altHash: string | null }>>}
 */
async function collectSystemContentSources(db) {
  const out = [];
  for (const def of SYSTEM_CONTENT_SOURCES) {
    const { rows: cols } = await db.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [def.table],
    );
    const have = new Set(cols.map((r) => r.column_name));
    if (!have.size) continue;
    const fields = def.fields.filter(([en, ar]) => have.has(ar) && (!en || have.has(en)));
    if (!fields.length) continue;
    const select = fields.flatMap(([en, ar]) => [en ? `"${en}"::text AS "${en}"` : null, `"${ar}"::text AS "${ar}"`]).filter(Boolean);
    // `where` is a fixed literal from SYSTEM_CONTENT_SOURCES (never user input); its columns exist in the schema.
    const { rows } = await db.query(`SELECT id::text AS id, ${select.join(", ")} FROM "${def.table}" WHERE ${def.where} ORDER BY id`);
    for (const row of rows) {
      for (const [en, ar] of fields) {
        const enText = en ? nonEmpty(row[en]) : "";
        const arText = nonEmpty(row[ar]);
        const source = enText || arText;
        if (!source) continue;
        // Values that carry no language (URLs, numbers, codes) need no translation.
        if (!/\p{L}{2,}/u.test(source.replace(/https?:\/\/\S+/g, ""))) continue;
        out.push({
          table: def.table,
          id: row.id,
          field: ar,
          en: enText,
          ar: arText,
          source,
          hash: systemContentHash(source),
          altHash: enText && arText ? systemContentHash(arText) : null,
        });
      }
    }
  }
  return out;
}

/** Coverage of required sources for one locale. */
async function computeSystemContentCoverage(db, locale, sources = null) {
  if (!isSystemContentLocale(locale)) throw new Error("unsupported locale");
  const list = sources || (await collectSystemContentSources(db));
  const unique = new Map();
  for (const s of list) if (!unique.has(s.hash)) unique.set(s.hash, s);
  const { rows } = await db.query(`SELECT source_hash FROM system_content_translations WHERE locale = $1`, [locale]);
  const have = new Set(rows.map((r) => r.source_hash));
  const missing = [];
  let translated = 0;
  for (const s of unique.values()) {
    if (have.has(s.hash)) translated += 1;
    else missing.push({ table: s.table, id: s.id, field: s.field, hash: s.hash });
  }
  const total = unique.size;
  return { locale, total, translated, missing, coveragePct: total ? Math.floor((10000 * translated) / total) / 100 : 100 };
}

const cache = new Map();

function invalidateSystemContentCache(locale = null) {
  if (locale) cache.delete(locale);
  else cache.clear();
}

/** Public map for the SPA: { locale, entries: { hash: text }, count, etag }. Cached per locale. */
async function getSystemContentTranslations(db, locale) {
  if (!isSystemContentLocale(locale)) throw new Error("unsupported locale");
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const { rows } = await db.query(
    `SELECT source_hash, value FROM system_content_translations WHERE locale = $1 ORDER BY source_hash`,
    [locale],
  );
  const entries = {};
  for (const r of rows) entries[r.source_hash] = r.value;
  const etag = `"sct-${locale}-${crypto.createHash("sha1").update(JSON.stringify(entries)).digest("hex").slice(0, 20)}"`;
  const value = { locale, count: rows.length, entries, etag };
  cache.set(locale, { at: Date.now(), value });
  return value;
}

/**
 * Idempotent upsert (bounded batches). `entries`: [{ hash, value, excerpt? }]. Unchanged rows are not touched.
 * @returns {Promise<{ inserted: number, updated: number, unchanged: number }>}
 */
async function upsertSystemContentTranslations(db, locale, entries, { dryRun = true } = {}) {
  if (!isSystemContentLocale(locale)) throw new Error("unsupported locale");
  const clean = [];
  for (const e of entries || []) {
    const hash = String(e?.hash || "");
    const value = String(e?.value ?? "").trim();
    if (!/^[0-9a-f]{14}$/.test(hash) || !value) throw new Error(`invalid entry ${hash.slice(0, 16)}`);
    clean.push({ hash, value, excerpt: e.excerpt ? String(e.excerpt).slice(0, 120) : null });
  }
  const { rows } = await db.query(`SELECT source_hash, value FROM system_content_translations WHERE locale = $1`, [locale]);
  const current = new Map(rows.map((r) => [r.source_hash, r.value]));
  const changes = clean.filter((e) => current.get(e.hash) !== e.value);
  const stats = {
    inserted: changes.filter((e) => !current.has(e.hash)).length,
    updated: changes.filter((e) => current.has(e.hash)).length,
    unchanged: clean.length - changes.length,
  };
  if (dryRun || !changes.length) return stats;
  for (let i = 0; i < changes.length; i += UPSERT_BATCH) {
    const batch = changes.slice(i, i + UPSERT_BATCH);
    const params = [locale];
    const tuples = batch.map((e) => {
      params.push(e.hash, e.value, e.excerpt);
      const n = params.length;
      return `($1, $${n - 2}, $${n - 1}, $${n})`;
    });
    await db.query(
      `INSERT INTO system_content_translations (locale, source_hash, value, source_excerpt)
       VALUES ${tuples.join(", ")}
       ON CONFLICT (locale, source_hash)
       DO UPDATE SET value = EXCLUDED.value, source_excerpt = EXCLUDED.source_excerpt, updated_at = NOW()
       WHERE system_content_translations.value IS DISTINCT FROM EXCLUDED.value`,
      params,
    );
  }
  invalidateSystemContentCache(locale);
  return stats;
}

module.exports = {
  SYSTEM_CONTENT_LOCALES,
  SYSTEM_CONTENT_SOURCES,
  isSystemContentLocale,
  collectSystemContentSources,
  computeSystemContentCoverage,
  getSystemContentTranslations,
  upsertSystemContentTranslations,
  invalidateSystemContentCache,
};
