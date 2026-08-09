/**
 * Backfill title_en / description_en for orders, fake_orders, and fake_order_templates.
 *
 * Usage:
 *   node scripts/backfillOrderTranslations.js
 *   node scripts/backfillOrderTranslations.js --table=orders --limit=50
 *   node scripts/backfillOrderTranslations.js --dry-run
 *
 * Requires TRANSLATION_API_KEY or DEEPL_API_KEY in environment.
 */

require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(require("path").basename(__filename));

const { pool } = require("../src/config/db");
const { persistCachedTranslations, generateEnglishTranslations } = require("../src/services/orderTranslationHelper");
const { isTranslationConfigured } = require("../src/services/translationService");

const TABLES = ["orders", "fake_orders", "fake_order_templates"];
const DEFAULT_BATCH = 25;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { table: null, limit: null, dryRun: false, batch: DEFAULT_BATCH };
  for (const arg of args) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--table=")) opts.table = arg.slice("--table=".length);
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--batch=")) opts.batch = Number(arg.slice("--batch=".length));
  }
  return opts;
}

async function fetchPending(table, limit) {
  const lim = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  const sql = `
    SELECT id, title, description
    FROM ${table}
    WHERE (title_en IS NULL OR btrim(title_en) = '')
       OR (description_en IS NULL OR btrim(description_en) = '')
    ORDER BY id ASC
    ${lim ? `LIMIT ${lim}` : ""}
  `;
  const { rows } = await pool.query(sql);
  return rows;
}

async function backfillTable(table, { dryRun, limit, batch }) {
  const rows = await fetchPending(table, limit);
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch);
    for (const row of chunk) {
      try {
        if (dryRun) {
          const preview = await generateEnglishTranslations(row.title, row.description);
          if (preview.titleEn || preview.descriptionEn) saved += 1;
          else skipped += 1;
          continue;
        }
        const result = await persistCachedTranslations(table, row.id, {
          title: row.title,
          description: row.description,
        });
        if (result.saved) saved += 1;
        else skipped += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.error(`[backfill] ${table}#${row.id}:`, err?.message || err);
      }
    }
  }

  return { table, total: rows.length, saved, skipped, failed };
}

async function main() {
  const opts = parseArgs();
  if (!opts.dryRun && !isTranslationConfigured()) {
    // eslint-disable-next-line no-console
    console.error("No translation API key configured. Set TRANSLATION_API_KEY or DEEPL_API_KEY.");
    process.exit(1);
  }

  const tables = opts.table ? [opts.table] : TABLES;
  for (const t of tables) {
    if (!TABLES.includes(t)) {
      // eslint-disable-next-line no-console
      console.error(`Unknown table: ${t}`);
      process.exit(1);
    }
  }

  const summaries = [];
  for (const table of tables) {
    // eslint-disable-next-line no-await-in-loop
    summaries.push(await backfillTable(table, opts));
  }

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ dryRun: opts.dryRun, summaries }, null, 2));
  await pool.end();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
