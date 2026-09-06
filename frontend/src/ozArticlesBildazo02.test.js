/**
 * OZ-Articles-Bildazo-02 — frontend UI contracts (inventory, packages, freelancer, review).
 * Run: node --test src/ozArticlesBildazo02.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getInitialMarketplaceArticleFormState,
  normalizeMarketplaceArticlePayload,
  validateMarketplaceArticleForm,
  validateFreelancerManuscriptForm,
  formatDerivedPlanRequirementsSummaryAr,
  BILDAZO_AUTHOR_NOT_LINKED_AR,
  ARTICLE_WRITING_MODE_LABELS_AR,
} from "./admin/marketplaceArticles/marketplaceArticleFormUtils.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("OZ-Articles-Bildazo-02 inventory form", () => {
  it("form fields include title/description/category/writingMode/targetPlan and hide per-article words", () => {
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(modal, /article-form-title/);
    assert.match(modal, /article-form-description/);
    assert.match(modal, /الوصف \/ التعليمات/);
    assert.match(modal, /bildazo-category-select/);
    assert.match(modal, /article-form-writing-mode/);
    assert.match(modal, /article-form-target-plan/);
    assert.match(modal, /article-form-derived-requirements/);
    assert.match(modal, /الخطة المستهدفة/);
    assert.match(modal, /ARTICLE_WRITING_MODE_LABELS_AR/);
    assert.doesNotMatch(modal, /مستوى المقال/);
    assert.doesNotMatch(modal, /عدد الكلمات المطلوب/);
    assert.doesNotMatch(modal, /عدد المراجع المطلوب/);
    assert.doesNotMatch(modal, /القيمة \(د\.أ، مشتقة\)/);
    assert.match(utils, /بالذكاء الاصطناعي/);
    assert.match(utils, /يدوي/);
    assert.match(utils, /لا يفرق/);
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.ai, "بالذكاء الاصطناعي");
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.manual, "يدوي");
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.either, "لا يفرق");
  });

  it("requires bildazoCategoryId + writingMode + targetPlan; derives words from plan", () => {
    const base = getInitialMarketplaceArticleFormState({
      title: "عنوان",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
      targetPlanCode: "",
    });
    assert.ok(validateMarketplaceArticleForm(base).bildazoCategoryId);
    assert.ok(validateMarketplaceArticleForm(base).writingMode);
    assert.ok(validateMarketplaceArticleForm(base).targetPlanCode);
    const ok = {
      ...base,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      bildazoCategoryName: "تقنية",
      writingMode: "either",
      targetPlanCode: "SILVER",
    };
    assert.deepEqual(validateMarketplaceArticleForm(ok), {});
    const payload = normalizeMarketplaceArticlePayload(ok);
    assert.equal(payload.writingMode, "either");
    assert.equal(payload.bildazoCategoryId, "11111111-1111-4111-8111-111111111111");
    assert.equal(payload.targetPlanCode, "SILVER");
    assert.equal(payload.requiredWordCount, 1200);
    assert.equal(payload.requiredReferencesCount, 4);
    assert.equal(payload.articleLevel, 2);
  });

  it("declares derivedSummary and stays null-safe for missing plan/requirements", () => {
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    assert.match(modal, /const derivedSummary = useMemo/);
    assert.match(modal, /formatDerivedPlanRequirementsSummaryAr\(form\.targetPlanCode, packageRequirements\)/);
    assert.match(modal, /packageRequirements = null/);
    assert.match(modal, /inventorySimplified = false/);
    assert.doesNotMatch(modal, /valueLabel = deriveArticleValueJodFromLevel/);

    assert.match(
      formatDerivedPlanRequirementsSummaryAr(""),
      /سيتم تطبيق متطلبات الخطة تلقائياً عند اختيارها/,
    );
    assert.match(
      formatDerivedPlanRequirementsSummaryAr(null, []),
      /سيتم تطبيق متطلبات الخطة تلقائياً عند اختيارها/,
    );
    assert.equal(
      formatDerivedPlanRequirementsSummaryAr("STARTER"),
      "سيتم تطبيق متطلبات خطة تجربة / مجاني تلقائياً: 600 كلمة و 2 مراجع.",
    );
    assert.equal(
      formatDerivedPlanRequirementsSummaryAr("SILVER", [
        { planCode: "SILVER", minWords: 1200, minReferences: 4 },
      ]),
      "سيتم تطبيق متطلبات خطة فضية (Silver) تلقائياً: 1200 كلمة و 4 مراجع.",
    );
    assert.equal(
      formatDerivedPlanRequirementsSummaryAr("PRO"),
      "سيتم تطبيق متطلبات خطة احترافية (Pro) تلقائياً: 1800 كلمة و 6 مراجع.",
    );
    assert.equal(
      formatDerivedPlanRequirementsSummaryAr("ELITE"),
      "سيتم تطبيق متطلبات خطة نخبة (Elite) تلقائياً: 2400 كلمة و 8 مراجع.",
    );
  });
});

describe("OZ-Articles-Bildazo-02 package requirements section", () => {
  it("admin panel exposes متطلبات الباقات accordion + STARTER/SILVER/PRO/ELITE editors", () => {
    const panel = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(panel, /متطلبات الباقات/);
    assert.match(panel, /package-requirements-section/);
    assert.match(panel, /ARTICLE_PACKAGE_PLAN_CODES/);
    assert.match(panel, /ARTICLE_PACKAGE_PLAN_LABELS_AR/);
    assert.match(panel, /package-req-words-/);
    assert.match(panel, /package-req-refs-/);
    assert.match(utils, /STARTER/);
    assert.match(utils, /SILVER/);
    assert.match(utils, /PRO/);
    assert.match(utils, /ELITE/);
    assert.match(utils, /تجربة \/ مجاني/);
    assert.match(panel, /updateAdminArticlePackageRequirementsRequest/);
    assert.match(panel, /isSuperAdminUser/);
    assert.match(panel, /listAdminBildazoCategoriesRequest/);
    assert.match(panel, /inventoryHub/);
    assert.match(panel, /variant="inline"/);
    assert.match(panel, /حفظ في المخزون/);
    assert.match(panel, /BILDAZO_CATEGORIES_LOAD_ERROR_AR/);
  });
});

describe("OZ-Articles-Bildazo-02 Super Admin hub inventory wiring", () => {
  it("hub inventory tab always mounts OZ02 panel with required labels path", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const panel = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    assert.match(hub, /articles-hub-panel-inventory/);
    assert.match(hub, /articles-marketplace-create-panel/);
    assert.match(hub, /MarketplaceArticlesAdminPanel inventoryHub/);
    assert.doesNotMatch(hub, /showCreateArticles/);
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*=\s*false/);
    assert.match(hub, /ARTICLE_CANONICAL_PLAN_TIER_OPTIONS/);
    assert.doesNotMatch(hub, /FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS/);
    assert.match(modal, /صنف بلدازو/);
    assert.match(modal, /نمط الكتابة/);
    assert.match(modal, /ARTICLE_WRITING_MODE_LABELS_AR/);
    assert.match(modal, /ARTICLE_TARGET_PLAN_OPTIONS/);
    assert.match(modal, /o\.labelAr/);
    assert.doesNotMatch(modal, /FREELANCER_ACTIVATION_PLAN_TIER_OPTIONS/);
    assert.match(panel, /متطلبات الباقات/);
    assert.match(panel, /package-requirements-auto-hint/);
    assert.match(panel, /هذه القيم تُطبّق تلقائياً حسب الخطة المستهدفة/);
    assert.match(panel, /ARTICLE_PACKAGE_PLAN_CODES/);
    assert.match(panel, /ARTICLE_PACKAGE_PLAN_LABELS_AR/);
    assert.match(panel, /إضافة مقال إلى المخزون/);
    assert.match(panel, /قائمة مقالات المخزون/);
    assert.match(modal, /الوصف \/ التعليمات/);
    assert.match(panel, /createMarketplaceArticleRequest/);
    assert.match(panel, /onSubmit=\{handleCreate\}/);
    assert.match(panel, /inventorySimplified/);
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(utils, /بالذكاء الاصطناعي/);
    assert.match(utils, /يدوي/);
    assert.match(utils, /لا يفرق/);
    assert.match(utils, /STARTER/);
    assert.match(utils, /SILVER/);
    assert.match(utils, /PRO/);
    assert.match(utils, /ELITE/);
    assert.match(utils, /تجربة \/ مجاني/);
  });

  it("single visible add-article form; legacy title-only activation form gated off", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    const panel = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    const card = read("admin/marketplaceArticles/MarketplaceArticleCard.jsx");

    assert.equal((hub.match(/MarketplaceArticlesAdminPanel inventoryHub/g) || []).length, 1);
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*=\s*false/);
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*\?\s*\(/);
    assert.match(hub, /data-testid="articles-inventory-add-form"/);
    assert.match(hub, /حفظ في مخزون التفعيل/);

    assert.match(panel, /data-testid="inventory-add-section"/);
    assert.match(panel, /titleOverride="إضافة مقال إلى المخزون"/);
    assert.match(panel, /submitLabel="حفظ في المخزون"/);
    assert.match(panel, /variant="inline"/);
    assert.match(modal, /العنوان/);
    assert.match(modal, /الوصف \/ التعليمات/);
    assert.match(modal, /صنف بلدازو/);
    assert.match(modal, /نمط الكتابة/);
    assert.match(modal, /الخطة المستهدفة/);
    assert.match(modal, /article-form-derived-requirements/);
    assert.match(modal, /formatDerivedPlanRequirementsSummaryAr/);
    assert.match(modal, /حفظ في المخزون|submitLabel/);
    assert.match(card, /غير محدد/);
    assert.match(card, /article-card-bildazo-category/);
    assert.match(card, /article-card-writing-mode/);
  });
});

describe("OZ-Articles-Bildazo-02 freelancer requirements", () => {
  it("freelancer detail shows requirements and manuscript writing/refs fields", () => {
    const page = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(page, /freelancer-article-requirements/);
    assert.match(page, /article-detail-required-words/);
    assert.match(page, /article-detail-required-refs/);
    assert.match(page, /article-detail-writing-mode/);
    assert.match(page, /article-detail-bildazo-category/);
    assert.match(page, /manuscript-references/);
    assert.match(page, /manuscript-writing-source/);
    assert.match(page, /ARTICLE_WRITING_SOURCES/);
    assert.match(page, /validateFreelancerManuscriptForm/);
    assert.match(page, /titleSnapshot/);
    assert.match(page, /writingModeSnapshot/);
  });
});

describe("OZ-Articles-Bildazo-02 admin review preview", () => {
  it("shows payload preview and author warning strings", () => {
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /admin-bildazo-publish-preview/);
    assert.match(panel, /admin-bildazo-author-warning/);
    assert.match(panel, /getAdminArticleBildazoPublishPreviewRequest/);
    assert.match(panel, /bildazoPublishPreview/);
    assert.match(panel, /needs_manual_review/);
    assert.match(panel, /admin-bildazo-publish-failed/);
    assert.match(panel, /BILDAZO_AUTHOR_NOT_LINKED_AR/);
    assert.equal(
      BILDAZO_AUTHOR_NOT_LINKED_AR,
      "لا يمكن نشر المقال قبل ربط حساب الكاتب في بلدازو.",
    );
  });
});

describe("OZ-Articles-Bildazo-02 validation messages", () => {
  it("exposes Arabic manuscript validation messages", () => {
    const errors = validateFreelancerManuscriptForm(
      { title: "", content: "", referencesText: "", writingSource: "", termsAccepted: false },
      { requiredWordCount: 100, requiredReferencesCount: 2, writingMode: "manual" },
    );
    assert.match(errors.title, /عنوان/);
    assert.match(errors.content, /محتوى|كلمة/);
    assert.match(errors.referencesText, /مرجع/);
    assert.match(errors.writingSource, /طريقة الكتابة/);
    assert.match(errors.termsAccepted, /شروط/);

    const modeMismatch = validateFreelancerManuscriptForm(
      {
        title: "عنوان كافٍ",
        content: "كلمة ".repeat(120),
        referencesText: "a\nb",
        writingSource: "AI_ASSISTED",
        termsAccepted: true,
      },
      { requiredWordCount: 100, requiredReferencesCount: 2, writingMode: "manual" },
    );
    assert.equal(modeMismatch.writingSource, "طريقة الكتابة لا تطابق متطلبات المقال.");
  });

  it("api helpers wrap OZ-02 endpoints", () => {
    const api = read("services/api.js");
    assert.match(api, /listAdminBildazoCategoriesRequest/);
    assert.match(api, /listAdminArticlePackageRequirementsRequest/);
    assert.match(api, /updateAdminArticlePackageRequirementsRequest/);
    assert.match(api, /getAdminArticleBildazoPublishPreviewRequest/);
    assert.match(api, /bildazo-categories/);
    assert.match(api, /package-requirements/);
    assert.match(api, /bildazo-publish-preview/);
  });
});
