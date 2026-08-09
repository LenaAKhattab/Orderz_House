/**
 * Unit tests for PostgreSQL-aware SQL statement splitting.
 * Run: node --test test/splitSqlStatements.test.js
 * Does NOT touch any database.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { splitSqlStatements, stripSqlLineComments } = require("../scripts/lib/splitSqlStatements");

describe("splitSqlStatements", () => {
  it("splits ordinary semicolon-separated SQL", () => {
    const stmts = splitSqlStatements("SELECT 1; SELECT 2; SELECT 3;");
    assert.deepEqual(stmts, ["SELECT 1", "SELECT 2", "SELECT 3"]);
  });

  it("keeps DO $$ ... $$ as one statement", () => {
    const sql = `
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'x') THEN
    ALTER TABLE t ADD CONSTRAINT x FOREIGN KEY (a) REFERENCES u(id) ON DELETE SET NULL;
  END IF;
END
$$;
COMMIT;
`;
    const stmts = splitSqlStatements(stripSqlLineComments(sql));
    assert.equal(stmts.length, 3);
    assert.equal(stmts[0], "BEGIN");
    assert.match(stmts[1], /^DO \$\$/);
    assert.match(stmts[1], /ON DELETE SET NULL/);
    assert.match(stmts[1], /\$\$$/);
    assert.equal(stmts[2], "COMMIT");
  });

  it("keeps custom dollar tags intact", () => {
    const sql = `
DO $migration$
BEGIN
  PERFORM 1;
END
$migration$;
SELECT 2;
`;
    const stmts = splitSqlStatements(stripSqlLineComments(sql));
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /^DO \$migration\$/);
    assert.match(stmts[0], /\$migration\$$/);
    assert.equal(stmts[1], "SELECT 2");
  });

  it("ignores semicolons inside single-quoted strings", () => {
    const stmts = splitSqlStatements("INSERT INTO t(v) VALUES ('a;b;c'); SELECT 1;");
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /'a;b;c'/);
    assert.equal(stmts[1], "SELECT 1");
  });

  it("handles escaped quotes inside strings", () => {
    const stmts = splitSqlStatements("SELECT 'it''s; fine'; SELECT 2;");
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /it''s; fine/);
  });

  it("ignores semicolons inside dollar-quoted strings", () => {
    const stmts = splitSqlStatements("SELECT $$hello; world$$; SELECT 2;");
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /\$\$hello; world\$\$/);
  });

  it("strips full-line comments that contain semicolons", () => {
    const sql = `
-- note; this is a comment
SELECT 1;
-- another; comment
SELECT 2;
`;
    const stmts = splitSqlStatements(stripSqlLineComments(sql));
    assert.deepEqual(stmts, ["SELECT 1", "SELECT 2"]);
  });

  it("ignores semicolons inside double-quoted identifiers", () => {
    const stmts = splitSqlStatements('ALTER TABLE "weird;name" ADD COLUMN x int; SELECT 1;');
    assert.equal(stmts.length, 2);
    assert.match(stmts[0], /"weird;name"/);
    assert.equal(stmts[1], "SELECT 1");
  });

  it("parses statements before and after a DO block", () => {
    const sql = `
CREATE TABLE a(id int);
DO $$
BEGIN
  PERFORM 1;
END
$$;
CREATE INDEX ON a(id);
`;
    const stmts = splitSqlStatements(stripSqlLineComments(sql));
    assert.equal(stmts.length, 3);
    assert.match(stmts[0], /CREATE TABLE a/);
    assert.match(stmts[1], /^DO \$\$/);
    assert.match(stmts[2], /CREATE INDEX/);
  });

  it("parses migration 132 without breaking the DO block", () => {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "sql", "migrations", "132_user_feedback_topics.sql"),
      "utf8",
    );
    assert.match(raw, /132_user_feedback_topics/);
    const stmts = splitSqlStatements(stripSqlLineComments(raw));
    assert.ok(stmts.length >= 10);
    const doStmt = stmts.find((s) => /^DO\s+\$\$/.test(s));
    assert.ok(doStmt, "expected DO $$ statement");
    assert.match(doStmt, /user_feedback_topic_id_fkey/);
    assert.match(doStmt, /ON DELETE SET NULL/);
    assert.ok(!stmts.some((s) => s.trim() === "$$"), "dollar quote must not become its own statement");
    assert.ok(stmts.some((s) => /INSERT INTO schema_migrations/.test(s) && /132_user_feedback_topics/.test(s)));
  });

  it("parses migration 133 without breaking DO $$ FK blocks", () => {
    const raw = fs.readFileSync(
      path.join(__dirname, "..", "sql", "migrations", "133_user_feedback_categories.sql"),
      "utf8",
    );
    assert.match(raw, /133_user_feedback_categories/);
    assert.match(raw, /user_feedback_categories/);
    assert.match(raw, /category_label_snapshot/);
    assert.doesNotMatch(raw, /ON DELETE CASCADE/);
    const stmts = splitSqlStatements(stripSqlLineComments(raw));
    const doStmts = stmts.filter((s) => /^DO\s+\$\$/.test(s));
    assert.equal(doStmts.length, 2);
    assert.ok(doStmts.some((s) => /user_feedback_topics_category_id_fkey/.test(s)));
    assert.ok(doStmts.some((s) => /user_feedback_category_id_fkey/.test(s)));
    assert.ok(doStmts.every((s) => /ON DELETE (RESTRICT|SET NULL)/.test(s)));
    assert.ok(!stmts.some((s) => s.trim() === "$$"));
    assert.ok(stmts.some((s) => /INSERT INTO schema_migrations/.test(s) && /133_user_feedback_categories/.test(s)));
    assert.ok(stmts.some((s) => /DROP CONSTRAINT IF EXISTS user_feedback_type_check/.test(s)));
  });
});
