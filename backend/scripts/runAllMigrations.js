/**
 * Run all SQL files in sql/migrations in sorted order. Skips files whose basename (without .sql)
 * matches an existing schema_migrations.version row.
 *
 * Statements are executed sequentially (same splitting rules as runSqlFile.js). Files may contain
 * their own BEGIN/COMMIT blocks — this script does not wrap the whole file in a transaction.
 *
 * After a successful file, inserts schema_migrations(version) ON CONFLICT DO NOTHING so files that
 * already self-register do not error.
 *
 * Usage (from backend/):
 *   npm run db:migrate
 *
 * Requires DATABASE_URL in backend/.env. Per-file scripts (npm run db:run -- …) remain available.
 */

const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");

function stripLineComments(sql) {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

function splitStatements(sql) {
  const out = [];
  let buf = "";
  let inQuote = false;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (c === "'") {
      if (inQuote && sql[i + 1] === "'") {
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

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(120) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(client, version) {
  const { rows } = await client.query(`SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1`, [version]);
  return Boolean(rows[0]);
}

async function main() {
  const migrationsDir = path.join(__dirname, "..", "sql", "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.error(`Migrations directory not found: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const version = file.replace(/\.sql$/i, "");
      // eslint-disable-next-line no-await-in-loop
      if (await isApplied(client, version)) {
        console.log(`[skip] ${file} (already applied)`);
        skippedCount += 1;
        // eslint-disable-next-line no-continue
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      const cleaned = stripLineComments(raw);
      const statements = splitStatements(cleaned);

      if (statements.length === 0) {
        console.warn(`[warn] ${file}: no statements`);
        // eslint-disable-next-line no-await-in-loop
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [version]);
        appliedCount += 1;
        // eslint-disable-next-line no-continue
        continue;
      }

      console.log(`[run] ${file} (${statements.length} statement(s))`);

      try {
        for (let i = 0; i < statements.length; i += 1) {
          const stmt = statements[i];
          // eslint-disable-next-line no-await-in-loop
          await client.query(stmt);
          const preview = stmt.replace(/\s+/g, " ").slice(0, 72);
          console.log(`  [${i + 1}/${statements.length}] OK ${preview}${stmt.length > 72 ? "…" : ""}`);
        }
        // eslint-disable-next-line no-await-in-loop
        await client.query(`INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING`, [version]);
        appliedCount += 1;
        console.log(`[ok] ${file}`);
      } catch (e) {
        console.error(`[fail] ${file}:`, e.message || e);
        process.exit(1);
      }
    }

    console.log(`Done. Newly applied this run: ${appliedCount}, skipped (already applied): ${skippedCount}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
