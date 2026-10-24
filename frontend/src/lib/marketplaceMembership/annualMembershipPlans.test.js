/**
 * Annual Plans (الباقات السنوية) — third package tab on the marketplace membership card system.
 * Run from frontend/: node --test src/lib/marketplaceMembership/annualMembershipPlans.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mapAnnualMembershipPlansForPublicPlans,
  mapMarketplaceMembershipPlansForPublicPlans,
} from "./mapMarketplaceMembershipPlanForPublicPlans.js";
import {
  isPaidMarketplaceMembershipTierCode,
  resolveMarketplaceCheckoutPlanCode,
} from "./marketplaceMembershipCheckoutUi.js";
import { PLANS_CATEGORY, resolvePlansCategory, DEFAULT_PLANS_CATEGORY } from "../../constants/trainingPlansCatalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..");
const read = (rel) => fs.readFileSync(path.join(src, rel), "utf8");

function annualDto(overrides = {}) {
  return {
    id: "21",
    tierCode: "annual_basic",
    nameAr: "SILVER — سنوية",
    nameEn: "SILVER — Annual",
    entitlementTierCode: "silver",
    descriptionAr: "عضوية سنوية للعمل على أوردرز هاوس",
    descriptionEn: "Annual OrderzHouse marketplace membership",
    sortOrder: 50,
    monthlyPriceJod: 50,
    monthlyBidAllowance: 480,
    cycleDurationDays: null,
    entitlementDurationMonths: 12,
    dailyBidSpendLimit: 3,
    projectMinValueJod: 1,
    withdrawalEnabled: true,
    catalogCategory: "annual",
    bidAllowanceScope: "term",
    includedBenefits: [
      { code: "content_writing_course", labelAr: "دورة كتابة المحتوى", labelEn: "Content Writing Course" },
      {
        code: "us_dv_lottery_application",
        labelAr: "التقديم على اللوتري الأمريكي",
        labelEn: "U.S. Diversity Visa Lottery Application Service",
      },
    ],
    access: { unlimited: false, maxRealOrderValueJod: 20 },
    capabilities: { dailyBidSpendLimit: 3, cycleDurationDays: null, entitlementDurationMonths: 12 },
    sale: { enabled: false },
    ...overrides,
  };
}

const silverDto = {
  id: "8",
  tierCode: "silver",
  nameAr: "فضة",
  monthlyPriceJod: 19,
  monthlyBidAllowance: 40,
  cycleDurationDays: 30,
  dailyBidSpendLimit: 3,
  catalogCategory: "marketplace",
  access: { unlimited: false, maxRealOrderValueJod: 20 },
  sale: { enabled: false },
};

describe("Annual Plans mapping", () => {
  it("maps Annual SILVER into the shared membership card DTO (title SILVER, no subtitle)", () => {
    const [card] = mapAnnualMembershipPlansForPublicPlans([annualDto(), silverDto]);
    assert.strictEqual(card.catalogSource, "marketplace_membership");
    assert.strictEqual(card.catalogCategory, "annual");
    assert.strictEqual(card.titleEn, "SILVER");
    assert.strictEqual(card.title, "SILVER");
    assert.strictEqual(card.taglineAr, "");
    assert.strictEqual(card.taglineEn, "");
    assert.strictEqual(card.visualTierCode, "silver");
    assert.strictEqual(card.tierCode, "annual_basic");
    assert.strictEqual(card.priceJod, 50);
    assert.strictEqual(card.durationMonths, 12);
    assert.strictEqual(card.durationDays, null);
    assert.strictEqual(card.bidAllowanceScope, "term");
    assert.deepStrictEqual(card.primaryMetrics, {
      bids: 480,
      dailyLimit: 3,
      projectMaxJod: 20,
      unlimitedProjects: false,
    });
    assert.deepStrictEqual(
      card.includedBenefits.map((b) => b.labelEn),
      ["Content Writing Course", "U.S. Diversity Visa Lottery Application Service"],
    );
    assert.strictEqual(card.isPopular, false);
  });

  it("keeps the Marketplace tab to STARTER/SILVER/PRO/ELITE", () => {
    const marketplace = mapMarketplaceMembershipPlansForPublicPlans([annualDto(), silverDto]);
    assert.deepStrictEqual(marketplace.map((p) => p.tierCode), ["silver"]);
    assert.strictEqual(marketplace[0].title, "SILVER");
    assert.strictEqual(marketplace[0].durationDays, 30);
    assert.strictEqual(marketplace[0].durationMonths, null);
  });

  it("checkout sends only the canonical plan code", () => {
    const [card] = mapAnnualMembershipPlansForPublicPlans([annualDto()]);
    assert.strictEqual(resolveMarketplaceCheckoutPlanCode(card), "ANNUAL_BASIC");
    assert.ok(isPaidMarketplaceMembershipTierCode("ANNUAL_BASIC"));
  });
});

describe("Package allowance wording (cards only)", () => {
  it("Arabic cards say مرات تقديم, not عروض", () => {
    const ar = JSON.parse(read("locales/ar/plans.json"));
    assert.strictEqual(ar.membership.bidsAvailable, "مرة تقديم");
    assert.strictEqual(ar.membership.bidsForTerm, "مرة تقديم طوال مدة الباقة");
    assert.strictEqual(ar.membership.bidsPerDay, "مرات تقديم يوميًا");
    assert.strictEqual(ar.membership.applicationNote, "التقديم = إرسال عرض على طلب، وليس طلبًا مضمونًا.");
    assert.strictEqual(ar.specialOffer.offersPerDay, "مرات تقديم يوميًا");
  });

  it("English cards say applications", () => {
    const en = JSON.parse(read("locales/en/plans.json"));
    assert.strictEqual(en.membership.bidsForTerm, "applications for the plan term");
    assert.strictEqual(en.membership.bidsPerDay, "applications per day");
    assert.strictEqual(en.membership.withdrawalOn, "Withdrawals available");
    assert.match(en.membership.applicationNote, /does not guarantee receiving an order/);
  });

  it("one shared note under membership + annual grids (not inside cards)", () => {
    assert.match(read("components/plans/PricingSection.jsx"), /<PlansApplicationNote \/>/);
    assert.match(read("components/plans/AnnualPlansSection.jsx"), /<PlansApplicationNote \/>/);
    assert.doesNotMatch(read("components/plans/MembershipPlanCardBody.jsx"), /PlansApplicationNote/);
  });
});

describe("Annual Plans tab", () => {
  it("adds a third category without changing the default", () => {
    assert.strictEqual(PLANS_CATEGORY.ANNUAL, "annual");
    assert.strictEqual(resolvePlansCategory("annual"), "annual");
    assert.strictEqual(DEFAULT_PLANS_CATEGORY, PLANS_CATEGORY.TRAINING);
  });

  it("toggle renders Annual as the third tab with i18n label", () => {
    const toggle = read("components/plans/PlansCategoryToggle.jsx");
    assert.match(toggle, /\.\.\.orderPublicPlansCategoryTabs\(defaultSection\),\s+\.\.\.\(showAnnual \? \[PLANS_CATEGORY\.ANNUAL\] : \[\]\)/);
    assert.match(toggle, /t\("plans\.categories\.annual"\)/);
  });

  it("public, mobile and freelancer pages render the Annual panel", () => {
    assert.match(read("pages/Plans.jsx"), /<AnnualPlansSection/);
    assert.match(read("components/plans/mobile/PlansMobilePage.jsx"), /plans-panel-annual-mobile/);
    const dash = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(dash, /packagesTab === PLANS_CATEGORY\.ANNUAL/);
    assert.match(dash, /onCta=\{startMarketplaceCheckout\}/);
  });

  it("AR/EN copy exists for the new keys", () => {
    for (const lang of ["ar", "en"]) {
      const plans = JSON.parse(read(`locales/${lang}/plans.json`));
      assert.ok(plans.categories.annual);
      assert.ok(plans.months.includes("{{count}}"));
      assert.ok(plans.membership.bidsForTerm);
      assert.ok(plans.membership.applicationNote);
      assert.ok(plans.annual.empty && plans.annual.footnote);
    }
    const ar = JSON.parse(read("locales/ar/plans.json"));
    assert.strictEqual(ar.categories.annual, "الباقات السنوية");
    assert.strictEqual(JSON.parse(read("locales/en/plans.json")).categories.annual, "Annual Plans");
  });
});
