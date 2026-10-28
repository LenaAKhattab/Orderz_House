/**
 * UI/UX Phase 5 — backend contracts: restriction summary (concurrent, live), notifications actor index
 * (migration 212), OrderzHouse card statement descriptor on one-time Checkout.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/p5_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("Super Admin restriction summary", () => {
  it("runs independent lookups concurrently, audit after the summary (live, uncached)", async () => {
    const events = [];
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    const stub = (rel, exports) => {
      require.cache[require.resolve(rel)] = { exports };
    };
    stub("../src/services/freelancerAccountRestrictionsService", {
      getUserRestrictionSummary: async () => {
        events.push("summary:start");
        await delay(40);
        events.push("summary:end");
        return { hasActiveRestriction: true, activeRestrictions: [], inheritedPlanRestrictions: [] };
      },
      listAuditForUser: async () => {
        events.push("audit");
        return [{ action: "auto_expired" }];
      },
    });
    stub("../src/services/subscriptionsService", {
      canFreelancerTakeOrders: async () => {
        events.push("eligibility:start");
        await delay(40);
        throw new Error("optional enrichment failed");
      },
      getCurrentSubscriptionForFreelancer: async () => {
        events.push("subscription:start");
        return { planId: 1, status: "active" };
      },
    });
    delete require.cache[require.resolve("../src/controllers/superAdminAccountRestrictionsController")];
    const controller = require("../src/controllers/superAdminAccountRestrictionsController");
    const body = await new Promise((resolve, reject) => controller.userSummary({ params: { userId: "7" } }, { json: resolve }, reject));
    assert.ok(events.indexOf("eligibility:start") < events.indexOf("summary:end"), events.join(","));
    assert.ok(events.indexOf("subscription:start") < events.indexOf("summary:end"), events.join(","));
    assert.ok(events.indexOf("audit") > events.indexOf("summary:end"), "audit is read after the summary's expiry sweep");
    assert.equal(body.data.eligibility, null, "optional enrichment failure stays optional");
    assert.equal(body.data.subscription.status, "active");
    assert.equal(body.data.moderationBadge, "ACTIVE_ADMIN_HOLD");
    assert.equal(body.data.audit.length, 1);
  });
});

describe("notifications.actor_user_id index (migration 212)", () => {
  it("is additive, partial and built CONCURRENTLY outside a transaction", () => {
    const sql = read("sql/migrations/212_notifications_actor_user_index.sql");
    assert.match(sql, /CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_actor_user_id\s+ON notifications \(actor_user_id\)\s+WHERE actor_user_id IS NOT NULL;/);
    assert.ok(!/^\s*BEGIN|^\s*COMMIT|DROP TABLE|DELETE FROM|ALTER TABLE/im.test(sql.replace(/^--.*$/gm, "")));
  });

  it("pre-build tool: direct endpoint, no statement timeout, validity check, never prints the URL", () => {
    const src = read("scripts/buildNotificationsActorIndex.js");
    assert.ok(src.includes('u.hostname = u.hostname.replace("-pooler.", ".");'));
    assert.ok(src.includes('SET statement_timeout = 0'));
    assert.ok(src.includes("indisvalid"));
    assert.ok(!/console\.(log|error)\([^)]*url/i.test(src));
  });
});

describe("OrderzHouse card statement descriptor", () => {
  const { ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX, withOrderzHouseStatementDescriptor } = require("../src/utils/stripeStatementDescriptor");

  it("suffix fits Stripe rules with the shared account prefix", () => {
    assert.equal(ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX, "ORDERZHOUSE");
    assert.ok(`FAZ3AT* ${ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX}`.length <= 22);
    assert.ok(/[A-Z]/.test(ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX) && !/[<>\\'"*]/.test(ORDERZHOUSE_STATEMENT_DESCRIPTOR_SUFFIX));
    assert.deepEqual(withOrderzHouseStatementDescriptor({ metadata: { a: "1" } }), { metadata: { a: "1" }, statement_descriptor_suffix: "ORDERZHOUSE" });
  });

  it("every one-time (payment-mode) OrderzHouse Checkout carries it; subscriptions are untouched", () => {
    const cs = read("src/services/stripeCheckoutService.js");
    assert.ok(cs.includes("return withOrderzHouseStatementDescriptor(description ?"));
    for (const f of ["marketplaceMembershipCheckoutService", "trainingPackageCheckoutService", "marketplaceBidCreditPurchasesService"]) {
      const src = read(`src/services/${f}.js`);
      assert.ok(src.includes("payment_intent_data: withOrderzHouseStatementDescriptor({"), f);
      assert.equal(src.split("payment_intent_data:").length - 1, src.split("payment_intent_data: withOrderzHouseStatementDescriptor(").length - 1, f);
    }
    for (const call of cs.match(/payment_intent_data: [^,\n]+/g) || []) assert.ok(call.includes("buildCheckoutPaymentIntentData("), call);
    assert.ok(!read("src/services/stripeRecurringSubscriptionService.js").includes("statement_descriptor_suffix"));
  });
});
