/**
 * Freelancer Plans skeleton fidelity wiring.
 * Run: node --test src/components/plans/freelancerPlansSkeletonFidelity.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Freelancer Plans skeleton fidelity", () => {
  it("uses shared public membership pricing grid on freelancer marketplace plans", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    const screen = read("components/plans/FreelancerPlansScreenSkeleton.jsx");
    const card = read("components/plans/MembershipPlanCardSkeleton.jsx");
    const section = read("components/plans/PricingSection.jsx");
    const css = read("pages/dashboard/freelancerPlans.css");

    assert.match(page, /FreelancerPlansScreenSkeleton/);
    assert.match(page, /fp-pricing-wrap--public-match/);
    assert.match(page, /membershipCatalog/);
    assert.doesNotMatch(page, /PlanCardsRowSkeleton/);
    assert.doesNotMatch(page, /loadingEyebrow|loadingSubtitle/);
    assert.match(screen, /MarketplaceMembershipPlansGridSkeleton|plans-page--ref/);
    assert.match(screen, /visually-hidden/);
    assert.doesNotMatch(screen, /جارٍ تحميل|Loading your plans|loadingSubtitle/);
    assert.match(card, /pricing-card--membership/);
    assert.match(card, /pricing__grid--plans-4/);
    assert.match(card, /pricing-ref-shell/);
    assert.match(card, /featuredIndex = 2|featured=\{i === featuredIndex\}/);
    assert.match(section, /useDashboardLegacyChrome/);
    assert.match(css, /fp-pricing-wrap--public-match/);
    assert.match(css, /:not\(\.fp-pricing-wrap--public-match\)[\s\S]*repeat\(4/);
    assert.match(css, /min-width: 640px[\s\S]*repeat\(2/);
  });
});
