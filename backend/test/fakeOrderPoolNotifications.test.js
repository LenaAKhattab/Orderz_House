/**
 * Fake-order pool-entry notification dispatcher — unit + source contract tests.
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
const migrationPath = path.join(
  __dirname,
  "..",
  "sql",
  "migrations",
  "121_fake_order_round_items_pool_notification_dispatched.sql",
);

function loadDispatcherWithMocks({ queryImpl, notifyUsersImpl, getRoleUserIdsImpl }) {
  const dbPath = require.resolve("../src/config/db");
  const eventsPath = require.resolve("../src/services/notificationEventsService");
  const targetPath = require.resolve("../src/services/fakeOrderPoolNotificationService");
  delete require.cache[dbPath];
  delete require.cache[eventsPath];
  delete require.cache[targetPath];

  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { pool: { query: queryImpl } },
  };
  require.cache[eventsPath] = {
    id: eventsPath,
    filename: eventsPath,
    loaded: true,
    exports: {
      getRoleUserIds: getRoleUserIdsImpl || (async () => [101, 102]),
      notifyUsers: notifyUsersImpl,
    },
  };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("../src/services/fakeOrderPoolNotificationService");
}

describe("buildPoolEntryNotificationCopy", () => {
  // eslint-disable-next-line global-require
  const { buildPoolEntryNotificationCopy, FORBIDDEN_CONTENT_RE } = require("../src/services/fakeOrderPoolNotificationService");

  it("includes category, subcategory, and title", () => {
    const { title, message } = buildPoolEntryNotificationCopy({
      categoryName: "البرمجة",
      subcategoryName: "تطوير مواقع الويب",
      orderTitle: "تطوير صفحة تعريفية لشركة",
    });
    assert.equal(title, "طلب جديد متاح");
    assert.equal(
      message,
      "طلب جديد في «البرمجة» — «تطوير مواقع الويب»: تطوير صفحة تعريفية لشركة",
    );
    assert.equal(FORBIDDEN_CONTENT_RE.test(title), false);
    assert.equal(FORBIDDEN_CONTENT_RE.test(message), false);
  });

  it("omits subcategory gracefully", () => {
    const { message } = buildPoolEntryNotificationCopy({
      categoryName: "التصميم",
      subcategoryName: "",
      orderTitle: "تصميم هوية بصرية لمشروع ناشئ",
    });
    assert.equal(message, "طلب جديد في «التصميم»: تصميم هوية بصرية لمشروع ناشئ");
    assert.doesNotMatch(message, /undefined|null|«»/);
  });

  it("falls back to title only when categories missing", () => {
    const { message } = buildPoolEntryNotificationCopy({
      categoryName: null,
      subcategoryName: null,
      orderTitle: "مشروع مستقل",
    });
    assert.equal(message, "طلب جديد متاح: مشروع مستقل");
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

describe("wiring — createFakeOrder must not notify; visibility paths schedule dispatch", () => {
  const fakeOrdersSrc = fs.readFileSync(fakeOrdersPath, "utf8");
  const serviceSrc = fs.readFileSync(servicePath, "utf8");
  // eslint-disable-next-line global-require
  const { FORBIDDEN_CONTENT_RE } = require("../src/services/fakeOrderPoolNotificationService");

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

  it("dispatcher uses order.created and round-item dedupe base key", () => {
    assert.match(serviceSrc, /type: "order\.created"/);
    assert.match(serviceSrc, /order_pool_visible_ri\$\{rid\}/);
    assert.match(serviceSrc, /طلب جديد متاح/);
    const titleLine = serviceSrc.match(/const title = "([^"]+)"/);
    assert.ok(titleLine);
    assert.equal(FORBIDDEN_CONTENT_RE.test(titleLine[1]), false);
  });

  it("dispatcher queries only currently visible undispatched items", () => {
    assert.match(serviceSrc, /pool_notification_dispatched_at IS NULL/);
    assert.match(serviceSrc, /ri\.visible_from <= NOW\(\)/);
    assert.match(serviceSrc, /ri\.visible_until > NOW\(\)/);
  });
});

describe("dispatchNewlyVisibleFakeOrderNotifications behavior", () => {
  let notifyCalls;
  let markedIds;
  let queries;

  beforeEach(() => {
    notifyCalls = [];
    markedIds = [];
    queries = [];
  });

  afterEach(() => {
    const dbPath = require.resolve("../src/config/db");
    const eventsPath = require.resolve("../src/services/notificationEventsService");
    const targetPath = require.resolve("../src/services/fakeOrderPoolNotificationService");
    delete require.cache[dbPath];
    delete require.cache[eventsPath];
    delete require.cache[targetPath];
  });

  function makeQueryImpl({ settings, items = [], recipientsMode = "show_all" }) {
    return async (sql, params) => {
      const text = String(sql);
      queries.push({ text, params });
      if (text.includes("FROM fake_order_settings WHERE id = 1") && text.includes("SELECT *")) {
        return { rows: [settings] };
      }
      if (text.includes("pool_notification_dispatched_at IS NULL") && text.includes("SELECT")) {
        return {
          rows: items.map((it) => ({
            round_item_id: it.roundItemId,
            fake_order_id: it.fakeOrderId,
            order_title: it.orderTitle,
            category_name: it.categoryName,
            subcategory_name: it.subcategoryName,
          })),
        };
      }
      if (text.includes("UPDATE fake_order_round_items") && text.includes("pool_notification_dispatched_at = NOW()")) {
        markedIds.push(Number(params[0]));
        return { rowCount: 1 };
      }
      if (text.includes("FROM users u") && text.includes("fake_order_settings_plans")) {
        return { rows: recipientsMode === "plan_only" ? [{ id: 201 }] : [] };
      }
      return { rows: [] };
    };
  }

  it("A/B: only currently visible items are notified; future groups are absent from due query results", async () => {
    const visibleNow = {
      roundItemId: 11,
      fakeOrderId: 501,
      orderTitle: "طلب فوري",
      categoryName: "البرمجة",
      subcategoryName: "مواقع",
    };
    // Future items are simply not returned by the due query (visible_from > NOW filtered in SQL).
    const svc = loadDispatcherWithMocks({
      queryImpl: makeQueryImpl({
        settings: { training_orders_enabled: true, show_to_all_freelancers: true, show_to_all_visitors: false },
        items: [visibleNow],
      }),
      getRoleUserIdsImpl: async () => [101],
      notifyUsersImpl: async (payload) => {
        notifyCalls.push(payload);
        return [{ id: 1 }];
      },
    });

    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications({ itemLimit: 10 });
    assert.equal(out.processed, 1);
    assert.equal(out.marked, 1);
    assert.equal(notifyCalls.length, 1);
    assert.equal(notifyCalls[0].entityId, 501);
    assert.equal(notifyCalls[0].dedupeKey, "order_pool_visible_ri11");
    assert.equal(notifyCalls[0].type, "order.created");
    assert.match(notifyCalls[0].message, /البرمجة/);
    assert.match(notifyCalls[0].message, /مواقع/);
    assert.match(notifyCalls[0].message, /طلب فوري/);
    assert.doesNotMatch(notifyCalls[0].title + notifyCalls[0].message, /وهمي|تدريبي|تجريبي|جولة|fake|training|round/i);
    assert.equal(notifyCalls[0].link, "/dashboard/freelancer/orders/501");
    assert.equal(markedIds[0], 11);
  });

  it("D: repeated dispatch marks already-handled items and does not re-notify when due set empty", async () => {
    let pass = 0;
    const settings = { training_orders_enabled: true, show_to_all_freelancers: true, show_to_all_visitors: false };
    const svc = loadDispatcherWithMocks({
      queryImpl: async (sql, params) => {
        const text = String(sql);
        if (text.includes("FROM fake_order_settings") && text.includes("SELECT *")) {
          return { rows: [settings] };
        }
        if (text.includes("pool_notification_dispatched_at IS NULL") && text.includes("SELECT")) {
          pass += 1;
          if (pass === 1) {
            return {
              rows: [
                {
                  round_item_id: 22,
                  fake_order_id: 600,
                  order_title: "عنوان",
                  category_name: "تصميم",
                  subcategory_name: null,
                },
              ],
            };
          }
          return { rows: [] };
        }
        if (text.includes("pool_notification_dispatched_at = NOW()")) {
          markedIds.push(Number(params[0]));
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
      getRoleUserIdsImpl: async () => [101, 102],
      notifyUsersImpl: async (payload) => {
        notifyCalls.push(payload);
        return [];
      },
    });

    const first = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    const second = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(first.processed, 1);
    assert.equal(second.processed, 0);
    assert.equal(notifyCalls.length, 1);
    assert.deepEqual(notifyCalls[0].userIds, [101, 102]);
  });

  it("E: per-user dedupe key base is round-item scoped for re-entry", () => {
    // eslint-disable-next-line global-require
    const { poolVisibleNotificationDedupeKey } = require("../src/services/fakeOrderPoolNotificationService");
    assert.equal(poolVisibleNotificationDedupeKey(9, 55), "order_pool_visible_ri9_u55");
    assert.notEqual(poolVisibleNotificationDedupeKey(9, 55), poolVisibleNotificationDedupeKey(10, 55));
  });

  it("F: plan-restricted audience uses settings plans query, not all freelancers", async () => {
    let usedPlanQuery = false;
    let usedGetRole = false;
    const svc = loadDispatcherWithMocks({
      queryImpl: async (sql) => {
        const text = String(sql);
        if (text.includes("FROM fake_order_settings") && text.includes("SELECT *")) {
          return {
            rows: [
              {
                training_orders_enabled: true,
                show_to_all_freelancers: false,
                show_to_all_visitors: false,
              },
            ],
          };
        }
        if (text.includes("pool_notification_dispatched_at IS NULL") && text.includes("SELECT")) {
          return {
            rows: [
              {
                round_item_id: 1,
                fake_order_id: 1,
                order_title: "ت",
                category_name: "ك",
                subcategory_name: null,
              },
            ],
          };
        }
        if (text.includes("fake_order_settings_plans")) {
          usedPlanQuery = true;
          return { rows: [{ id: 201 }] };
        }
        if (text.includes("pool_notification_dispatched_at = NOW()")) {
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
      getRoleUserIdsImpl: async () => {
        usedGetRole = true;
        return [999];
      },
      notifyUsersImpl: async (payload) => {
        notifyCalls.push(payload);
        return [];
      },
    });

    await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(usedPlanQuery, true);
    assert.equal(usedGetRole, false);
    assert.deepEqual(notifyCalls[0].userIds, [201]);
  });

  it("H: emergency-promoted items are notified when returned by due query", async () => {
    const svc = loadDispatcherWithMocks({
      queryImpl: makeQueryImpl({
        settings: { training_orders_enabled: true, show_to_all_freelancers: true, show_to_all_visitors: false },
        items: [
          {
            roundItemId: 77,
            fakeOrderId: 707,
            orderTitle: "بعد الترقية",
            categoryName: "محتوى",
            subcategoryName: "كتابة",
          },
        ],
      }),
      getRoleUserIdsImpl: async () => [101],
      notifyUsersImpl: async (payload) => {
        notifyCalls.push(payload);
        return [{ id: "n1" }];
      },
    });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(out.marked, 1);
    assert.equal(notifyCalls[0].dedupeKey, "order_pool_visible_ri77");
  });

  it("K: empty due set (pre-marked / rollout) creates no notifications", async () => {
    const svc = loadDispatcherWithMocks({
      queryImpl: makeQueryImpl({
        settings: { training_orders_enabled: true, show_to_all_freelancers: true, show_to_all_visitors: false },
        items: [],
      }),
      getRoleUserIdsImpl: async () => [101],
      notifyUsersImpl: async (payload) => {
        notifyCalls.push(payload);
        return [];
      },
    });
    const out = await svc.dispatchNewlyVisibleFakeOrderNotifications();
    assert.equal(out.processed, 0);
    assert.equal(notifyCalls.length, 0);
  });

  it("J: createIfNotExists path is used via notifyUsers dedupeKey (push only on insert)", () => {
    const eventsSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "notificationEventsService.js"),
      "utf8",
    );
    const notifSrc = fs.readFileSync(
      path.join(__dirname, "..", "src", "services", "notificationService.js"),
      "utf8",
    );
    assert.match(eventsSrc, /createIfNotExists/);
    assert.match(eventsSrc, /\$\{dedupeKey\}_u\$\{uid\}/);
    assert.match(notifSrc, /ON CONFLICT \(dedupe_key\)/);
    assert.match(notifSrc, /queuePushForNotification\(mapped\)/);
    // Push only when rows\[0\] exists (new insert), not when returning existing.
    const createIf = notifSrc.slice(notifSrc.indexOf("async function createIfNotExists"), notifSrc.indexOf("async function markAsRead"));
    assert.match(createIf, /if \(rows\[0\]\)[\s\S]*queuePushForNotification/);
  });
});

describe("preference mapping", () => {
  it("order.created and training.order.visible map to orders category", () => {
    const rules = require("../src/utils/notificationPreferenceRules");
    assert.equal(rules.getCategoryForType("order.created"), "orders");
    assert.equal(rules.getCategoryForType("training.order.visible"), "orders");
  });
});
