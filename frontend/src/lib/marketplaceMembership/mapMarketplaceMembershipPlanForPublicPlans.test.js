/**
 * Phase B7A / E1 — public /plans Marketplace Membership cutover (static wiring).
 * Run from frontend/: node --test src/lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.test.js src/hooks/usePlansPage.b7a.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mapMarketplaceMembershipPlanForPublicPlans,
  mapMarketplaceMembershipPlansForPublicPlans,
  PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER,
} from "./mapMarketplaceMembershipPlanForPublicPlans.js";

function e1Fixture(overrides = {}) {
  return {
    id: "101",
    tierCode: "silver",
    nameAr: "فضة",
    nameEn: "Silver",
    descriptionAr: "should be hidden on card",
    descriptionEn: "should be hidden on card",
    monthlyPriceJod: 19,
    monthlyBidAllowance: 40,
    articleAccessLevel: 2,
    cycleDurationDays: 30,
    dailyBidSpendLimit: 3,
    projectMinValueJod: 1,
    withdrawalEnabled: true,
    access: { unlimited: false, maxRealOrderValueJod: 20 },
    capabilities: {
      priorityBid: true,
      priorityBidUsesPerCycle: 3,
      eliteDirectOrders: false,
      articleAccessLevel: 2,
      withdrawalEnabled: true,
      dailyBidSpendLimit: 3,
      cycleDurationDays: 30,
    },
    cash: { allowed: true },
    sale: { enabled: false },
    includedTokensPerCycle: 99,
    ...overrides,
  };
}

describe("mapMarketplaceMembershipPlanForPublicPlans", () => {
  it("maps SILVER with consistent tier title + primary metrics from DTO", () => {
    const mapped = mapMarketplaceMembershipPlanForPublicPlans(e1Fixture());

    assert.strictEqual(mapped.catalogSource, "marketplace_membership");
    assert.strictEqual(mapped.selfCheckoutEligible, false);
    assert.strictEqual(mapped.priceJod, 19);
    assert.strictEqual(mapped.durationDays, 30);
    assert.strictEqual(mapped.title, "SILVER");
    assert.strictEqual(mapped.taglineAr, "للانطلاق");
    assert.deepStrictEqual(mapped.primaryMetrics, {
      bids: 40,
      dailyLimit: 3,
      projectMaxJod: 20,
      unlimitedProjects: false,
    });
    assert.ok(mapped.features.includes("السحب متاح"));
    assert.ok(!mapped.features.some((f) => /مدة|يوم/.test(f)));
    assert.ok(!mapped.features.some((f) => f.includes("40")));
    assert.ok(!mapped.featuresEn.join(" ").toLowerCase().includes("work token"));
    assert.ok(!Object.prototype.hasOwnProperty.call(mapped, "includedTokensPerCycle"));
  });

  it("maps STARTER / ELITE metrics and marks PRO as popular", () => {
    const starter = mapMarketplaceMembershipPlanForPublicPlans(
      e1Fixture({
        id: "1",
        tierCode: "starter",
        nameAr: "ستارتر",
        nameEn: "Starter",
        monthlyPriceJod: 0,
        monthlyBidAllowance: 20,
        cycleDurationDays: 10,
        dailyBidSpendLimit: 2,
        withdrawalEnabled: false,
        access: { unlimited: false, maxRealOrderValueJod: 10 },
        capabilities: { withdrawalEnabled: false, dailyBidSpendLimit: 2, cycleDurationDays: 10 },
      }),
    );
    assert.strictEqual(starter.title, "STARTER");
    assert.strictEqual(starter.priceJod, 0);
    assert.deepStrictEqual(starter.primaryMetrics, {
      bids: 20,
      dailyLimit: 2,
      projectMaxJod: 10,
      unlimitedProjects: false,
    });
    assert.ok(starter.features.includes("لا يوجد استلام مباشر للقيم المالية"));

    const elite = mapMarketplaceMembershipPlanForPublicPlans(
      e1Fixture({
        id: "4",
        tierCode: "elite",
        nameAr: "إيليت",
        nameEn: "Elite",
        monthlyPriceJod: 59,
        monthlyBidAllowance: 150,
        dailyBidSpendLimit: 10,
        access: { unlimited: true, maxRealOrderValueJod: null },
        capabilities: { withdrawalEnabled: true, dailyBidSpendLimit: 10, cycleDurationDays: 30 },
      }),
    );
    assert.strictEqual(elite.title, "ELITE");
    assert.strictEqual(elite.primaryMetrics.unlimitedProjects, true);
    assert.strictEqual(elite.primaryMetrics.bids, 150);
    assert.strictEqual(elite.primaryMetrics.dailyLimit, 10);

    const pro = mapMarketplaceMembershipPlanForPublicPlans(
      e1Fixture({
        id: "3",
        tierCode: "pro",
        monthlyPriceJod: 39,
        monthlyBidAllowance: 100,
        dailyBidSpendLimit: 7,
        access: { unlimited: false, maxRealOrderValueJod: 50 },
      }),
    );
    assert.strictEqual(pro.isPopular, true);
    assert.strictEqual(pro.isFeatured, true);
  });

  it("orders STARTER→SILVER→PRO→ELITE and drops legacy marketplace tiers", () => {
    assert.deepStrictEqual([...PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER], [
      "starter",
      "silver",
      "pro",
      "elite",
    ]);

    const list = mapMarketplaceMembershipPlansForPublicPlans([
      e1Fixture({ id: "9", tierCode: "elite", nameAr: "إيليت", monthlyPriceJod: 59, monthlyBidAllowance: 150 }),
      e1Fixture({
        id: "7",
        tierCode: "pro",
        nameAr: "برو",
        monthlyPriceJod: 39,
        monthlyBidAllowance: 100,
        access: { unlimited: false, maxRealOrderValueJod: 50 },
        dailyBidSpendLimit: 7,
      }),
      e1Fixture({ id: "1", tierCode: "free", nameAr: "مجاني", monthlyPriceJod: 0 }),
      e1Fixture({
        id: "2",
        tierCode: "starter",
        nameAr: "ستارتر",
        monthlyPriceJod: 0,
        monthlyBidAllowance: 20,
        cycleDurationDays: 10,
        dailyBidSpendLimit: 2,
        withdrawalEnabled: false,
        access: { unlimited: false, maxRealOrderValueJod: 10 },
      }),
      e1Fixture({ id: "3", tierCode: "silver", nameAr: "فضة", monthlyPriceJod: 19 }),
      null,
    ]);

    assert.strictEqual(list.length, 4);
    assert.deepStrictEqual(
      list.map((p) => String(p.tierCode).toLowerCase()),
      ["starter", "silver", "pro", "elite"],
    );
    assert.deepStrictEqual(
      list.map((p) => p.title),
      ["STARTER", "SILVER", "PRO", "ELITE"],
    );
  });

  it("does not silently invent plans when API returns empty", () => {
    assert.deepStrictEqual(mapMarketplaceMembershipPlansForPublicPlans([]), []);
    assert.deepStrictEqual(mapMarketplaceMembershipPlansForPublicPlans(null), []);
  });
});
