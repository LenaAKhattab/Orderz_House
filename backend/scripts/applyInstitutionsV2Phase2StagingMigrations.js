/* Apply/check Institutions V2 Phase2 migrations on Staging only. */
const path = require("path");
const fs = require("fs");

process.env.APP_ENV = "staging";
require("dotenv").config({ path: path.join(__dirname, "../.env.staging") });

const { Pool } = require("pg");
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url || /wandering-cherry|production/i.test(url)) {
  console.error("Refusing to run: Staging URL missing or looks like Production.");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });

function splitStatements(sql) {
  const cleaned = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  const out = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const c = cleaned[i];
    if (c === "'") {
      if (inQuote && cleaned[i + 1] === "'") {
        buf += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      buf += c;
      continue;
    }
    if (c === ";" && !inQuote) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

async function applyFile(rel) {
  const full = path.join(__dirname, "..", rel);
  const sql = fs.readFileSync(full, "utf8");
  const statements = splitStatements(sql);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
  console.log("applied", rel);
}

(async () => {
  const host = await pool.query("select current_database() as db");
  console.log("target db:", host.rows[0].db);

  const before = await pool.query(
    "SELECT version FROM schema_migrations WHERE version LIKE '192%' OR version LIKE '193%' OR version LIKE '194%' ORDER BY 1",
  );
  console.log("before:", before.rows.map((r) => r.version));

  if (!before.rows.some((r) => String(r.version).includes("192"))) {
    console.log("Applying Phase1 prerequisite migration 192 on Staging…");
    await applyFile("sql/migrations/192_legacy_campaign_institution.sql");
  } else {
    console.log("skip 192 (already applied)");
  }

  const mid = await pool.query(
    "SELECT version FROM schema_migrations WHERE version LIKE '192%' OR version LIKE '193%' OR version LIKE '194%' ORDER BY 1",
  );
  const versions = mid.rows.map((r) => String(r.version));

  if (!versions.some((v) => v.includes("193"))) {
    await applyFile("sql/migrations/193_orders_institution_id.sql");
  } else {
    console.log("skip 193 (already applied)");
  }

  if (!versions.some((v) => v.includes("194"))) {
    await applyFile("sql/migrations/194_marketplace_articles_institution.sql");
  } else {
    console.log("skip 194 (already applied)");
  }

  const after = await pool.query(
    "SELECT version FROM schema_migrations WHERE version LIKE '192%' OR version LIKE '193%' OR version LIKE '194%' ORDER BY 1",
  );
  console.log("after:", after.rows.map((r) => r.version));

  const backfill = await pool.query(
    `SELECT COUNT(*)::int AS c FROM orders WHERE institution_id IS NOT NULL AND visibility_scope = 'institution'`,
  );
  console.log("orders with institution_id:", backfill.rows[0].c);

  await pool.end();
  console.log("STAGING_MIGRATIONS_OK");
})().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
