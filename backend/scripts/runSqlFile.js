/**
 * Run a PostgreSQL script file using DATABASE_URL from backend/.env.
 * Use this from the repo (or Cursor terminal) to create/update schema without psql.
 *
 * Usage (from backend/):
 *   npm run db:init
 *   npm run db:run -- sql/init.sql
 *   npm run db:run -- path/to/other.sql
 *
 * Default file when no argument is given: sql/init.sql
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

/**
 * Split on `;` outside single-quoted strings (handles O'Reilly-style 'text''s' minimally).
 */
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

async function main() {
  const rel = process.argv[2] || path.join("sql", "init.sql");
  const filePath = path.isAbsolute(rel) ? rel : path.join(__dirname, "..", rel);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const cleaned = stripLineComments(raw);
  const statements = splitStatements(cleaned);

  if (statements.length === 0) {
    console.error("No SQL statements found in file.");
    process.exit(1);
  }

  console.log(`Applying ${statements.length} statement(s) from ${path.relative(process.cwd(), filePath)}`);

  const client = await pool.connect();
  try {
    for (let i = 0; i < statements.length; i += 1) {
      const stmt = statements[i];
      await client.query(stmt);
      const preview = stmt.replace(/\s+/g, " ").slice(0, 72);
      console.log(`  [${i + 1}/${statements.length}] OK ${preview}${stmt.length > 72 ? "…" : ""}`);
    }
  } finally {
    client.release();
    await pool.end();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
