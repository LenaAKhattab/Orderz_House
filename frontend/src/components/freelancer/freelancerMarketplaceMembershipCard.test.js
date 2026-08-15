/**
 * Frontend wiring smoke for Marketplace Membership status (catalog-aware).
 * Run from frontend/: node --test src/components/freelancer/freelancerMarketplaceMembershipCard.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FreelancerMarketplaceMembershipCard wiring", () => {
  it("is presentational; parent screen hook owns membership fetch", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/FreelancerPlansPage.jsx"),
      "utf8",
    );
    const card = fs.readFileSync(
      path.join(__dirname, "FreelancerMarketplaceMembershipCard.jsx"),
      "utf8",
    );
    const screen = fs.readFileSync(
      path.join(__dirname, "../../hooks/useFreelancerPlansScreen.js"),
      "utf8",
    );
    const api = fs.readFileSync(path.join(__dirname, "../../services/api.js"), "utf8");
    const cache = fs.readFileSync(
      path.join(__dirname, "../../services/freelancerSessionCache.js"),
      "utf8",
    );

    assert.match(page, /useFreelancerPlansScreen/);
    assert.match(page, /FreelancerMarketplaceMembershipCard/);
    assert.match(page, /screenLoading/);
    assert.match(page, /snapshot=\{membership\}/);
    assert.doesNotMatch(page, /platformSubscriptionEyebrow|platformSubscriptionSubtitle/);
    assert.doesNotMatch(card, /getFreelancerMarketplaceMembershipRequest|useEffect/);
    assert.match(screen, /fetchFreelancerMarketplaceMembershipCached/);
    assert.match(cache, /fetchFreelancerMarketplaceMembershipCached/);
    assert.match(api, /getFreelancerMarketplaceMembershipRequest/);
    assert.match(api, /\/freelancer\/marketplace-membership/);
  });

  it("presents Marketplace-only inactive/active copy without architecture explanations", () => {
    const card = fs.readFileSync(
      path.join(__dirname, "FreelancerMarketplaceMembershipCard.jsx"),
      "utf8",
    );
    const ar = fs.readFileSync(
      path.join(__dirname, "../../locales/ar/freelancerDashboard.json"),
      "utf8",
    );
    assert.match(card, /marketplaceMembership\.none/);
    assert.match(card, /marketplaceMembership\.noneHint/);
    assert.match(card, /marketplaceMembership\.currentEyebrow/);
    assert.match(ar, /لا توجد عضوية عمل حر نشطة/);
    assert.match(ar, /اختر إحدى الباقات أدناه لبدء عضويتك/);
    assert.doesNotMatch(ar, /منفصل عن عضوية|اشتراك المنصة الأساسي|architecture/i);
  });
});
