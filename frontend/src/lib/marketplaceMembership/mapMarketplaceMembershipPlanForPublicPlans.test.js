/**
 * Phase B7A — public /plans Marketplace Membership cutover (static wiring).
 * Run from frontend/: node --test src/lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.test.js src/hooks/usePlansPage.b7a.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  mapMarketplaceMembershipPlanForPublicPlans,
  mapMarketplaceMembershipPlansForPublicPlans,
} from "./mapMarketplaceMembershipPlanForPublicPlans.js";

describe("mapMarketplaceMembershipPlanForPublicPlans", () => {
  it("maps Bids / Priority Uses / Article access without Work Tokens", () => {
    const mapped = mapMarketplaceMembershipPlanForPublicPlans({
      id: "9",
      tierCode: "start",
      nameAr: "بداية",
      nameEn: "Start",
      descriptionAr: "وصف",
      descriptionEn: "Desc",
      monthlyPriceJod: 24.99,
      monthlyBidAllowance: 100,
      articleAccessLevel: 2,
      access: { unlimited: false, maxRealOrderValueJod: 50 },
      capabilities: {
        priorityBid: true,
        priorityBidUsesPerCycle: 3,
        eliteDirectOrders: false,
        articleAccessLevel: 2,
      },
      cash: { allowed: false },
      sale: { enabled: false },
      includedTokensPerCycle: 99,
    });

    assert.strictEqual(mapped.catalogSource, "marketplace_membership");
    assert.strictEqual(mapped.selfCheckoutEligible, false);
    assert.strictEqual(mapped.priceJod, 24.99);
    assert.ok(mapped.featuresEn.some((f) => /100 Bids \/ month/.test(f)));
    assert.ok(mapped.featuresEn.some((f) => /3 Priority Uses \/ cycle/.test(f)));
    assert.ok(mapped.featuresEn.some((f) => /Article access level 2/.test(f)));
    assert.ok(mapped.features.some((f) => /100 عروض \/ شهر/.test(f)));
    assert.ok(mapped.features.some((f) => /مرات أولوية/.test(f)));
    assert.ok(!mapped.featuresEn.join(" ").toLowerCase().includes("work token"));
    assert.ok(!mapped.features.join(" ").includes("Work Token"));
    assert.ok(!Object.prototype.hasOwnProperty.call(mapped, "includedTokensPerCycle"));
  });

  it("maps arrays", () => {
    const list = mapMarketplaceMembershipPlansForPublicPlans([
      { id: 1, nameAr: "أ", monthlyPriceJod: 0, monthlyBidAllowance: 0, articleAccessLevel: 1 },
      null,
    ]);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].catalogSource, "marketplace_membership");
  });
});
