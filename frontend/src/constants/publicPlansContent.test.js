/**
 * Public `/plans` Super Admin content editor wiring.
 * Run: node --test src/constants/publicPlansContent.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_PLANS_CONTENT_DEFAULTS,
  PUBLIC_PLANS_DEFAULT_SECTION,
  PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK,
  orderPublicPlansCategoryTabs,
  plansCategoryFromDefaultSection,
  resolvePublicPlansDefaultSection,
} from "./publicPlansContent.js";
import { PLANS_CATEGORY } from "./trainingPlansCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("public plans default section", () => {
  it("falls back to training and maps work to the membership tab only", () => {
    assert.equal(PUBLIC_PLANS_DEFAULT_SECTION_FALLBACK, "training");
    assert.equal(resolvePublicPlansDefaultSection(null), "training");
    assert.equal(resolvePublicPlansDefaultSection("work"), "work");
    assert.equal(resolvePublicPlansDefaultSection("membership"), "training");
    assert.equal(resolvePublicPlansDefaultSection("marketplace_plans"), "training");
    assert.equal(plansCategoryFromDefaultSection("training"), PLANS_CATEGORY.TRAINING);
    assert.equal(plansCategoryFromDefaultSection("work"), PLANS_CATEGORY.MEMBERSHIP);
    assert.deepEqual(orderPublicPlansCategoryTabs("training"), [
      PLANS_CATEGORY.TRAINING,
      PLANS_CATEGORY.MEMBERSHIP,
    ]);
    assert.deepEqual(orderPublicPlansCategoryTabs("work"), [
      PLANS_CATEGORY.MEMBERSHIP,
      PLANS_CATEGORY.TRAINING,
    ]);
    assert.deepEqual(orderPublicPlansCategoryTabs(null), [
      PLANS_CATEGORY.TRAINING,
      PLANS_CATEGORY.MEMBERSHIP,
    ]);
    assert.deepEqual(orderPublicPlansCategoryTabs("marketplace_plans"), [
      PLANS_CATEGORY.TRAINING,
      PLANS_CATEGORY.MEMBERSHIP,
    ]);
  });

  it("keeps current Production hero copy as configured defaults", () => {
    assert.equal(PUBLIC_PLANS_CONTENT_DEFAULTS.badgeText, "طوّر مهاراتك وابدأ مسارك المهني");
    assert.equal(PUBLIC_PLANS_CONTENT_DEFAULTS.title, "باقات التدريب الاحترافية");
    assert.equal(PUBLIC_PLANS_CONTENT_DEFAULTS.trainingTabLabel, "باقات التدريب");
    assert.equal(PUBLIC_PLANS_CONTENT_DEFAULTS.workTabLabel, "عضوية سوق أوردرز هاوس");
    assert.match(PUBLIC_PLANS_CONTENT_DEFAULTS.description, /اختر الباقة المناسبة لك/);
  });
});

describe("public plans content admin + public wiring", () => {
  it("Super Admin plans header opens a modal; fields are not permanent on the page", () => {
    const page = read("pages/dashboard/SuperAdminPlansPage.jsx");
    const control = read("admin/plans/PublicPlansContentAdminControl.jsx");
    const modal = read("admin/plans/PublicPlansContentModal.jsx");
    assert.match(page, /PublicPlansContentAdminControl|PlanCatalogActionToolbar/);
    assert.match(page, /PlanCatalogActionToolbar/);
    const toolbar = read("admin/plans/PlanCatalogActionToolbar.jsx");
    assert.match(toolbar, /oh-sapl-section-heading-actions/);
    assert.match(toolbar, /PublicPlansContentAdminControl/);
    assert.match(control, /تعديل محتوى صفحة الباقات/);
    assert.match(control, /variant="ghost"/);
    assert.match(modal, /تعديل محتوى صفحة الباقات/);
    assert.match(modal, /النص القصير/);
    assert.match(modal, /العنوان الرئيسي/);
    assert.match(modal, /الوصف/);
    assert.match(modal, /القسم الذي يظهر أولاً للمستخدم/);
    assert.match(modal, /trainingTabLabel/);
    assert.match(modal, /workTabLabel/);
    assert.match(modal, /oh-sapl-radio--with-input/);
    assert.match(modal, /حفظ التغييرات/);
    assert.match(modal, /تم تحديث محتوى صفحة الباقات بنجاح/);
    assert.match(modal, /type="radio"/);
    assert.match(modal, /PUBLIC_PLANS_DEFAULT_SECTION\.WORK/);
    assert.doesNotMatch(modal, /contentEditable|RichText|color|fontSize|alignment/);
    assert.doesNotMatch(page, /النص القصير/);
    assert.doesNotMatch(page, /public_plans_badge_text/);
  });

  it("public /plans consumes content texts and initial tab without changing catalog logic", () => {
    const plansPage = read("pages/Plans.jsx");
    const training = read("components/plans/TrainingPlansSection.jsx");
    const mobile = read("components/plans/mobile/PlansMobilePage.jsx");
    const hook = read("hooks/usePublicPlansContent.js");
    const cache = read("services/freelancerSessionCache.js");
    assert.match(plansPage, /usePublicPlansContent/);
    assert.match(plansPage, /plansCategoryFromDefaultSection/);
    assert.match(plansPage, /DEFAULT_PLANS_CATEGORY/);
    assert.match(plansPage, /PLANS_CATEGORY\.TRAINING/);
    assert.match(plansPage, /TrainingPlansSection/);
    assert.match(plansPage, /PlansCategoryToggle/);
    assert.match(plansPage, /trainingTabLabel/);
    assert.match(plansPage, /workTabLabel/);
    const toggle = read("components/plans/PlansCategoryToggle.jsx");
    assert.match(toggle, /trainingLabel/);
    assert.match(toggle, /membershipLabel/);
    assert.match(toggle, /defaultSection/);
    assert.match(toggle, /orderPublicPlansCategoryTabs/);
    assert.match(toggle, /clicks do not reorder/);
    assert.doesNotMatch(toggle, /row-reverse|flex-direction/);
    assert.match(plansPage, /defaultSection=\{plansContent\.defaultSection\}/);
    assert.match(plansPage, /!plansContent\.ready/);
    assert.doesNotMatch(plansPage, /plansContent\.loading && category === PLANS_CATEGORY\.TRAINING/);
    const toggleCss = read("styles/plansPage.css");
    const toggleCssBlock = toggleCss.slice(
      toggleCss.indexOf(".plans-category-toggle {"),
      toggleCss.indexOf(".plans-page--ref .pricing__grid--training-three"),
    );
    assert.doesNotMatch(toggleCssBlock, /row-reverse|flex-direction:\s*row-reverse/);
    assert.doesNotMatch(toggleCssBlock, /^\s*order:/m);
    assert.match(training, /eyebrow/);
    assert.match(mobile, /trainingEyebrow/);
    assert.match(hook, /textsAreCustom/);
    assert.match(hook, /trainingTabLabel/);
    assert.match(hook, /workTabLabel/);
    assert.match(cache, /invalidatePublicPlansContentCache/);
    assert.match(cache, /getPublicPlansContentRequest/);
    assert.doesNotMatch(plansPage, /default_plan_catalog/);
    assert.doesNotMatch(hook, /default_plan_catalog/);
  });

  it("does not merge public_plans_default_section with default_plan_catalog", () => {
    const constants = read("constants/publicPlansContent.js");
    const catalog = read("constants/planCatalogs.js");
    assert.match(constants, /PUBLIC_PLANS_DEFAULT_SECTION/);
    assert.match(constants, /Does not touch default_plan_catalog/);
    assert.match(constants, /orderPublicPlansCategoryTabs/);
    assert.doesNotMatch(constants, /DEFAULT_PLAN_CATALOG_INITIAL_VALUE/);
    assert.match(catalog, /DEFAULT_PLAN_CATALOG_INITIAL_VALUE/);
    assert.doesNotMatch(catalog, /public_plans_default_section/);
  });
});
