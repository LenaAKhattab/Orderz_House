/**
 * Client bidding order create — freelancer notifications must not block HTTP response.
 * Run: npm test
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/client_bidding_create_notifications_test_placeholder";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ordersServiceSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "services", "ordersService.js"),
  "utf8",
);
const clientOrdersCtrlSrc = fs.readFileSync(
  path.join(__dirname, "..", "src", "controllers", "clientOrdersController.js"),
  "utf8",
);

function sliceCreateClientOrder(src) {
  const start = src.indexOf("async function createClientOrder(");
  const end = src.indexOf("async function purgeClientUnpaidFixedOrderDraft", start);
  assert.ok(start >= 0, "createClientOrder missing");
  return src.slice(start, end > start ? end : src.length);
}

function loadOrdersServiceWithMockedNotifications(mockNotificationEvents) {
  const dbPath = require.resolve("../src/config/db");
  const notifPath = require.resolve("../src/services/notificationEventsService");
  const servicePath = require.resolve("../src/services/ordersService");
  delete require.cache[dbPath];
  delete require.cache[notifPath];
  delete require.cache[servicePath];
  require.cache[notifPath] = {
    id: notifPath,
    filename: notifPath,
    loaded: true,
    exports: mockNotificationEvents,
  };
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require("../src/services/ordersService");
}

describe("createClientOrder — bidding freelancer notifications", () => {
  it("does not await getRoleUserIds inside createClientOrder before COMMIT", () => {
    const fn = sliceCreateClientOrder(ordersServiceSrc);
    assert.ok(
      fn.includes("scheduleClientBiddingPoolFreelancerNotifications"),
      "bidding pool notifications should be scheduled after commit",
    );
    assert.ok(
      !fn.includes('getRoleUserIds(["freelancer"]'),
      "createClientOrder must not synchronously query all freelancers",
    );
    const commitIdx = fn.indexOf('await client.query("COMMIT")');
    const scheduleIdx = fn.indexOf("scheduleClientBiddingPoolFreelancerNotifications");
    assert.ok(commitIdx >= 0 && scheduleIdx > commitIdx, "scheduler must run after COMMIT");
  });

  it("bidding response path does not call Stripe checkout", () => {
    assert.ok(
      clientOrdersCtrlSrc.includes('if (type === "fixed")'),
      "fixed branch should exist",
    );
    const biddingReturn = clientOrdersCtrlSrc.slice(
      clientOrdersCtrlSrc.indexOf("requiresPayment: false"),
      clientOrdersCtrlSrc.indexOf("requiresPayment: false") + 200,
    );
    assert.ok(biddingReturn.includes("requiresPayment: false"));
    const fixedBlock = clientOrdersCtrlSrc.slice(
      clientOrdersCtrlSrc.indexOf('if (type === "fixed")'),
      clientOrdersCtrlSrc.indexOf("requiresPayment: false"),
    );
    assert.ok(fixedBlock.includes("createClientFixedOrderCheckoutSession"));
    assert.ok(!biddingReturn.includes("checkoutUrl"));
  });

  it("controller ignores userId/status/paymentStatus from body (uses auth + service)", () => {
    assert.ok(clientOrdersCtrlSrc.includes("clientUserId: req.auth.userId"));
    assert.ok(!clientOrdersCtrlSrc.includes("req.body.userId"));
    assert.ok(!clientOrdersCtrlSrc.includes("req.body.paymentStatus"));
    assert.ok(!clientOrdersCtrlSrc.includes("req.body.orderStatus"));
  });
});

describe("scheduleClientBiddingPoolFreelancerNotifications — behavior", () => {
  let originalSetImmediate;

  beforeEach(() => {
    originalSetImmediate = global.setImmediate;
  });

  afterEach(() => {
    global.setImmediate = originalSetImmediate;
    const notifPath = require.resolve("../src/services/notificationEventsService");
    const servicePath = require.resolve("../src/services/ordersService");
    delete require.cache[notifPath];
    delete require.cache[servicePath];
  });

  it("returns immediately even when notification dispatch is slow", async () => {
    let resolveSlow;
    const slowPromise = new Promise((resolve) => {
      resolveSlow = resolve;
    });
    const calls = { getRoleUserIds: 0, notifyUsers: 0 };
    const service = loadOrdersServiceWithMockedNotifications({
      getRoleUserIds: async () => {
        calls.getRoleUserIds += 1;
        await slowPromise;
        return [101, 102];
      },
      notifyUsers: async () => {
        calls.notifyUsers += 1;
        return [];
      },
    });

    const immediateJobs = [];
    global.setImmediate = (fn) => {
      immediateJobs.push(fn);
    };

    const t0 = Date.now();
    service.scheduleClientBiddingPoolFreelancerNotifications({ orderId: 55, actorUserId: 9 });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 50, "scheduler should not block on slow notifications");
    assert.equal(calls.getRoleUserIds, 0, "background job not started yet");

    for (const job of immediateJobs) {
      // eslint-disable-next-line no-await-in-loop
      await job();
    }
    assert.equal(calls.getRoleUserIds, 1);
    resolveSlow();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls.notifyUsers, 1);
  });

  it("logs and swallows notification failures without throwing", async () => {
    const errors = [];
    const orig = console.error;
    console.error = (...args) => errors.push(args);

    const service = loadOrdersServiceWithMockedNotifications({
      getRoleUserIds: async () => {
        throw new Error("simulated freelancer query failure");
      },
      notifyUsers: async () => [],
    });

    global.setImmediate = (fn) => {
      void fn();
    };

    try {
      service.scheduleClientBiddingPoolFreelancerNotifications({ orderId: 77, actorUserId: 3 });
      await new Promise((r) => setTimeout(r, 20));
      assert.ok(
        errors.some((e) => String(e[0]).includes("client bidding pool broadcast failed")),
        "failure should be logged",
      );
    } finally {
      console.error = orig;
    }
  });
});
