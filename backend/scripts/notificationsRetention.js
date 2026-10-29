#!/usr/bin/env node
/**
 * Notification retention (R1A). DEFAULT = DRY RUN — reports what WOULD be removed, aggregates only
 * (no user ids, no notification bodies). Policy: src/services/notificationRetentionService.js
 *   - EPHEMERAL_DISCOVERY (order.created to freelancers, order.pool.summary): 30 days
 *   - TRANSACTIONAL / MODERATION / SYSTEM: 365 days
 *   - FINANCIAL / SECURITY: never deleted; unlisted types: never deleted
 *
 * Usage:
 *   node scripts/notificationsRetention.js                      # dry run
 *   node scripts/notificationsRetention.js --explain [--analyze] # plan of one delete batch per rule (read-only)
 *   node scripts/notificationsRetention.js --apply --confirm=DELETE_EXPIRED_NOTIFICATIONS \
 *        [--batch-size=5000] [--sleep-ms=250] [--max-rows=N]
 *     Production additionally requires ALLOW_PRODUCTION_NOTIFICATION_RETENTION=1.
 *
 * Apply deletes in bounded batches (one short transaction each), pauses between batches, stops on the first
 * error, and is safe to re-run (resumes from the oldest remaining eligible row). Deleting rows does NOT shrink
 * the relation on disk: space becomes reusable inside PostgreSQL after (auto)vacuum. No VACUUM FULL / pg_repack.
 * Connects to the DIRECT endpoint (same host without `-pooler`). Never prints connection strings.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");

loadBackendEnv({ profile: "default", failClosed: false, quiet: true });

const { Client } = require("pg");
const { resolvePoolSsl } = require("../src/config/db");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const retention = require("../src/services/notificationRetentionService");

const CONFIRM_TOKEN = "DELETE_EXPIRED_NOTIFICATIONS";

function parseArgs(argv) {
  const args = { apply: false, explain: false, analyze: false, confirm: null, batchSize: 5000, sleepMs: 250, maxRows: null, chunkSize: 250000 };
  for (const a of argv) {
    if (a === "--apply") args.apply = true;
    else if (a === "--explain") args.explain = true;
    else if (a === "--analyze") args.analyze = true;
    else if (a.startsWith("--confirm=")) args.confirm = a.slice("--confirm=".length);
    else if (a.startsWith("--batch-size=")) args.batchSize = Number(a.slice("--batch-size=".length));
    else if (a.startsWith("--sleep-ms=")) args.sleepMs = Number(a.slice("--sleep-ms=".length));
    else if (a.startsWith("--max-rows=")) args.maxRows = Number(a.slice("--max-rows=".length));
    else if (a.startsWith("--chunk-size=")) args.chunkSize = Number(a.slice("--chunk-size=".length));
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

/** Apply is refused unless explicitly confirmed (and explicitly allowed on Production). */
function assertApplyAllowed(args, env = process.env) {
  if (!args.apply) return;
  if (args.confirm !== CONFIRM_TOKEN) {
    throw new Error(`--apply requires --confirm=${CONFIRM_TOKEN}`);
  }
  const db = classifyDatabaseUrl(env.DATABASE_URL, env);
  const appEnv = String(env.APP_ENV || "").trim().toLowerCase();
  const nodeEnv = String(env.NODE_ENV || "").trim().toLowerCase();
  const production = db.isProduction || appEnv === "production" || nodeEnv === "production";
  if (production && env.ALLOW_PRODUCTION_NOTIFICATION_RETENTION !== "1") {
    throw new Error("Production apply requires ALLOW_PRODUCTION_NOTIFICATION_RETENTION=1");
  }
}

function directUrl(raw) {
  const u = new URL(String(raw || ""));
  u.hostname = u.hostname.replace("-pooler.", ".");
  return u.toString();
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.apply && args.explain) throw new Error("--apply and --explain are exclusive");
  assertApplyAllowed(args);
  const url = directUrl(process.env.DATABASE_URL);
  const client = new Client({ connectionString: url, ssl: resolvePoolSsl(url) });
  client.on("error", (err) => console.error("NOTIFICATIONS_RETENTION_CLIENT_ERROR", err?.code || "error"));
  await client.connect();
  const now = new Date();
  try {
    if (args.explain) {
      const plans = await retention.explainTargets(client, { now, batchSize: args.batchSize, analyze: args.analyze });
      for (const p of plans) {
        console.log(`--- ${p.type} roles=${p.onlyRoles ? p.onlyRoles.join(",") : p.exceptRoles ? `not:${p.exceptRoles.join(",")}` : "*"} days=${p.days}`);
        console.log(p.plan.join("\n"));
      }
      return;
    }
    if (args.apply) {
      const out = await retention.runApply(client, {
        now,
        batchSize: args.batchSize,
        sleepMs: args.sleepMs,
        maxRows: args.maxRows,
        onProgress: (p, t) => {
          if (p.batches % 20 === 0) {
            console.log(`NOTIFICATIONS_RETENTION_PROGRESS ${JSON.stringify({ deleted: p.deleted, batches: p.batches, type: t.type, cursor: t.cursor })}`);
          }
        },
      });
      console.log(`NOTIFICATIONS_RETENTION ${JSON.stringify(out)}`);
      return;
    }
    const report = await retention.runDryRun(client, {
      now,
      chunkSize: args.chunkSize,
      onProgress: ({ chunks, hi, maxId }) => {
        if (chunks % 10 === 0) console.error(`NOTIFICATIONS_RETENTION_SCAN ${Math.min(100, Math.round((hi / Math.max(1, maxId)) * 100))}%`);
      },
    });
    console.log(`NOTIFICATIONS_RETENTION ${JSON.stringify(report)}`);
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((err) => {
    const progress = err?.retentionProgress ? ` ${JSON.stringify(err.retentionProgress)}` : "";
    console.error(`NOTIFICATIONS_RETENTION_FAILED ${String(err?.code || err?.message || "error").slice(0, 200)}${progress}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, assertApplyAllowed, CONFIRM_TOKEN };
