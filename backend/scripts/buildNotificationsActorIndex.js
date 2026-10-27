#!/usr/bin/env node
/**
 * Pre-build the index of migration 212 (`idx_notifications_actor_user_id`) on a large notifications table.
 *
 * CREATE INDEX CONCURRENTLY cannot run inside a transaction and can take minutes on millions of rows, longer than
 * the app's 30 s statement timeout. Through Neon's pooled endpoint a session `SET statement_timeout` is not
 * reliable, so this tool connects to the DIRECT endpoint (same host without `-pooler`) with no statement timeout,
 * builds the index without blocking writes, and verifies it is valid (an interrupted concurrent build leaves an
 * INVALID index, which is dropped and rebuilt with --apply).
 *
 * Usage:
 *   node scripts/buildNotificationsActorIndex.js           # report only (exists / valid / rows)
 *   node scripts/buildNotificationsActorIndex.js --apply   # build (or rebuild an invalid one)
 * Output: status only — never prints connection strings.
 */
const { Client } = require("pg");
const { resolvePoolSsl } = require("../src/config/db");

const APPLY = process.argv.includes("--apply");
const INDEX = "idx_notifications_actor_user_id";

function directUrl() {
  const u = new URL(String(process.env.DATABASE_URL || ""));
  u.hostname = u.hostname.replace("-pooler.", ".");
  return u.toString();
}

async function indexState(client) {
  const { rows } = await client.query(
    `SELECT i.indisvalid AS valid
       FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
      WHERE c.relname = $1`,
    [INDEX],
  );
  return rows[0] ? (rows[0].valid ? "valid" : "invalid") : "missing";
}

async function main() {
  const url = directUrl();
  const client = new Client({ connectionString: url, ssl: resolvePoolSsl(url) });
  await client.connect();
  try {
    await client.query("SET statement_timeout = 0");
    const before = await indexState(client);
    const report = { mode: APPLY ? "apply" : "report", before };
    if (APPLY && before !== "valid") {
      if (before === "invalid") await client.query(`DROP INDEX CONCURRENTLY IF EXISTS ${INDEX}`);
      const t = Date.now();
      await client.query(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX} ON notifications (actor_user_id) WHERE actor_user_id IS NOT NULL`,
      );
      report.buildSeconds = Math.round((Date.now() - t) / 100) / 10;
    }
    report.after = await indexState(client);
    console.log(`NOTIFICATIONS_ACTOR_INDEX ${JSON.stringify(report)}`);
    if (APPLY && report.after !== "valid") process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("NOTIFICATIONS_ACTOR_INDEX_FAILED", err?.code || err?.name || "error");
  process.exitCode = 1;
});
