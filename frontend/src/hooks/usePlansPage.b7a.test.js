/**
 * Phase B7A — usePlansPage wires public /plans to Marketplace Membership.
 * Run: node --test src/hooks/usePlansPage.b7a.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("usePlansPage B7A Marketplace Membership cutover", () => {
  it("loads Marketplace Membership catalog for default /plans; slug stays legacy", () => {
    const src = fs.readFileSync(path.join(__dirname, "usePlansPage.js"), "utf8");
    assert.match(src, /fetchPublicPlans:\s*Boolean\(slug\)/);
    assert.match(src, /listPublicMarketplaceMembershipPlansRequest/);
    assert.match(src, /mapMarketplaceMembershipPlansForPublicPlans/);
    assert.match(src, /catalogSource:\s*isMarketplaceMembershipCatalog/);
    assert.match(src, /marketplace_membership/);
    assert.match(src, /legacy_page_package/);
    assert.match(src, /getPublicPlanPageBySlugRequest/);
    assert.match(src, /catalogSource === "marketplace_membership"/);
  });

  it("PlanCard CTAs route membership to Freelancer plans dashboard", () => {
    const card = fs.readFileSync(
      path.join(__dirname, "../components/plans/PlanCard.jsx"),
      "utf8",
    );
    const mobile = fs.readFileSync(
      path.join(__dirname, "../components/plans/mobile/PlansMobilePlanCard.jsx"),
      "utf8",
    );
    for (const src of [card, mobile]) {
      assert.match(src, /isMarketplaceMembership/);
      assert.match(src, /\/dashboard\/freelancer\/plans/);
      assert.match(src, /plans\.cta\.viewMembership/);
    }
  });
});
