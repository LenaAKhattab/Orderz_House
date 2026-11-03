#!/usr/bin/env node
/**
 * German / Dutch / Romanian system-content translations (translation memory) — operations CLI.
 *
 *   node scripts/i18n/systemContentTranslations.js export --out <file.json>
 *       READ-ONLY. Visible system-content sources [{ hash, altHash, table, id, field, en, ar }] for translators.
 *   node scripts/i18n/systemContentTranslations.js coverage [--locale de] [--strict] [--json <file>]
 *       READ-ONLY. Required sources vs stored translations per locale (exit 1 with --strict when < 100%).
 *   node scripts/i18n/systemContentTranslations.js backfill --locale de [--apply]
 *       Upserts data/i18n/system-content/<locale>.json ({ sourceHash: translation }) for every source that exists
 *       in THIS database, under both its English and Arabic source hash. Dry-run unless --apply. Idempotent,
 *       bounded batches, only system_content_translations is written — content tables are never modified.
 *
 * Output never includes user data; sources are public system copy.
 */
const fs = require("fs");
const path = require("path");

const {
  SYSTEM_CONTENT_LOCALES,
  collectSystemContentSources,
  computeSystemContentCoverage,
  upsertSystemContentTranslations,
} = require("../../src/services/systemContentTranslationsService");

const DATA_DIR = path.join(__dirname, "../../data/i18n/system-content");

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

function loadTranslations(locale) {
  const file = path.join(DATA_DIR, `${locale}.json`);
  let out = {};
  if (fs.existsSync(file)) out = JSON.parse(fs.readFileSync(file, "utf8"));
  const partsDir = path.join(DATA_DIR, "parts");
  if (fs.existsSync(partsDir)) {
    for (const name of fs.readdirSync(partsDir).sort()) {
      if (!name.startsWith(`${locale}.`) || !name.endsWith(".json")) continue;
      Object.assign(out, JSON.parse(fs.readFileSync(path.join(partsDir, name), "utf8")));
    }
  }
  return out;
}

async function withClient(readOnly, fn) {
  const { pool } = require("../../src/config/db");
  const client = await pool.connect();
  try {
    await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
    const out = await fn(client);
    await client.query(readOnly ? "ROLLBACK" : "COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

async function cmdExport() {
  const out = arg("--out");
  if (!out) throw new Error("--out <file> required");
  const sources = await withClient(true, (db) => collectSystemContentSources(db));
  const unique = new Map();
  for (const s of sources) if (!unique.has(s.hash)) unique.set(s.hash, s);
  fs.writeFileSync(out, `${JSON.stringify([...unique.values()], null, 1)}\n`);
  const chars = [...unique.values()].reduce((n, s) => n + s.source.length, 0);
  console.log(`SYSTEM_CONTENT_EXPORT sources=${sources.length} unique=${unique.size} sourceChars=${chars}`);
}

async function cmdCoverage() {
  const locales = arg("--locale") ? [arg("--locale")] : SYSTEM_CONTENT_LOCALES;
  const report = await withClient(true, async (db) => {
    const sources = await collectSystemContentSources(db);
    const out = {};
    for (const loc of locales) out[loc] = await computeSystemContentCoverage(db, loc, sources);
    return out;
  });
  let ok = true;
  for (const [loc, r] of Object.entries(report)) {
    const byTable = {};
    for (const m of r.missing) byTable[m.table] = (byTable[m.table] || 0) + 1;
    console.log(`SYSTEM_CONTENT_COVERAGE ${loc} ${r.coveragePct}% (${r.translated}/${r.total}) missing_by_table=${JSON.stringify(byTable)}`);
    if (r.translated !== r.total) ok = false;
  }
  if (arg("--json")) fs.writeFileSync(arg("--json"), `${JSON.stringify(report, null, 1)}\n`);
  if (process.argv.includes("--strict") && !ok) process.exitCode = 1;
}

async function cmdBackfill() {
  const locale = arg("--locale");
  if (!SYSTEM_CONTENT_LOCALES.includes(locale)) throw new Error("--locale de|nl|ro required");
  const apply = process.argv.includes("--apply");
  const translations = loadTranslations(locale);
  const result = await withClient(!apply, async (db) => {
    const sources = await collectSystemContentSources(db);
    const entries = new Map();
    let untranslated = 0;
    for (const s of sources) {
      const value = translations[s.hash];
      if (!value || !String(value).trim()) {
        untranslated += 1;
        continue;
      }
      const excerpt = s.source.slice(0, 80);
      entries.set(s.hash, { hash: s.hash, value, excerpt });
      if (s.altHash && !entries.has(s.altHash)) entries.set(s.altHash, { hash: s.altHash, value, excerpt });
    }
    const stats = await upsertSystemContentTranslations(db, locale, [...entries.values()], { dryRun: !apply });
    return { sources: sources.length, entries: entries.size, untranslatedSources: untranslated, ...stats };
  });
  console.log(`SYSTEM_CONTENT_BACKFILL locale=${locale} mode=${apply ? "apply" : "dry-run"} ${JSON.stringify(result)}`);
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "export") return cmdExport();
  if (cmd === "coverage") return cmdCoverage();
  if (cmd === "backfill") return cmdBackfill();
  console.error("usage: systemContentTranslations.js export|coverage|backfill …");
  process.exitCode = 2;
}

main().catch((err) => {
  console.error("SYSTEM_CONTENT_TRANSLATIONS_FAILED", err?.code || err?.message || err);
  process.exitCode = 1;
});
