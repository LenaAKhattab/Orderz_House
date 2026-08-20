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
  it("panel renders pending total and empty state", () => {
    const src = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(src, /الرصيد المكتسب/);
    assert.match(src, /قيد المعالجة/);
    assert.match(src, /earned-balance-pending/);
    assert.match(src, /earned-balance-empty/);
    assert.match(src, /EARNED_BALANCE_HELPER_AR/);
    assert.match(EARNED_BALANCE_HELPER_AR, /السحب أو المطالبة المالية/);
    assert.doesNotMatch(src, /<button/i);
    assert.doesNotMatch(src, /withdraw/i);
    const page = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(page, /FreelancerEarnedBalancePanel/);
    assert.match(page, /FreelancerActivationTrialStatusBlock/);
    assert.match(page, /silver-cta-placeholder|FreelancerActivationTrialStatusBlock/);
  });

  it("entry with Bildazo URL shows open article action", () => {
    const src = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(src, /earned-balance-open-article/);
    assert.match(src, /فتح المقال/);
    assert.match(src, /نُشر على Bildazo/);
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
      MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
      "أوافق على شروط ملكية ونشر هذا المقال، وأفهم أنه عند قبول المقال يمكن نشره باسمي على Bildazo وفق سياسة المنصة.",
    );
    const admin = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(admin, /admin-submission-terms/);
    assert.equal(
      formatManuscriptTermsAdmin({ termsAccepted: false }, { isEn: false }),
      "الشروط: غير مقبولة",
    );
  });
});
