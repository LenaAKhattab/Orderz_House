/**
 * Fill empty English fields for canonical OrderzHouse platform content.
 *
 * Never updates Arabic columns.
 * Re-running only fills fields that are still null or blank.
 *
 * Usage (inside the API container, after migration 200):
 *   BILINGUAL_CONTENT_BACKFILL_CONFIRM=apply node scripts/backfillBilingualPlatformContent.js --apply
 *
 * Staging:
 *   node scripts/backfillBilingualPlatformContent.js --staging --apply
 */
const fs = require("fs");
const path = require("path");

const CONTENT_PATH = path.join(__dirname, "..", "content", "bilingualPlatformContent.json");

const SPECIAL_OFFER_EN = {
  titleEn: "Special offer",
  subtitleEn: "A limited-time promotion — more bids at a special price.",
  badgeTextEn: "Special offer",
  ribbonTextEn: "Limited time",
  ctaLabelEn: "Get this offer now",
  microcopyEn: "No commitment. You can upgrade at any time.",
  refundExplanationEn:
    "A refund of 100 JOD is issued at 20 JOD for each active, eligible month, until the full 100 JOD is refunded, within a 6-month commitment period. Eligible months may be consecutive or separate.\n\nIf you do not work in a given month, there is no penalty and no new payment; that month does not generate a 20 JOD refund.\n\nIncome from completing Orders is entirely separate from the refund amount.\n\nThe amount is not an application fee, an interview fee, or a training-course fee, and it is not a guarantee of work or income.",
};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function loadContent() {
  if (!fs.existsSync(CONTENT_PATH)) {
    throw new Error(`Missing bilingual content file: ${CONTENT_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONTENT_PATH, "utf8"));
}

async function backfillFaq(pool, faq) {
  let updated = 0;
  let unmatched = 0;
  for (const item of faq || []) {
    const result = await pool.query(
      `UPDATE website_faq_items
       SET question_en = $2,
           answer_en = $3,
           updated_at = NOW()
       WHERE regexp_replace(btrim(question), '\\s+', ' ', 'g') = $1
         AND (question_en IS NULL OR btrim(question_en) = '')
         AND (answer_en IS NULL OR btrim(answer_en) = '')`,
      [normalizeText(item.questionAr), item.questionEn, item.answerEn],
    );
    if (result.rowCount > 0) updated += result.rowCount;
    else {
      const exists = await pool.query(
        `SELECT 1 FROM website_faq_items
         WHERE regexp_replace(btrim(question), '\\s+', ' ', 'g') = $1
         LIMIT 1`,
        [normalizeText(item.questionAr)],
      );
      if (!exists.rowCount) unmatched += 1;
    }
  }
  return { updated, unmatched, source: (faq || []).length };
}

async function backfillPages(pool, pages) {
  let updated = 0;
  for (const page of pages || []) {
    const result = await pool.query(
      `UPDATE public_site_pages
       SET title_en = CASE WHEN title_en IS NULL OR btrim(title_en) = '' THEN $2 ELSE title_en END,
           menu_label_en = CASE WHEN menu_label_en IS NULL OR btrim(menu_label_en) = '' THEN $3 ELSE menu_label_en END,
           content_en = CASE WHEN content_en IS NULL OR btrim(content_en) = '' THEN $4 ELSE content_en END,
           meta_title_en = CASE WHEN meta_title_en IS NULL OR btrim(meta_title_en) = '' THEN $5 ELSE meta_title_en END,
           meta_description_en = CASE WHEN meta_description_en IS NULL OR btrim(meta_description_en) = '' THEN $6 ELSE meta_description_en END,
           updated_at = NOW()
       WHERE slug = $1
         AND (
           title_en IS NULL OR btrim(title_en) = ''
           OR content_en IS NULL OR btrim(content_en) = ''
         )`,
      [
        page.slug,
        page.titleEn,
        page.menuLabelEn,
        page.contentEn,
        page.metaTitleEn || null,
        page.metaDescriptionEn || null,
      ],
    );
    updated += result.rowCount;
  }
  return { updated, source: (pages || []).length };
}

async function backfillHowItWorks(pool, pages) {
  let pagesUpdated = 0;
  let blocksUpdated = 0;
  for (const page of pages || []) {
    const pageResult = await pool.query(
      `UPDATE website_pages
       SET title_en = CASE WHEN title_en IS NULL OR btrim(title_en) = '' THEN $2 ELSE title_en END,
           updated_at = NOW()
       WHERE slug = $1
         AND (title_en IS NULL OR btrim(title_en) = '')`,
      [page.slug, page.titleEn],
    );
    pagesUpdated += pageResult.rowCount;
    for (const block of page.blocks || []) {
      const blockResult = await pool.query(
        `UPDATE website_page_blocks b
         SET title_en = CASE WHEN b.title_en IS NULL OR btrim(b.title_en) = '' THEN $3 ELSE b.title_en END,
             body_en = CASE WHEN b.body_en IS NULL OR btrim(b.body_en) = '' THEN $4 ELSE b.body_en END,
             updated_at = NOW()
         FROM website_pages p
         WHERE b.page_id = p.id
           AND p.slug = $1
           AND b.sort_order = $2
           AND regexp_replace(btrim(COALESCE(b.title, '')), '\\s+', ' ', 'g') = $5
           AND (
             b.title_en IS NULL OR btrim(b.title_en) = ''
             OR b.body_en IS NULL OR btrim(b.body_en) = ''
           )`,
        [page.slug, Number(block.sortOrder), block.titleEn, block.bodyEn || null, normalizeText(block.titleAr)],
      );
      blocksUpdated += blockResult.rowCount;
    }
  }
  return { pagesUpdated, blocksUpdated };
}

async function backfillSpecialOffer(pool) {
  const { rows } = await pool.query(`SELECT value FROM system_settings WHERE key = $1`, [
    "special_offer_package_v1",
  ]);
  if (!rows.length || !rows[0].value) return { updated: false, reason: "missing" };
  const current = JSON.parse(rows[0].value);
  let changed = false;
  for (const [key, value] of Object.entries(SPECIAL_OFFER_EN)) {
    if (!String(current[key] || "").trim()) {
      current[key] = value;
      changed = true;
    }
  }
  if (!changed) return { updated: false, reason: "already_filled" };
  await pool.query(
    `UPDATE system_settings SET value = $2, updated_at = NOW() WHERE key = $1`,
    ["special_offer_package_v1", JSON.stringify(current)],
  );
  return { updated: true };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const staging = process.argv.includes("--staging");
  if (apply && process.env.BILINGUAL_CONTENT_BACKFILL_CONFIRM !== "apply") {
    throw new Error("Refusing to write. Set BILINGUAL_CONTENT_BACKFILL_CONFIRM=apply");
  }
  if (staging) {
    const { loadStagingQaEnv, assertStagingQaTarget } = require("../src/config/stagingQaEnv");
    loadStagingQaEnv({ fillFromDefaultEnv: true });
    assertStagingQaTarget();
  }
  const { classifyDatabaseUrl, maskDatabaseTarget } = require("../src/utils/databaseEnvironmentSafety");
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  const content = loadContent();
  const summary = {
    apply,
    target: maskDatabaseTarget(process.env.DATABASE_URL),
    classification: info.classification,
    faq: (content.faq || []).length,
    pages: (content.pages || []).map((page) => page.slug),
    howItWorks: (content.howItWorks || []).map((page) => page.slug),
  };
  if (!apply) {
    console.log(JSON.stringify({ ...summary, mode: "dry-run" }, null, 2));
    return;
  }
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 1,
  });
  try {
    const faq = await backfillFaq(pool, content.faq);
    const pages = await backfillPages(pool, content.pages);
    const howItWorks = await backfillHowItWorks(pool, content.howItWorks);
    const specialOffer = await backfillSpecialOffer(pool);
    console.log(JSON.stringify({ ...summary, faq, pages, howItWorks, specialOffer }, null, 2));
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  normalizeText,
  SPECIAL_OFFER_EN,
  backfillFaq,
  backfillPages,
  backfillHowItWorks,
};
