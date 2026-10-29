/**
 * Notification retention policy + dry-run / batched delete engine (R1A).
 * Run: node --test test/notificationRetention.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/notification_retention_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const retention = require("../src/services/notificationRetentionService");
const cli = require("../scripts/notificationsRetention");

/** The 29 types present in Production on 2026-10-29. */
const PRODUCTION_TYPES = [
  "ad.created", "ad.published", "ad.unpublished", "course.assigned", "course.completed", "course.lesson.completed",
  "feedback.created", "financial_claim.created", "freelancer.review.received", "general.test", "order.assigned",
  "order.bid.rejected", "order.bid.selected", "order.bid.submitted", "order.bid.updated", "order.created",
  "order.delivery.submitted", "order.freelancer.assigned", "order.payment.started", "order.revision.requested",
  "payment_cancelled", "payment_success", "plan.created", "plan.updated", "subscription.assigned",
  "subscription.company.activated", "subscription.payment.started", "subscription.started", "user.registered",
];

const NOW = new Date("2026-10-29T12:00:00Z");
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

/** bucket index for an age in days (mirrors dryRunChunkSql). */
function bucketFor(ageDays) {
  const i = retention.AGE_BUCKET_BOUNDS.findIndex((b) => ageDays < b);
  return i === -1 ? retention.AGE_BUCKET_BOUNDS.length : i;
}

function group(type, ageDays, rows, { role = "freelancer", isRead = false, rowBytes = rows * 700 } = {}) {
  return { type, recipientRole: role, bucket: bucketFor(ageDays), isRead, rows, rowBytes, oldest: daysAgo(ageDays), newest: daysAgo(ageDays) };
}

describe("policy classification", () => {
  it("all 29 Production types are classified (none unclassified)", () => {
    assert.equal(PRODUCTION_TYPES.length, 29);
    for (const type of PRODUCTION_TYPES) {
      const rule = retention.resolveRule(type, "freelancer");
      assert.equal(rule.unclassified, false, type);
    }
  });

  it("order.created to freelancers = 30-day discovery; client confirmations = 365-day transactional", () => {
    const f = retention.resolveRule("order.created", "freelancer");
    assert.equal(f.class, "EPHEMERAL_DISCOVERY");
    assert.equal(f.days, 30);
    const c = retention.resolveRule("order.created", "client");
    assert.equal(c.class, "TRANSACTIONAL");
    assert.equal(c.days, 365);
    assert.equal(retention.resolveRule("order.created", null).days, 365);
    assert.equal(retention.resolveRule("order.pool.summary", "freelancer").days, 30);
  });

  it("financial and security types are never deletable", () => {
    for (const type of ["payment_success", "payment_cancelled", "order.payment.started", "subscription.payment.started", "financial_claim.created", "financial_claim.paid", "user.account.suspended", "user.account.deactivated"]) {
      const rule = retention.resolveRule(type, "freelancer");
      assert.equal(rule.deletable, false, type);
      assert.ok(["FINANCIAL", "SECURITY"].includes(rule.class), type);
    }
    const targets = retention.listDeleteTargets().map((t) => t.type);
    assert.ok(!targets.includes("payment_success"));
    assert.ok(!targets.includes("financial_claim.created"));
    assert.ok(!targets.includes("user.account.suspended"));
  });

  it("unlisted types are retained (never deleted)", () => {
    const rule = retention.resolveRule("some.future.type", "freelancer");
    assert.equal(rule.unclassified, true);
    assert.equal(rule.deletable, false);
  });

  it("delete targets: order.created split into freelancer (30d) and everyone else (365d)", () => {
    const oc = retention.listDeleteTargets().filter((t) => t.type === "order.created");
    assert.deepEqual(
      oc.map((t) => ({ days: t.days, onlyRoles: t.onlyRoles, exceptRoles: t.exceptRoles })),
      [
        { days: 30, onlyRoles: ["freelancer"], exceptRoles: null },
        { days: 365, onlyRoles: null, exceptRoles: ["freelancer"] },
      ],
    );
    const types = retention.listDeleteTargets().map((t) => `${t.type}|${t.onlyRoles || ""}|${t.exceptRoles || ""}`);
    assert.equal(new Set(types).size, types.length, "no duplicate targets");
  });

  it("every retention period is an age-bucket boundary (dry-run sums are exact)", () => {
    assert.doesNotThrow(() => retention.assertPolicyConsistent());
  });
});

describe("summarizeDryRun", () => {
  it("30-day rule for discovery, 365-day for others, exclusions honoured", () => {
    const report = retention.summarizeDryRun(
      [
        group("order.created", 3, 100),
        group("order.created", 20, 200),
        group("order.created", 45, 300),
        group("order.created", 45, 7, { isRead: true }),
        group("order.created", 400, 50),
        group("order.created", 45, 4, { role: "client" }),
        group("order.created", 400, 2, { role: "client" }),
        group("user.registered", 200, 10),
        group("user.registered", 400, 5),
        group("payment_success", 400, 3),
        group("some.future.type", 400, 9),
      ],
      { now: NOW, relation: { totalBytes: 1000000, heapBytes: 700000, indexBytes: 300000 } },
    );
    assert.equal(report.mode, "dry-run");
    assert.equal(report.totalRows, 690);
    // discovery: 300 + 7 + 50 ; client order.created: 2 (400d) ; user.registered: 5 (400d)
    assert.equal(report.eligibleRows, 364);
    assert.equal(report.retainedRows, 326);
    assert.equal(report.eligibleRead, 7);
    assert.equal(report.eligibleUnread, 357);
    const byType = Object.fromEntries(report.byType.map((t) => [`${t.type}|${t.class}`, t]));
    assert.equal(byType["order.created|EPHEMERAL_DISCOVERY"].eligible, 357);
    assert.equal(byType["order.created|TRANSACTIONAL"].eligible, 2);
    assert.equal(byType["payment_success|FINANCIAL"].eligible, 0);
    assert.equal(byType["some.future.type|UNCLASSIFIED"].eligible, 0);
    assert.equal(report.byAgeBucket.find((b) => b.bucket === "30-90d").eligible, 307, "client confirmations at 45d stay");
    assert.ok(report.estimatedReusableBytes > 0 && report.estimatedReusableBytes < 1000000);
    assert.equal(report.eligibleOldest, daysAgo(400));
    assert.equal(report.eligibleNewest, daysAgo(45));
  });

  it("report carries aggregates only (no user ids, no bodies)", () => {
    const report = retention.summarizeDryRun([group("order.created", 45, 1)], { now: NOW });
    const json = JSON.stringify(report);
    assert.doesNotMatch(json, /recipient_user_id|recipientUserId|title|message|dedupe/);
  });
});

describe("dry run issues no mutation", () => {
  it("only READ ONLY transactions with SELECTs", async () => {
    const statements = [];
    const client = {
      async query(sql, params) {
        const text = String(sql).trim();
        statements.push(text);
        if (/MIN\(id\)/.test(text)) return { rows: [{ min_id: 1, max_id: 2500 }] };
        if (/pg_total_relation_size/.test(text)) return { rows: [{ total_bytes: 10, heap_bytes: 7, index_bytes: 3 }] };
        if (/GROUP BY 1, 2, 3, 4/.test(text)) {
          assert.equal(params.length, 3);
          return { rows: [{ type: "order.created", recipient_role: "freelancer", bucket: 2, is_read: false, rows: "5", row_bytes: "3500", oldest: daysAgo(40), newest: daysAgo(35) }] };
        }
        return { rows: [] };
      },
    };
    const report = await retention.runDryRun(client, { now: NOW, chunkSize: 1000 });
    assert.equal(report.idRange.chunks, 3);
    assert.equal(report.totalRows, 15);
    assert.equal(report.eligibleRows, 15);
    for (const s of statements) {
      assert.doesNotMatch(s, /^(DELETE|UPDATE|INSERT|TRUNCATE|ALTER|DROP|VACUUM)/i, s);
      assert.doesNotMatch(s, /\bDELETE FROM\b/i, s);
    }
    const begins = statements.filter((s) => s.startsWith("BEGIN"));
    assert.ok(begins.length >= 4);
    assert.ok(begins.every((s) => s === "BEGIN READ ONLY"));
    assert.equal(statements.filter((s) => s === "ROLLBACK").length, begins.length);
  });
});

describe("batched delete SQL", () => {
  it("select uses the (type, created_at) index shape with keyset bound and LIMIT", () => {
    const [discovery] = retention.listDeleteTargets();
    const sql = retention.batchSelectSql(discovery).replace(/\s+/g, " ");
    assert.match(sql, /WHERE type = \$1 AND created_at < \$2 AND created_at >= \$3 AND recipient_role = ANY\(\$5::text\[\]\)/);
    assert.match(sql, /ORDER BY created_at ASC LIMIT \$4/);
    const del = retention.batchDeleteSql(discovery).replace(/\s+/g, " ");
    assert.match(del, /^WITH batch AS \( SELECT id, created_at FROM notifications .* \) DELETE FROM notifications n USING batch WHERE n\.id = batch\.id RETURNING batch\.created_at$/);
    const fallback = retention.listDeleteTargets().find((t) => t.type === "order.created" && t.exceptRoles);
    assert.match(retention.batchSelectSql(fallback), /recipient_role IS NULL OR recipient_role <> ALL\(\$5::text\[\]\)/);
    assert.deepEqual(retention.batchParams(discovery, { cutoff: "c", lowerBound: "l", limit: 9 }), ["order.created", "c", "l", 9, ["freelancer"]]);
  });
});

/** In-memory notifications table driven by the batch SQL parameters. */
function makeTableClient(rows, { failOnBatch = null } = {}) {
  const table = rows.map((r, i) => ({ id: i + 1, ...r }));
  const log = { batches: [], sets: [] };
  const client = {
    table,
    log,
    async query(sql, params) {
      const text = String(sql);
      if (/^SET statement_timeout/.test(text)) {
        log.sets.push(text);
        return { rows: [] };
      }
      assert.match(text, /DELETE FROM notifications n USING batch/);
      log.batches.push(params[3]);
      if (failOnBatch === log.batches.length) throw Object.assign(new Error("lock timeout"), { code: "55P03" });
      const [type, cutoff, lower, limit, roles] = params;
      const lowerMs = lower === "-infinity" ? -Infinity : new Date(lower).getTime();
      const matches = table
        .filter((r) => r.type === type && r.created_at.getTime() < cutoff.getTime() && r.created_at.getTime() >= lowerMs)
        .filter((r) => {
          if (!roles) return true;
          if (/= ANY/.test(text)) return roles.includes(r.recipient_role);
          return r.recipient_role == null || !roles.includes(r.recipient_role);
        })
        .sort((a, b) => a.created_at - b.created_at)
        .slice(0, limit);
      for (const m of matches) table.splice(table.indexOf(m), 1);
      return { rows: matches.map((m) => ({ created_at: m.created_at })) };
    },
  };
  return client;
}

function seedRows() {
  const rows = [];
  for (let i = 0; i < 23; i += 1) rows.push({ type: "order.created", recipient_role: "freelancer", created_at: new Date(daysAgo(40 + i)) });
  for (let i = 0; i < 4; i += 1) rows.push({ type: "order.created", recipient_role: "freelancer", created_at: new Date(daysAgo(5)) });
  rows.push({ type: "order.created", recipient_role: "client", created_at: new Date(daysAgo(40)) });
  rows.push({ type: "order.created", recipient_role: "client", created_at: new Date(daysAgo(400)) });
  rows.push({ type: "payment_success", recipient_role: "freelancer", created_at: new Date(daysAgo(500)) });
  rows.push({ type: "user.registered", recipient_role: "freelancer", created_at: new Date(daysAgo(366)) });
  rows.push({ type: "unknown.type", recipient_role: "freelancer", created_at: new Date(daysAgo(900)) });
  return rows;
}

describe("runApply — bounded, resumable, idempotent, stop-on-error", () => {
  it("deletes only eligible rows in batches no larger than batch size", async () => {
    const client = makeTableClient(seedRows());
    const out = await retention.runApply(client, { now: NOW, batchSize: 100, sleepMs: 0 });
    assert.equal(out.stoppedAt, "complete");
    assert.equal(out.deleted, 25, "23 old freelancer order.created + 1 client 400d + 1 user.registered 366d");
    const left = client.table.map((r) => `${r.type}|${r.recipient_role}`).sort();
    assert.deepEqual(left, [
      "order.created|client",
      "order.created|freelancer",
      "order.created|freelancer",
      "order.created|freelancer",
      "order.created|freelancer",
      "payment_success|freelancer",
      "unknown.type|freelancer",
    ]);
    assert.ok(client.log.sets.some((s) => /statement_timeout/.test(s)));
  });

  it("batch size below minimum is clamped; every batch is bounded", async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ type: "order.created", recipient_role: "freelancer", created_at: new Date(daysAgo(31 + (i % 50))) }));
    const client = makeTableClient(rows);
    const out = await retention.runApply(client, { now: NOW, batchSize: 1, sleepMs: 0 });
    assert.equal(out.batchSize, 100);
    assert.equal(out.deleted, 250);
    assert.ok(client.log.batches.every((n) => n <= 100));
  });

  it("max-rows caps a run; re-running resumes and a final run deletes nothing", async () => {
    const client = makeTableClient(seedRows());
    const first = await retention.runApply(client, { now: NOW, batchSize: 100, sleepMs: 0, maxRows: 10 });
    assert.equal(first.stoppedAt, "max_rows");
    assert.equal(first.deleted, 10);
    const second = await retention.runApply(client, { now: NOW, batchSize: 100, sleepMs: 0 });
    assert.equal(second.deleted, 15);
    const third = await retention.runApply(client, { now: NOW, batchSize: 100, sleepMs: 0 });
    assert.equal(third.deleted, 0);
  });

  it("stops on the first error and reports progress", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ type: "order.created", recipient_role: "freelancer", created_at: new Date(daysAgo(31 + i)) }));
    const client = makeTableClient(rows, { failOnBatch: 2 });
    await assert.rejects(retention.runApply(client, { now: NOW, batchSize: 100, sleepMs: 0 }), (err) => {
      assert.equal(err.code, "55P03");
      assert.equal(err.retentionProgress.deleted, 100);
      return true;
    });
    assert.equal(client.table.length, 200, "nothing after the failing batch ran");
  });
});

describe("CLI guards", () => {
  it("default is dry run", () => {
    const args = cli.parseArgs([]);
    assert.equal(args.apply, false);
    assert.equal(args.explain, false);
    assert.doesNotThrow(() => cli.assertApplyAllowed(args, { DATABASE_URL: process.env.DATABASE_URL }));
  });

  it("--apply without the confirm token is refused", () => {
    assert.throws(() => cli.assertApplyAllowed(cli.parseArgs(["--apply"]), {}), /--confirm=DELETE_EXPIRED_NOTIFICATIONS/);
    assert.throws(() => cli.assertApplyAllowed(cli.parseArgs(["--apply", "--confirm=yes"]), {}), /--confirm=/);
  });

  it("production apply additionally needs ALLOW_PRODUCTION_NOTIFICATION_RETENTION=1", () => {
    const args = cli.parseArgs(["--apply", `--confirm=${cli.CONFIRM_TOKEN}`]);
    const env = { DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x", APP_ENV: "production" };
    assert.throws(() => cli.assertApplyAllowed(args, env), /ALLOW_PRODUCTION_NOTIFICATION_RETENTION=1/);
    assert.doesNotThrow(() => cli.assertApplyAllowed(args, { ...env, ALLOW_PRODUCTION_NOTIFICATION_RETENTION: "1" }));
    assert.doesNotThrow(() => cli.assertApplyAllowed(args, { DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/x", APP_ENV: "staging" }));
  });

  it("unknown flags are rejected", () => {
    assert.throws(() => cli.parseArgs(["--delete-everything"]), /unknown argument/);
  });
});
