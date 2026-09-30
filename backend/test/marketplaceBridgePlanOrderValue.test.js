/**
 * Marketplace bridge plans (Legacy Admin PRO/SILVER/…) must resolve order-value bands
 * from live marketplace_membership_plans — not fail as INTERNAL_PLAN_CONFIGURATION.
 *
 * Run: node --test test/marketplaceBridgePlanOrderValue.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resolveMarketplaceBridgePlanOrderValueRange,
  resolvePlanOrderValueRange,
  computePoolOrderPlanEligibility,
  POOL_PLAN_ELIGIBILITY_REASON,
  isUsableOrderValueRange,
} = require("../src/services/planOrderValueEligibility");

const ROOT = path.join(__dirname, "..");

describe("marketplace bridge plan order-value resolution", () => {
  it("source wires bridge resolver before null linked subscription_plan_id exit", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/services/planOrderValueEligibility.js"),
      "utf8",
    );
    assert.match(src, /resolveMarketplaceBridgePlanOrderValueRange/);
    assert.match(src, /marketplace_membership_/);
    assert.match(src, /project_min_value_jod/);
    const bridgeIdx = src.indexOf("resolveMarketplaceBridgePlanOrderValueRange(row");
    const linkedIdx = src.indexOf("row.subscription_plan_id");
    assert.ok(bridgeIdx > 0 && linkedIdx > bridgeIdx);
  });

  it("Legacy Admin bridge UPSERT syncs order_value bands from marketplace tier", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/services/legacyAssignableMarketplacePackagesService.js"),
      "utf8",
    );
    assert.match(src, /order_value_min_jod/);
    assert.match(src, /order_value_max_jod/);
    assert.match(src, /project_min_value_jod/);
  });

  it("order auth skips E1 marketplace gate when subscription is marketplace bridge", () => {
    const src = fs.readFileSync(path.join(ROOT, "src/services/orderAuthorizationService.js"), "utf8");
    assert.match(src, /marketplace_membership_/);
    assert.match(src, /getCurrentSubscriptionForFreelancer/);
  });

  it("resolves PRO bridge plan to marketplace PRO 1–50 band via mocked DB", async () => {
    const client = {
      query: async (sql, params) => {
        if (String(sql).includes("FROM plans")) {
          return {
            rows: [
              {
                id: 28,
                name: "marketplace_membership_pro",
                order_value_min_jod: null,
                order_value_max_jod: null,
                subscription_plan_id: null,
                deleted_at: null,
              },
            ],
          };
        }
        if (String(sql).includes("FROM marketplace_membership_plans")) {
          assert.equal(params[0], "pro");
          return {
            rows: [
              {
                id: 3,
                tier_code: "pro",
                project_min_value_jod: "1.000",
                max_real_order_value_jod: "50.000",
                unlimited_real_order_value: false,
                is_active: true,
              },
            ],
          };
        }
        throw new Error(`unexpected sql: ${sql}`);
      },
    };

    const range = await resolvePlanOrderValueRange(28, client);
    assert.ok(isUsableOrderValueRange(range));
    assert.equal(range.minOrderValue, 1);
    assert.equal(range.maxOrderValue, 50);
    assert.equal(range.resolvedFromMarketplaceTier, "pro");
    assert.equal(range.sourcePlanId, 28);

    const poolElig = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 5, orderSource: "real" },
      range,
      { hasPlanId: true, planId: 28 },
    );
    assert.equal(poolElig.isLockedByPlan, false);
    assert.equal(poolElig.canClaim, true);
    assert.equal(poolElig.reasonCode, null);
  });

  it("PRO bridge allows 1–50 and rejects over-max with PLAN_TOO_LOW (not contact-support)", async () => {
    const bridgeRange = await resolveMarketplaceBridgePlanOrderValueRange(
      { id: 28, name: "marketplace_membership_pro" },
      {
        query: async () => ({
          rows: [
            {
              id: 3,
              tier_code: "pro",
              project_min_value_jod: 1,
              max_real_order_value_jod: 50,
              unlimited_real_order_value: false,
              is_active: true,
            },
          ],
        }),
      },
    );
    const over = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 51 },
      bridgeRange,
      { hasPlanId: true, planId: 28 },
    );
    assert.equal(over.reasonCode, POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW);
    assert.match(over.lockReason, /ترقية|باقات أعلى/);
    assert.doesNotMatch(over.lockReason, /الدعم/);

    const ok = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 50 },
      bridgeRange,
      { hasPlanId: true, planId: 28 },
    );
    assert.equal(ok.canClaim, true);
  });

  it("assigned_not_started + usable PRO range is not INTERNAL_PLAN_CONFIGURATION", () => {
    const elig = computePoolOrderPlanEligibility(
      { project_type: "fixed", budget: 12 },
      { planId: 28, minOrderValue: 1, maxOrderValue: 50 },
      { hasPlanId: true, planId: 28 },
    );
    assert.notEqual(elig.reasonCode, POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION);
    assert.equal(elig.canClaim, true);
  });
});
