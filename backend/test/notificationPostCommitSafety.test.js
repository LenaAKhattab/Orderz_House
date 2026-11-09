/**
 * Notification post-commit safety: realtime / FCM only after the business transaction commits.
 * Run: node --test test/notificationPostCommitSafety.test.js
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/notification_post_commit_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const afterCommit = require("../src/config/afterCommit");

/** Fake pg client: resolves statements, reports COMMIT tag, can fail chosen statements. */
function fakeClient({ commitTag = "COMMIT", failOn = null, insertReturnsRow = true } = {}) {
  const log = [];
  let id = 0;
  return {
    log,
    query(sql, params) {
      const text = typeof sql === "string" ? sql : sql.text;
      log.push(text.trim().split(/\s+/).slice(0, 3).join(" "));
      if (failOn && failOn.test(text)) return Promise.reject(Object.assign(new Error("boom"), { code: "40001" }));
      if (/^\s*COMMIT/i.test(text)) return Promise.resolve({ command: commitTag, rows: [] });
      if (/^\s*INSERT INTO notifications/i.test(text)) {
        if (!insertReturnsRow) return Promise.resolve({ rows: [] });
        const n = (params?.length || 12) / 12;
        const rows = [];
        for (let i = 0; i < n; i += 1) {
          id += 1;
          rows.push({ id, recipient_user_id: params[i * 12], recipient_role: params[i * 12 + 1], type: params[i * 12 + 3], title: params[i * 12 + 4], message: params[i * 12 + 5], entity_type: params[i * 12 + 6], entity_id: params[i * 12 + 7], link: params[i * 12 + 8], priority: params[i * 12 + 9], metadata: {}, dedupe_key: params[i * 12 + 11] });
        }
        return Promise.resolve({ rows, rowCount: rows.length, command: "INSERT" });
      }
      return Promise.resolve({ rows: [], command: text.trim().split(/\s+/)[0].toUpperCase() });
    },
  };
}

describe("afterCommit — statement classification", () => {
  it("recognises transaction control and nothing else", () => {
    const c = afterCommit.classifyStatement;
    assert.deepEqual(c("BEGIN"), { kind: "begin" });
    assert.deepEqual(c("begin isolation level serializable"), { kind: "begin" });
    assert.deepEqual(c("START TRANSACTION"), { kind: "begin" });
    assert.deepEqual(c("COMMIT"), { kind: "commit" });
    assert.deepEqual(c(" commit; "), { kind: "commit" });
    assert.deepEqual(c("ROLLBACK"), { kind: "rollback" });
    assert.deepEqual(c("ROLLBACK TO SAVEPOINT s1"), { kind: "rollback_to", name: "S1" });
    assert.deepEqual(c("rollback to p"), { kind: "rollback_to", name: "P" });
    assert.deepEqual(c("SAVEPOINT s1"), { kind: "savepoint", name: "S1" });
    assert.deepEqual(c("RELEASE SAVEPOINT s1"), { kind: "release", name: "S1" });
    assert.deepEqual(c({ text: "COMMIT" }), { kind: "commit" });
    assert.equal(c("SELECT 1"), null);
    assert.equal(c("UPDATE orders SET x = 1 -- COMMIT"), null);
    assert.equal(c(undefined), null);
  });
});

describe("afterCommit — runAfterCommit semantics", () => {
  it("no transaction (pool / autocommit client / unknown object) → immediate", () => {
    let ran = 0;
    assert.equal(afterCommit.runAfterCommit({ query: async () => ({}) }, () => { ran += 1; }), "immediate");
    const client = afterCommit.instrumentClient(fakeClient());
    assert.equal(afterCommit.runAfterCommit(client, () => { ran += 1; }), "immediate");
    assert.equal(afterCommit.runAfterCommit(null, () => { ran += 1; }), "immediate");
    assert.equal(ran, 3);
  });

  it("inside a transaction: deferred; COMMIT runs it exactly once, before the caller continues", async () => {
    const order = [];
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    assert.equal(afterCommit.runAfterCommit(client, () => order.push("side-effect")), "deferred");
    assert.deepEqual(order, []);
    await client.query("COMMIT");
    order.push("caller-after-commit");
    assert.deepEqual(order, ["side-effect", "caller-after-commit"]);
    await client.query("COMMIT");
    assert.equal(order.filter((x) => x === "side-effect").length, 1, "never twice");
  });

  it("ROLLBACK drops pending work", async () => {
    let ran = 0;
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    afterCommit.runAfterCommit(client, () => { ran += 1; });
    await client.query("ROLLBACK");
    await client.query("COMMIT");
    assert.equal(ran, 0);
  });

  it("COMMIT of an aborted transaction (tag ROLLBACK) drops pending work", async () => {
    let ran = 0;
    const client = afterCommit.instrumentClient(fakeClient({ commitTag: "ROLLBACK" }));
    await client.query("BEGIN");
    afterCommit.runAfterCommit(client, () => { ran += 1; });
    await client.query("COMMIT");
    assert.equal(ran, 0);
  });

  it("failed COMMIT (e.g. serialization failure) drops pending work", async () => {
    let ran = 0;
    const client = afterCommit.instrumentClient(fakeClient({ failOn: /^COMMIT/ }));
    await client.query("BEGIN");
    afterCommit.runAfterCommit(client, () => { ran += 1; });
    await assert.rejects(client.query("COMMIT"));
    assert.equal(ran, 0);
    assert.equal(afterCommit.isInTransaction(client), false);
  });

  it("ROLLBACK TO SAVEPOINT drops only work registered after the savepoint", async () => {
    const ran = [];
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    afterCommit.runAfterCommit(client, () => ran.push("a"));
    await client.query("SAVEPOINT s1");
    afterCommit.runAfterCommit(client, () => ran.push("b"));
    await client.query("ROLLBACK TO SAVEPOINT s1");
    afterCommit.runAfterCommit(client, () => ran.push("c"));
    await client.query("SAVEPOINT s2");
    afterCommit.runAfterCommit(client, () => ran.push("d"));
    await client.query("RELEASE SAVEPOINT s2");
    await client.query("COMMIT");
    assert.deepEqual(ran, ["a", "c", "d"]);
  });

  it("a failing side effect never breaks the others or the caller", async () => {
    const ran = [];
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    afterCommit.runAfterCommit(client, () => { throw new Error("realtime down"); });
    afterCommit.runAfterCommit(client, async () => { throw new Error("fcm down"); });
    afterCommit.runAfterCommit(client, () => ran.push("ok"));
    await client.query("COMMIT");
    assert.deepEqual(ran, ["ok"]);
  });

  it("instrumentation is idempotent and keeps query results/errors untouched", async () => {
    const client = fakeClient({ failOn: /^SELECT broken/ });
    afterCommit.instrumentClient(client);
    const wrapped = client.query;
    afterCommit.instrumentClient(client);
    assert.equal(client.query, wrapped);
    assert.deepEqual((await client.query("SELECT 1")).command, "SELECT");
    await assert.rejects(client.query("SELECT broken"), /boom/);
  });
});

describe("notificationService — realtime + FCM only after COMMIT", () => {
  const ids = {
    db: require.resolve("../src/config/db"),
    prefs: require.resolve("../src/services/notificationPreferenceCache"),
    hub: require.resolve("../src/services/notificationRealtimeHub"),
    fcm: require.resolve("../src/services/fcmPushService"),
    svc: require.resolve("../src/services/notificationService"),
  };
  let realtime;
  let pushes;
  let failRealtime;
  let failPush;
  let poolClient;

  function stub(id, exports) {
    require.cache[id] = { id, filename: id, loaded: true, exports };
  }
  function load() {
    for (const id of Object.values(ids)) delete require.cache[id];
    poolClient = afterCommit.instrumentClient(fakeClient());
    stub(ids.db, { pool: { query: (...a) => poolClient.query(...a) } });
    stub(ids.prefs, {
      getUserNotificationPreferences: async () => ({}),
      getManyUserNotificationPreferences: async (uids) => new Map(uids.map((u) => [u, {}])),
      invalidateUserNotificationPreferences: () => {},
    });
    stub(ids.hub, { publish: (uid) => { if (failRealtime) throw new Error("sse down"); realtime.push(String(uid)); } });
    stub(ids.fcm, { queuePushForNotification: (n) => { if (failPush) throw new Error("fcm down"); pushes.push(String(n.recipientUserId)); } });
    // eslint-disable-next-line global-require
    return require("../src/services/notificationService");
  }
  beforeEach(() => {
    realtime = [];
    pushes = [];
    failRealtime = false;
    failPush = false;
  });
  afterEach(() => {
    for (const id of Object.values(ids)) delete require.cache[id];
  });

  const base = { recipientRole: "client", type: "order.delivery.approved", title: "تم قبول التسليم", message: "تم قبول التسليم وإغلاق المشروع بنجاح.", entityType: "order", entityId: 5, link: "/dashboard/client/my-orders?orderId=5", priority: "high" };

  it("committed transaction → one row, realtime once, push once", async () => {
    const svc = load();
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    const n = await svc.createNotification({ ...base, recipientUserId: 7 }, client);
    assert.equal(n.recipientUserId, "7");
    assert.deepEqual([realtime, pushes], [[], []], "nothing external before COMMIT");
    await client.query("COMMIT");
    assert.deepEqual(realtime, ["7"]);
    assert.deepEqual(pushes, ["7"]);
    assert.equal(client.log.filter((s) => s.startsWith("INSERT")).length, 1, "no second row");
  });

  it("rolled-back transaction → zero realtime, zero push", async () => {
    const svc = load();
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    await svc.createIfNotExists({ ...base, recipientUserId: 8 }, "k_rollback_8", client);
    await svc.notifyUsersDeduped?.({});
    await client.query("ROLLBACK");
    assert.deepEqual([realtime, pushes], [[], []]);
  });

  it("business statement failed later in the transaction → COMMIT becomes ROLLBACK → zero external dispatch", async () => {
    const svc = load();
    const client = afterCommit.instrumentClient(fakeClient({ commitTag: "ROLLBACK" }));
    await client.query("BEGIN");
    await svc.createNotification({ ...base, recipientUserId: 9 }, client);
    await client.query("COMMIT");
    assert.deepEqual([realtime, pushes], [[], []]);
  });

  it("outside a transaction (pool) → immediate, unchanged behaviour", async () => {
    const svc = load();
    await svc.createNotification({ ...base, recipientUserId: 10 });
    assert.deepEqual([realtime, pushes], [["10"], ["10"]]);
  });

  it("R1A summaries (batched insert) inside a transaction → one dispatch per row after COMMIT only", async () => {
    const svc = load();
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    const rows = await svc.createManyIfNotExists([1, 2, 3].map((u) => ({ recipientUserId: u, recipientRole: "freelancer", type: "order.pool.summary", title: "تمت إضافة مجموعة جديدة من الطلبات", message: "يتوفر الآن 13 طلبًا جديدًا مناسبًا لك.", entityType: "marketplace", entityId: null, link: "/dashboard/freelancer/orders", priority: "medium", dedupeKey: `pool_round_summary_r1_u${u}` })), client);
    assert.equal(rows.length, 3);
    assert.deepEqual(pushes, []);
    await client.query("COMMIT");
    assert.deepEqual(pushes.sort(), ["1", "2", "3"]);
    assert.equal(realtime.length, 3);
  });

  it("dedupe conflict (no row inserted) → no dispatch even after COMMIT", async () => {
    const svc = load();
    const client = afterCommit.instrumentClient(fakeClient({ insertReturnsRow: false }));
    await client.query("BEGIN");
    await svc.createIfNotExists({ ...base, recipientUserId: 11 }, "k_dupe_11", client);
    await client.query("COMMIT");
    assert.deepEqual(pushes, []);
  });

  it("FCM failure after COMMIT: business + notification stay committed, nothing thrown, realtime still sent", async () => {
    const svc = load();
    failPush = true;
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    await svc.createNotification({ ...base, recipientUserId: 12 }, client);
    await assert.doesNotReject(client.query("COMMIT"));
    assert.deepEqual(realtime, ["12"]);
    assert.ok(!client.log.includes("ROLLBACK"));
  });

  it("realtime failure after COMMIT: push still queued, nothing thrown", async () => {
    const svc = load();
    failRealtime = true;
    const client = afterCommit.instrumentClient(fakeClient());
    await client.query("BEGIN");
    await svc.createNotification({ ...base, recipientUserId: 13 }, client);
    await assert.doesNotReject(client.query("COMMIT"));
    assert.deepEqual(pushes, ["13"]);
  });
});

describe("producers — representative flows rely on the canonical path", () => {
  const read = (rel) => fs.readFileSync(path.join(__dirname, "..", "src", rel), "utf8");
  const slice = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end, src.indexOf(start) + start.length));

  it("db.js makes every checked-out client transaction-aware (callback and promise forms)", () => {
    const src = read("config/db.js");
    assert.match(src, /require\("\.\/afterCommit"\)/);
    assert.equal((src.match(/instrumentClient\(client\)/g) || []).length, 2);
  });

  it("notificationService has no realtime/push call outside dispatchExternally", () => {
    const src = read("services/notificationService.js");
    const helper = slice(src, "function dispatchExternally", "async function createNotification");
    assert.equal((src.match(/queuePushForNotification\(/g) || []).length, 1, "push queued only in dispatchExternally");
    assert.equal((helper.match(/queuePushForNotification\(/g) || []).length, 1);
    assert.equal((src.match(/[^ ]\s*publishRealtime\(/g) || []).length, 2, "definition + the single call in dispatchExternally");
    assert.equal((helper.match(/publishRealtime\(/g) || []).length, 1);
    assert.equal((src.match(/dispatchExternally\(runner, (\[mapped\]|mapped)\);/g) || []).length, 4, "all four create paths");
  });

  it("delivery: notification after COMMIT with orderId / submissionId / openReview=1", () => {
    const fn = slice(read("services/ordersService.js"), "async function submitFreelancerOrderDelivery(", "\nasync function ");
    const commit = fn.indexOf('await client.query("COMMIT")');
    const notify = fn.indexOf("notificationService.createNotification(deliveryNotifyPayload)");
    assert.ok(commit > 0 && notify > commit);
    assert.match(fn, /openReview=1/);
    assert.match(fn, /submissionId: String\(submissionRow\.id\)/);
  });

  it("revision / order lifecycle / payment / membership / moderation pass the transaction client", () => {
    const orders = read("services/ordersService.js");
    const revision = slice(orders, "async function adminRequestInternalDeliveryRevision(", "\nasync function ");
    assert.ok(revision.indexOf('type: "order.revision.requested"') < revision.indexOf('await client.query("COMMIT")'));
    assert.match(revision, /\},\s*client,\s*\),\s*\);/);
    // Canonical body (also used atomically by external order intake approval).
    const internal = slice(orders, "async function createInternalOrderInTransaction(", "\nasync function ");
    assert.match(internal, /type: "order\.created"[\s\S]*?\},\s*client,\s*\)/);
    const webhook = read("controllers/stripeWebhookController.js");
    const paid = slice(webhook, "async function applyCheckoutSessionClientOrderCompleted(", "\nasync function ");
    assert.match(paid, /type: "payment\.client_order\.succeeded"[\s\S]*?client,\s*\)/);
    const subs = read("services/subscriptionsService.js");
    assert.match(slice(subs, "async function assignPlanToFreelancer(", "\nasync function "), /notifySubscriptionOwner\([\s\S]*?client/);
    const feedback = read("services/feedbackService.js");
    assert.match(slice(feedback, "async function adminUpdateFeedback(", "\nasync function "), /notifyUsers\([\s\S]*?client/);
  });

  it("pool-based notifications inside a caller's transaction are deferred explicitly", () => {
    const articles = read("services/marketplaceArticleApplicationsService.js");
    assert.equal((articles.match(/runAfterCommit\(client, \(\) =>\s*notificationService\.createIfNotExists/g) || []).length, 2);
    assert.match(read("services/referralAttributionService.js"), /runAfterCommit\(client, async \(\) => \{\s*try \{\s*await notificationService\.createNotification/);
    const commission = read("services/referralCommissionService.js");
    assert.match(commission, /function notifyReferrer\(input, client\) \{\s*runAfterCommit\(client,/);
    assert.equal((commission.match(/\}, (client|db)\);/g) || []).length >= 3, true);
  });

  it("R1A dispatcher still sends one summary per recipient (batched insert, dedupe key per round)", () => {
    const src = read("services/fakeOrderPoolNotificationService.js");
    assert.match(src, /notificationEventsService\.notifyUsersDeduped\(/);
    assert.match(src, /pool_round_summary_r\$\{Number\(roundId\)\}/);
  });
});
