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
  it("uses shared dashboard pricing grid (not legacy 3-col PlanCardsRowSkeleton alone)", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    const screen = read("components/plans/FreelancerPlansScreenSkeleton.jsx");
    const card = read("components/plans/MembershipPlanCardSkeleton.jsx");
    const css = read("pages/dashboard/freelancerPlans.css");

    assert.match(page, /FreelancerPlansScreenSkeleton/);
    assert.doesNotMatch(page, /PlanCardsRowSkeleton/);
    assert.doesNotMatch(page, /loadingEyebrow|loadingSubtitle/);
    assert.match(screen, /MarketplaceMembershipPlansGridSkeleton|pricing--dashboard/);
    assert.match(screen, /visually-hidden/);
    assert.doesNotMatch(screen, /جارٍ تحميل|Loading your plans|loadingSubtitle/);
    assert.match(card, /pricing-card--membership/);
    assert.match(card, /pricing-card__metrics/);
    assert.match(card, /pricing-card__cta/);
    assert.match(card, /featuredIndex = 2|featured=\{i === featuredIndex\}/);
    assert.match(css, /repeat\(4/);
    assert.match(css, /min-width: 640px[\s\S]*repeat\(2/);
  });
});
