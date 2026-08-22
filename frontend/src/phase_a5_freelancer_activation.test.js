import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EARNED_BALANCE_HELPER_AR,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  formatManuscriptTermsAdmin,
} from "./constants/freelancerActivationEarnedBalance.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A5 freelancer earned balance UI", () => {
  it("panel renders locked pending total, Silver CTA, and empty state", () => {
    const src = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(src, /الرصيد المكتسب/);
    assert.match(src, /معلّق غير قابل للسحب/);
    assert.match(src, /earned-balance-pending/);
    assert.match(src, /earned-balance-empty/);
    assert.match(src, /earned-balance-silver-cta/);
    assert.match(src, /EARNED_BALANCE_HELPER_AR/);
    assert.match(EARNED_BALANCE_HELPER_AR, /صافي أجر الكاتب/);
    assert.match(src, /<button/i);
    const page = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(page, /FreelancerEarnedBalancePanel/);
    assert.match(page, /FreelancerActivationTrialStatusBlock/);
    assert.match(page, /silver-cta-placeholder|FreelancerActivationTrialStatusBlock/);
  });

  it("entry with Bildazo URL shows open article action", () => {
    const src = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(src, /earned-balance-open-article/);
    assert.match(src, /BILDAZO_VIEW_ARTICLE_AR/);
    assert.match(src, /مقال مقبول/);
  });
});

describe("Phase A5 manuscript terms UI", () => {
  it("final manuscript form requires Arabic checkbox", () => {
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /manuscript-terms-checkbox/);
    assert.match(detail, /MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR/);
    assert.match(detail, /termsAccepted: true/);
    assert.match(detail, /disabled=\{busy \|\| !termsAccepted\}/);
    assert.equal(
      MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR.includes("أوافق على شروط ملكية ونشر هذا المقال"),
      true,
    );
    assert.match(MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR, /غير قابل للسحب/);
    const admin = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(admin, /admin-submission-terms/);
    assert.equal(
      formatManuscriptTermsAdmin({ termsAccepted: false }, { isEn: false }),
      "الشروط: غير مقبولة",
    );
  });
});
