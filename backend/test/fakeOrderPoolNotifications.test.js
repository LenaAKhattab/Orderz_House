/**
 * Fake-order pool notifications — one summary per freelancer per training round (R1A growth control).
 * Run: node --test test/fakeOrderPoolNotifications.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/fake_order_pool_notifications_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const servicePath = path.join(__dirname, "..", "src", "services", "fakeOrderPoolNotificationService.js");
const fakeOrdersPath = path.join(__dirname, "..", "src", "services", "fakeOrdersService.js");
const ordersServicePath = path.join(__dirname, "..", "src", "services", "ordersService.js");
const migrationPath = path.join(
  __dirname,
  "..",
  "sql",
  "migrations",
  "121_fake_order_round_items_pool_notification_dispatched.sql",
);

const MODULE_IDS = [
  "../src/config/db",
  "../src/services/notificationEventsService",
  "../src/services/notificationService",
  "../src/services/notificationPreferenceCache",
  "../src/services/notificationRealtimeHub",
  "../src/services/fcmPushService",
  "../src/services/fakeOrderPoolNotificationService",
];

function clearModules() {
  for (const id of MODULE_IDS) delete require.cache[require.resolve(id)];
}

function stubModule(id, exports) {
  const p = require.resolve(id);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

function loadDispatcherWithMocks({ queryImpl, notifyUsersDedupedImpl, getRoleUserIdsImpl }) {
  clearModules();
  stubModule("../src/config/db", { pool: { query: queryImpl } });
  stubModule("../src/services/notificationEventsService", {
    getRoleUserIds: getRoleUserIdsImpl || (async () => [101, 102]),
    notifyUsersDeduped: notifyUsersDedupedImpl,
    notifyUsers: async () => {
      throw new Error("per-order notifyUsers must not be used for training rounds");
    },
  });
  // eslint-disable-next-line global-require
  return require("../src/services/fakeOrderPoolNotificationService");
}

const SETTINGS_ALL = { training_orders_enabled: true, show_to_all_freelancers: true, show_to_all_visitors: false };

/**
 * In-memory model of the dispatcher's SQL: due items, per-round visible counts, dispatch stamps.
 * items: { roundItemId, roundId, badge?, visible? (default true) }
 */
function makeDb({ settings = SETTINGS_ALL, items = [], visibleCountByRound = null, planRecipients = [] }) {
  const state = {
    dispatched: new Set(items.filter((i) => i.dispatched).map((i) => i.roundItemId)),
    queries: [],
    updates: [],
  };
  const queryImpl = async (sql, params) => {
    const text = String(sql);
    state.queries.push(text);
    if (text.includes("FROM fake_order_settings WHERE id = 1") && text.includes("SELECT *")) {
      return { rows: [settings] };
    }
    if (text.includes("pool_notification_dispatched_at IS NULL") && text.includes("ORDER BY ri.visible_from")) {
      const due = items.filter((i) => i.visible !== false && !state.dispatched.has(i.roundItemId));
      return {
        rows: due.slice(0, Number(params[0])).map((i) => ({
          round_item_id: i.roundItemId,
          round_id: i.roundId,
          fake_order_id: 1000 + i.roundItemId,
          show_training_badge: i.badge === true,
        })),
      };
    }
    if (text.includes("SELECT EXISTS") && text.includes("pool_notification_dispatched_at IS NOT NULL")) {
      const rid = Number(params[0]);
      return { rows: [{ dispatched: items.some((i) => i.roundId === rid && state.dispatched.has(i.roundItemId)) }] };
    }
    if (text.includes("COUNT(*)::int AS c") && text.includes("ri.round_id = $1")) {
      const rid = Number(params[0]);
      const c = visibleCountByRound && rid in visibleCountByRound
        ? visibleCountByRound[rid]
        : items.filter((i) => i.roundId === rid && i.visible !== false).length;
      return { rows: [{ c }] };
    }
    if (text.includes("UPDATE fake_order_round_items") && text.includes("pool_notification_dispatched_at = NOW()")) {
      const ids = params[0].map(Number);
      state.updates.push(ids);
      let rowCount = 0;
      for (const id of ids) {
        if (!state.dispatched.has(id)) {
          state.dispatched.add(id);
          rowCount += 1;
        }
      }
      return { rowCount };
    }
    if (text.includes("fake_order_settings_plans")) {
      return { rows: planRecipients.map((id) => ({ id })) };
    }
    return { rows: [] };
  };
  return { state, queryImpl };
}

/** Mimics notifyUsersDeduped: per-recipient key `${base}_u${uid}`, conflict → no row. */
function makeDedupedNotifier({ failOnCall = null } = {}) {
  const calls = [];
  const rowsByKey = new Map();
  let n = 0;
  const impl = async (payload) => {
    n += 1;
    calls.push(payload);
    if (failOnCall === n) throw new Error("simulated chunk failure");
    const inserted = [];
    for (const uid of payload.userIds) {
      const key = `${payload.dedupeKey}_u${uid}`;
      if (rowsByKey.has(key)) continue;
      const row = { id: String(rowsByKey.size + 1), recipientUserId: String(uid), ...payload, dedupeKey: key };
      rowsByKey.set(key, row);
      inserted.push(row);
    }
    return inserted;
  };
  return { calls, rowsByKey, impl };
}

afterEach(() => clearModules());

describe("buildPoolSummaryNotificationCopy", () => {
  // eslint-disable-next-line global-require
  const { buildPoolSummaryNotificationCopy, FORBIDDEN_CONTENT_RE } = require("../src/services/fakeOrderPoolNotificationService");

  it("neutral copy (badge hidden) never reveals training orders", () => {
    for (const count of [1, 2, 3, 10, 11, 99, 100, 101, 1234]) {
      const c = buildPoolSummaryNotificationCopy({ count, showTrainingBadge: false });
      for (const s of [c.title, c.message, c.titleEn, c.messageEn]) {
        assert.equal(FORBIDDEN_CONTENT_RE.test(s), false, `${count}: ${s}`);
      }
      assert.equal(c.title, "تمت إضافة مجموعة جديدة من الطلبات");
    }
  });

  it("training copy (badge shown) uses the requested wording", () => {
    const c = buildPoolSummaryNotificationCopy({ count: 7, showTrainingBadge: true });
    assert.equal(c.title, "تمت إضافة مجموعة جديدة من الطلبات التدريبية");
    assert.equal(c.message, "يتوفر الآن 7 طلبات تدريبية جديدة مناسبة لك.");
    assert.equal(c.titleEn, "A new batch of training orders was added");
    assert.equal(c.messageEn, "7 new training orders suitable for you are now available.");
  });

  it("Arabic and English number agreement: singular, dual, few, many, hundreds", () => {
    const m = (count) => buildPoolSummaryNotificationCopy({ count }).message;
    assert.equal(m(1), "يتوفر الآن طلب جديد واحد مناسب لك.");
    assert.equal(m(2), "يتوفر الآن طلبان جديدان مناسبان لك.");
    assert.equal(m(3), "يتوفر الآن 3 طلبات جديدة مناسبة لك.");
    assert.equal(m(10), "يتوفر الآن 10 طلبات جديدة مناسبة لك.");
    assert.equal(m(11), "يتوفر الآن 11 طلبًا جديدًا مناسبًا لك.");
    assert.equal(m(25), "يتوفر الآن 25 طلبًا جديدًا مناسبًا لك.");
    assert.equal(m(100), "يتوفر الآن 100 طلب جديد مناسب لك.");
    assert.equal(m(1234), "يتوفر الآن 1234 طلبًا جديدًا مناسبًا لك.");
    assert.equal(buildPoolSummaryNotificationCopy({ count: 1 }).messageEn, "1 new order suitable for you is now available.");
    assert.equal(buildPoolSummaryNotificationCopy({ count: 2 }).messageEn, "2 new orders suitable for you are now available.");
  });
});

describe("dispatchNewlyVisibleFakeOrderNotifications — one summary per freelancer per round", () => {
  let notifier;
  beforeEach(() => {
    notifier = makeDedupedNotifier();
  });

  it("a round with several visible orders creates one summary per recipient (not one per order)", async () => {
    const db = makeDb({
      items: [
        { roundItemId: 11, roundId: 7 },
        { roundItemId: 12, roundId: 7 },
        { roundItemId: 13, roundId: 7 },
      ],
    });
    const svc = loadDispatcherWithMocks({
      queryImpl: db.queryImpl,
      getRoleUserIdsImpl: async () => [101, 102, 103],
      notifyUsersDedupedImpl: notifier.impl,
    });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 1);
    assert.equal(notifier.rowsByKey.size, 3, "3 recipients × 1 round = 3 rows");
    const call = notifier.calls[0];
    assert.deepEqual(call.userIds, [101, 102, 103]);
    assert.equal(call.type, "order.pool.summary");
    assert.equal(call.dedupeKey, "pool_round_summary_r7");
    assert.equal(call.link, "/dashboard/freelancer/orders");
    assert.equal(call.entityType, "marketplace");
    assert.equal(call.entityId, null);
    assert.equal(call.metadata.visibleCount, 3);
    assert.match(call.message, /3 طلبات جديدة/);
    assert.deepEqual(db.state.updates, [[11, 12, 13]], "all due items of the round stamped in one update");
    assert.equal(out.summarizedRounds, 1);
    assert.equal(out.summaryRows, 3);
    assert.equal(out.marked, 3);
  });

  it("no internal round/order ids or titles in the user-visible fields", async () => {
    const db = makeDb({ items: [{ roundItemId: 51, roundId: 4242 }] });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    const call = notifier.calls[0];
    const visible = JSON.stringify([call.title, call.message, call.link, call.metadata]);
    assert.doesNotMatch(visible, /4242|1051|\b51\b/);
  });

  it("retry after success: later stagger batch of the same round is marked silently (no new rows)", async () => {
    const items = [
      { roundItemId: 21, roundId: 9 },
      { roundItemId: 22, roundId: 9, visible: false },
    ];
    const db = makeDb({ items });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 1);
    items[1].visible = true; // next stagger batch becomes visible
    const second = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 1, "no second summary for the same round");
    assert.equal(second.silentRounds, 1);
    assert.equal(second.marked, 1);
    const third = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(third.processed, 0);
  });

  it("dedupe on retry: repeated dispatch with the same round key inserts nothing new", async () => {
    const db = makeDb({ items: [{ roundItemId: 31, roundId: 3 }] });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    db.state.dispatched.clear(); // simulate a lost dispatch stamp (crash between insert and stamp)
    const retry = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 2);
    assert.equal(notifier.calls[1].dedupeKey, notifier.calls[0].dedupeKey);
    assert.equal(retry.summaryRows, 0, "same per-recipient keys → no new rows (and therefore no pushes)");
    assert.equal(notifier.rowsByKey.size, 2);
  });

  it("partial fan-out failure leaves items undispatched; retry completes only missing recipients", async () => {
    notifier = makeDedupedNotifier({ failOnCall: 2 });
    const recipients = Array.from({ length: 25 }, (_, i) => 500 + i);
    const db = makeDb({ items: [{ roundItemId: 41, roundId: 5 }] });
    const svc = loadDispatcherWithMocks({
      queryImpl: db.queryImpl,
      getRoleUserIdsImpl: async () => recipients,
      notifyUsersDedupedImpl: notifier.impl,
    });
    const first = await svc.dispatchNewlyVisibleFakeOrderNotifications({ recipientChunkSize: 10 });
    assert.equal(first.ok, false);
    assert.equal(first.marked, 0, "not stamped while some recipients are missing");
    assert.equal(notifier.rowsByKey.size, 15, "chunks 1 and 3 succeeded");
    const second = await svc.dispatchNewlyVisibleFakeOrderNotifications({ recipientChunkSize: 10 });
    assert.equal(second.ok, true);
    assert.equal(second.summaryRows, 10, "only the failed chunk's recipients get rows on retry");
    assert.equal(notifier.rowsByKey.size, 25, "exactly one summary per recipient overall");
    assert.equal(second.marked, 1);
  });

  it("announced count is the committed visible count, not requested or loaded item count", async () => {
    // Round requested 20, only 17 committed/visible; 3 due items loaded this pass.
    const db = makeDb({
      items: [
        { roundItemId: 61, roundId: 12 },
        { roundItemId: 62, roundId: 12 },
        { roundItemId: 63, roundId: 12 },
      ],
      visibleCountByRound: { 12: 17 },
    });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls[0].metadata.visibleCount, 17);
    assert.match(notifier.calls[0].message, /17 طلبًا/);
    assert.match(notifier.calls[0].metadata.messageEn, /^17 new orders/);
  });

  it("round with nothing visible any more announces nothing and stamps nothing", async () => {
    const db = makeDb({ items: [{ roundItemId: 71, roundId: 13 }], visibleCountByRound: { 13: 0 } });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 0);
    assert.equal(out.marked, 0);
  });

  it("two rounds due at once → one summary per round, wording per round badge", async () => {
    const db = makeDb({
      items: [
        { roundItemId: 81, roundId: 20, badge: false },
        { roundItemId: 82, roundId: 21, badge: true },
        { roundItemId: 83, roundId: 21, badge: true },
      ],
    });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 2);
    assert.equal(out.summarizedRounds, 2);
    const [a, b] = notifier.calls;
    assert.equal(a.dedupeKey, "pool_round_summary_r20");
    assert.equal(a.title, "تمت إضافة مجموعة جديدة من الطلبات");
    assert.equal(b.dedupeKey, "pool_round_summary_r21");
    assert.equal(b.title, "تمت إضافة مجموعة جديدة من الطلبات التدريبية");
  });

  it("rounds already dispatched under the per-order scheme stay silent after deploy", async () => {
    const db = makeDb({
      items: [
        { roundItemId: 91, roundId: 30, dispatched: true },
        { roundItemId: 92, roundId: 30 },
      ],
    });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(notifier.calls.length, 0);
    assert.equal(out.silentRounds, 1);
    assert.equal(out.marked, 1);
  });

  it("plan-restricted audience uses the settings plans query, not all freelancers", async () => {
    let usedGetRole = false;
    const db = makeDb({
      settings: { training_orders_enabled: true, show_to_all_freelancers: false, show_to_all_visitors: false },
      items: [{ roundItemId: 1, roundId: 1 }],
      planRecipients: [201],
    });
    const svc = loadDispatcherWithMocks({
      queryImpl: db.queryImpl,
      getRoleUserIdsImpl: async () => {
        usedGetRole = true;
        return [999];
      },
      notifyUsersDedupedImpl: notifier.impl,
    });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(usedGetRole, false);
    assert.deepEqual(notifier.calls[0].userIds, [201]);
  });

  it("empty due set (pre-marked / rollout) creates no notifications", async () => {
    const db = makeDb({ items: [] });
    const svc = loadDispatcherWithMocks({ queryImpl: db.queryImpl, notifyUsersDedupedImpl: notifier.impl });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(out.processed, 0);
    assert.equal(notifier.calls.length, 0);
  });
});

describe("notificationService.createManyIfNotExists — preferences, dedupe, one push per new row", () => {
  let pushes;
  let realtime;
  let inserts;

  function loadNotificationService({ prefs = {}, existingKeys = new Set() } = {}) {
    clearModules();
    pushes = [];
    realtime = [];
    inserts = [];
    const store = new Set(existingKeys);
    stubModule("../src/config/db", {
      pool: {
        query: async (sql, params) => {
          const text = String(sql);
          assert.match(text, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/);
          inserts.push(params.length / 12);
          const rows = [];
          for (let i = 0; i < params.length; i += 12) {
            const key = params[i + 11];
            if (store.has(key)) continue;
            store.add(key);
            rows.push({
              id: rows.length + 1,
              recipient_user_id: params[i],
              recipient_role: params[i + 1],
              type: params[i + 3],
              title: params[i + 4],
              message: params[i + 5],
              entity_type: params[i + 6],
              entity_id: params[i + 7],
              link: params[i + 8],
              priority: params[i + 9],
              metadata: JSON.parse(params[i + 10]),
              dedupe_key: key,
            });
          }
          return { rows };
        },
      },
    });
    stubModule("../src/services/notificationPreferenceCache", {
      getUserNotificationPreferences: async (uid) => prefs[uid] || {},
      getManyUserNotificationPreferences: async (ids) => new Map(ids.map((uid) => [uid, prefs[uid] || {}])),
      invalidateUserNotificationPreferences: () => {},
    });
    stubModule("../src/services/notificationRealtimeHub", { publish: (uid) => realtime.push(uid) });
    stubModule("../src/services/fcmPushService", { queuePushForNotification: (n) => pushes.push(n.recipientUserId) });
    // eslint-disable-next-line global-require
    const notificationService = require("../src/services/notificationService");
    // eslint-disable-next-line global-require
    const events = require("../src/services/notificationEventsService");
    return { notificationService, events, store };
  }

  const payload = {
    recipientRole: "freelancer",
    type: "order.pool.summary",
    title: "تمت إضافة مجموعة جديدة من الطلبات",
    message: "يتوفر الآن 3 طلبات جديدة مناسبة لك.",
    entityType: "marketplace",
    entityId: null,
    link: "/dashboard/freelancer/orders",
    priority: "medium",
    metadata: { visibleCount: 3 },
    dedupeKey: "pool_round_summary_r7",
  };

  it("one multi-row insert; one push + one realtime event per inserted summary", async () => {
    const { events } = loadNotificationService();
    const rows = await events.notifyUsersDeduped({ ...payload, userIds: [1, 2, 3] });
    assert.equal(rows.length, 3);
    assert.deepEqual(inserts, [3], "single INSERT with 3 rows");
    assert.deepEqual(pushes, ["1", "2", "3"]);
    assert.equal(realtime.length, 3);
    assert.deepEqual(rows.map((r) => r.dedupeKey), ["pool_round_summary_r7_u1", "pool_round_summary_r7_u2", "pool_round_summary_r7_u3"]);
  });

  it("retry with the same keys: no rows, no push", async () => {
    const { events } = loadNotificationService();
    await events.notifyUsersDeduped({ ...payload, userIds: [1, 2] });
    pushes.length = 0;
    const again = await events.notifyUsersDeduped({ ...payload, userIds: [1, 2] });
    assert.equal(again.length, 0);
    assert.equal(pushes.length, 0);
  });

  it("recipient who turned off order notifications gets no row and no push", async () => {
    const { events } = loadNotificationService({ prefs: { 2: { orders: false } } });
    const rows = await events.notifyUsersDeduped({ ...payload, userIds: [1, 2, 3] });
    assert.deepEqual(rows.map((r) => r.recipientUserId), ["1", "3"]);
    assert.deepEqual(pushes, ["1", "3"]);
    assert.deepEqual(inserts, [2]);
  });

  it("all recipients opted out → no insert at all", async () => {
    const { events } = loadNotificationService({ prefs: { 1: { orders: false } } });
    const rows = await events.notifyUsersDeduped({ ...payload, userIds: [1] });
    assert.equal(rows.length, 0);
    assert.deepEqual(inserts, []);
  });

  it("every batched item must carry a dedupe key", async () => {
    const { notificationService } = loadNotificationService();
    await assert.rejects(
      notificationService.createManyIfNotExists([{ ...payload, recipientUserId: 1, dedupeKey: null }]),
      /dedupeKey is required/,
    );
    await assert.rejects(
      // eslint-disable-next-line global-require
      require("../src/services/notificationEventsService").notifyUsersDeduped({ ...payload, userIds: [1], dedupeKey: "" }),
      /dedupeKey is required/,
    );
  });
});

describe("real client/admin orders keep per-order order.created notifications", () => {
  const ordersSrc = fs.readFileSync(ordersServicePath, "utf8");
  const serviceSrc = fs.readFileSync(servicePath, "utf8");

  it("client bidding broadcast: order.created per real order, order-scoped dedupe", () => {
    const start = ordersSrc.indexOf("function scheduleClientBiddingPoolFreelancerNotifications(");
    const fn = ordersSrc.slice(start, ordersSrc.indexOf("\n}\n", start));
    assert.match(fn, /notificationEventsService\.notifyUsers\(/);
    assert.match(fn, /type: "order\.created"/);
    assert.match(fn, /dedupeKey: `order_bidding_created_\$\{String\(oid\)\}`/);
    assert.match(fn, /link: `\/dashboard\/freelancer\/orders\/\$\{encodeURIComponent\(String\(oid\)\)\}`/);
  });

  it("admin-created pool order broadcast and client owner confirmation are unchanged", () => {
    assert.match(ordersSrc, /dedupeKey: `order_created_pool_\$\{String\(orderRow\.id\)\}`/);
    assert.match(ordersSrc, /dedupeKey: `order_created_\$\{String\(orderRow\.id\)\}`/);
  });

  it("training summary path never touches real orders or the order.created type", () => {
    assert.doesNotMatch(serviceSrc, /type: "order\.created"/);
    assert.doesNotMatch(serviceSrc, /FROM orders\b/);
    assert.doesNotMatch(serviceSrc, /notifyUsers\(/);
  });

  it("mixed: a real-order broadcast and a training summary for the same freelancer are independent rows", async () => {
    const notifier = makeDedupedNotifier();
    const db = makeDb({ items: [{ roundItemId: 101, roundId: 40 }] });
    const realOrderCalls = [];
    clearModules();
    stubModule("../src/config/db", { pool: { query: db.queryImpl } });
    stubModule("../src/services/notificationEventsService", {
      getRoleUserIds: async () => [7],
      notifyUsersDeduped: notifier.impl,
      notifyUsers: async (p) => {
        realOrderCalls.push(p);
        return [];
      },
    });
    // eslint-disable-next-line global-require
    const svc = require("../src/services/fakeOrderPoolNotificationService");
    // eslint-disable-next-line global-require
    const events = require("../src/services/notificationEventsService");
    // Real order broadcast (same shape ordersService sends) — untouched by the training dispatcher.
    await events.notifyUsers({ userIds: [7], type: "order.created", entityType: "order", entityId: 555, dedupeKey: "order_bidding_created_555" });
    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(realOrderCalls.length, 1);
    assert.equal(realOrderCalls[0].type, "order.created");
    assert.equal(notifier.calls.length, 1);
    assert.equal(notifier.calls[0].type, "order.pool.summary");
    assert.notEqual(notifier.calls[0].dedupeKey, realOrderCalls[0].dedupeKey);
  });
});

describe("wiring — createFakeOrder must not notify; visibility paths schedule dispatch", () => {
  const fakeOrdersSrc = fs.readFileSync(fakeOrdersPath, "utf8");

  it("createFakeOrder does not schedule pool notifications", () => {
    const start = fakeOrdersSrc.indexOf("async function createFakeOrder(");
    const end = fakeOrdersSrc.indexOf("async function updateFakeOrder(", start);
    const fn = fakeOrdersSrc.slice(start, end > start ? end : start + 2000);
    assert.ok(fn.includes("INSERT INTO fake_orders"));
    assert.ok(!fn.includes("scheduleDispatchNewlyVisibleFakeOrderNotifications"));
    assert.ok(!fn.includes("notifyUsers"));
  });

  it("activateFakeOrdersInRound does not notify inline", () => {
    const start = fakeOrdersSrc.indexOf("async function activateFakeOrdersInRound(");
    const end = fakeOrdersSrc.indexOf("async function promoteEmergencyStaggerBatch(", start);
    const fn = fakeOrdersSrc.slice(start, end);
    assert.ok(!fn.includes("scheduleDispatchNewlyVisibleFakeOrderNotifications"));
    assert.ok(!fn.includes("notifyUsers"));
  });

  it("manual start, automation tick, ensure-min, and rotate schedule dispatch after commit", () => {
    assert.match(fakeOrdersSrc, /scheduleDispatchNewlyVisibleFakeOrderNotifications\(\{ reason: "manual_round_start" \}\)/);
    assert.match(fakeOrdersSrc, /scheduleDispatchNewlyVisibleFakeOrderNotifications\(\{ reason: "automation_tick" \}\)/);
    assert.match(fakeOrdersSrc, /automation_tick_notify_only/);
    assert.match(fakeOrdersSrc, /ensure_min_promote/);
    assert.match(fakeOrdersSrc, /ensure_min_generated/);
    assert.match(fakeOrdersSrc, /rotate_training_round_now/);
  });

  it("dispatcher queries only currently visible undispatched items", () => {
    const serviceSrc = fs.readFileSync(servicePath, "utf8");
    assert.match(serviceSrc, /pool_notification_dispatched_at IS NULL/);
    assert.match(serviceSrc, /ri\.visible_from <= NOW\(\)/);
    assert.match(serviceSrc, /ri\.visible_until > NOW\(\)/);
  });
});

describe("migration 121 rollout safety", () => {
  it("adds pool_notification_dispatched_at and backfills existing rows", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    assert.match(sql, /pool_notification_dispatched_at TIMESTAMPTZ NULL/);
    assert.match(sql, /UPDATE fake_order_round_items/);
    assert.match(sql, /SET pool_notification_dispatched_at = COALESCE/);
    assert.match(sql, /idx_fake_round_items_pool_notify_due/);
  });
});

describe("preference mapping", () => {
  it("order.pool.summary shares the orders category with order.created (backend + frontend mirror)", () => {
    // eslint-disable-next-line global-require
    const rules = require("../src/utils/notificationPreferenceRules");
    assert.equal(rules.getCategoryForType("order.created"), "orders");
    assert.equal(rules.getCategoryForType("order.pool.summary"), "orders");
    assert.equal(rules.isAllowedByPreferences({ orders: false }, "order.pool.summary", "medium"), false);
    assert.equal(rules.isAllowedByPreferences({}, "order.pool.summary", "medium"), true);
    const feRules = fs.readFileSync(
      path.join(__dirname, "..", "..", "frontend", "src", "utils", "notificationPreferenceRules.js"),
      "utf8",
    );
    assert.match(feRules, /"order\.pool\.summary": "orders"/);
  });
});

describe("viewer sanitize hides dedupe keys (they embed internal round ids)", () => {
  it("non-staff: dedupeKey removed; staff: kept", () => {
    // eslint-disable-next-line global-require
    const { sanitizeNotificationForViewer } = require("../src/utils/notificationViewerSanitize");
    const n = { id: "1", type: "order.pool.summary", dedupeKey: "pool_round_summary_r7_u3", metadata: { visibleCount: 3 } };
    assert.equal("dedupeKey" in sanitizeNotificationForViewer(n, "freelancer"), false);
    assert.equal(sanitizeNotificationForViewer(n, "admin").dedupeKey, "pool_round_summary_r7_u3");
    assert.equal(sanitizeNotificationForViewer(n, "freelancer").metadata.visibleCount, 3);
  });
});
