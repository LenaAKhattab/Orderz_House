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
  BILDAZO_AUTHOR_NOT_LINKED_AR,
  ARTICLE_WRITING_MODE_LABELS_AR,
} from "./admin/marketplaceArticles/marketplaceArticleFormUtils.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("OZ-Articles-Bildazo-02 inventory form", () => {
  it("form fields include title/description/category/writingMode", () => {
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(modal, /article-form-title/);
    assert.match(modal, /article-form-description/);
    assert.match(modal, /bildazo-category-select/);
    assert.match(modal, /article-form-writing-mode/);
    assert.match(modal, /ARTICLE_WRITING_MODE_LABELS_AR/);
    assert.match(utils, /بالذكاء الاصطناعي/);
    assert.match(utils, /يدوي/);
    assert.match(utils, /لا يفرق/);
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.ai, "بالذكاء الاصطناعي");
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.manual, "يدوي");
    assert.equal(ARTICLE_WRITING_MODE_LABELS_AR.either, "لا يفرق");
  });

  it("requires bildazoCategoryId + writingMode on save", () => {
    const base = getInitialMarketplaceArticleFormState({
      title: "عنوان",
      requiredBidCount: 10,
      minRequiredBidsAcknowledged: true,
    });
    assert.ok(validateMarketplaceArticleForm(base).bildazoCategoryId);
    assert.ok(validateMarketplaceArticleForm(base).writingMode);
    const ok = {
      ...base,
      bildazoCategoryId: "11111111-1111-4111-8111-111111111111",
      bildazoCategoryName: "تقنية",
      writingMode: "either",
    };
    assert.deepEqual(validateMarketplaceArticleForm(ok), {});
    const payload = normalizeMarketplaceArticlePayload(ok);
    assert.equal(payload.writingMode, "either");
    assert.equal(payload.bildazoCategoryId, "11111111-1111-4111-8111-111111111111");
  });
});

describe("OZ-Articles-Bildazo-02 package requirements section", () => {
  it("admin panel exposes متطلبات الباقات accordion + STARTER/SILVER/PRO/ELITE editors", () => {
    const panel = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(panel, /متطلبات الباقات/);
    assert.match(panel, /package-requirements-section/);
    assert.match(panel, /ARTICLE_PACKAGE_PLAN_CODES/);
    assert.match(panel, /package-req-words-/);
    assert.match(panel, /package-req-refs-/);
    assert.match(utils, /STARTER/);
    assert.match(utils, /SILVER/);
    assert.match(utils, /PRO/);
    assert.match(utils, /ELITE/);
    assert.match(panel, /updateAdminArticlePackageRequirementsRequest/);
    assert.match(panel, /isSuperAdminUser/);
    assert.match(panel, /listAdminBildazoCategoriesRequest/);
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
