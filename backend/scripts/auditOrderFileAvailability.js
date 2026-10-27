#!/usr/bin/env node
/**
 * Audit (and optionally repair) the availability flag of order attachments.
 *
 * Probes the stored source of every order_files row (R2 HEAD; legacy Cloudinary / disk: open and
 * immediately close the stream) and reconciles `order_files.source_missing_at`:
 *   - provider proves the source is gone (404 FILE_NOT_FOUND) → flag set (UI: «المرفق الأصلي غير متاح»)
 *   - source is readable but the row is flagged → flag cleared
 *   - transient / provider errors → no change (counted only)
 * Nothing is deleted or fabricated; the flag is advisory and reversible (set it back to NULL).
 *
 * Usage (dry run is the default):
 *   node scripts/auditOrderFileAvailability.js                 # dry run, aggregate report
 *   node scripts/auditOrderFileAvailability.js --apply         # write the flag changes
 *   node scripts/auditOrderFileAvailability.js --limit 200 --batch 50
 * Output: aggregate counts only (no file names, keys, URLs or user data).
 */
const { pool } = require("../src/config/db");
const fileStorage = require("../src/services/fileStorageService");

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

const APPLY = process.argv.includes("--apply");
const LIMIT = argValue("--limit", 5000);
const BATCH = argValue("--batch", 50);

async function probe(row) {
  const provider = String(row.storage_provider || "").toLowerCase();
  if (provider === "r2") {
    const head = await fileStorage.headPrivateFile({ bucket: row.storage_bucket, key: row.storage_key });
    return head.exists ? "available" : "missing";
  }
  try {
    const opened = await fileStorage.openFileStream(row);
    if (opened?.stream?.destroy) opened.stream.destroy();
    return "available";
  } catch (err) {
    return err?.code === "FILE_NOT_FOUND" ? "missing" : "error";
  }
}

async function main() {
  const report = {
    mode: APPLY ? "apply" : "dry-run",
    scanned: 0,
    byProvider: {},
    available: 0,
    missing: 0,
    errors: 0,
    flagSet: 0,
    flagCleared: 0,
    alreadyFlagged: 0,
  };
  let cursor = 0;
  while (report.scanned < LIMIT) {
    // eslint-disable-next-line no-await-in-loop
    const { rows } = await pool.query(
      `SELECT id, purpose, storage_provider, storage_bucket, storage_key, file_path, file_url, secure_url, public_id, source_missing_at
         FROM order_files
        WHERE id > $1
        ORDER BY id ASC
        LIMIT $2`,
      [cursor, Math.min(BATCH, LIMIT - report.scanned)],
    );
    if (!rows.length) break;
    for (const row of rows) {
      cursor = Number(row.id);
      report.scanned += 1;
      const provider = String(row.storage_provider || "legacy");
      report.byProvider[provider] = (report.byProvider[provider] || 0) + 1;
      let state;
      try {
        // eslint-disable-next-line no-await-in-loop
        state = await probe(row);
      } catch {
        state = "error";
      }
      if (state === "error") {
        report.errors += 1;
        continue;
      }
      if (state === "missing") {
        report.missing += 1;
        if (row.source_missing_at) {
          report.alreadyFlagged += 1;
          continue;
        }
        report.flagSet += 1;
        if (APPLY) {
          // eslint-disable-next-line no-await-in-loop
          await pool.query(`UPDATE order_files SET source_missing_at = NOW() WHERE id = $1 AND source_missing_at IS NULL`, [row.id]);
        }
        continue;
      }
      report.available += 1;
      if (row.source_missing_at) {
        report.flagCleared += 1;
        if (APPLY) {
          // eslint-disable-next-line no-await-in-loop
          await pool.query(`UPDATE order_files SET source_missing_at = NULL WHERE id = $1`, [row.id]);
        }
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(`ORDER_FILE_AVAILABILITY ${JSON.stringify(report)}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("ORDER_FILE_AVAILABILITY_FAILED", err?.code || err?.name || "error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });
