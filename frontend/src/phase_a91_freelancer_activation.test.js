import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS,
  defaultSplitForTier,
} from "./constants/freelancerActivationArticleOps.js";
import { sharesSumToTotal } from "./constants/freelancerActivationCampaign.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A9.1 Mini Article ops UI", () => {
  it("ops panel renders fund, allocation, and inventory tabs", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    const arArticles = JSON.parse(read("locales/ar/articles.json"));
    assert.match(panel, /activation-article-ops-panel/);
    assert.match(panel, /activationOps\.tabs\.fund/);
    assert.match(arArticles.activationOps.tabs.fund, /صندوق المقالات/);
    assert.match(panel, /activationOps\.tabs\.alloc/);
    assert.match(arArticles.activationOps.tabs.alloc, /توزيع الخطط/);
    assert.match(panel, /activationOps\.tabs\.inventory/);
    assert.match(arArticles.activationOps.tabs.inventory, /مخزن المقالات/);
    assert.match(panel, /activation-fund-balance/);
    assert.match(panel, /activation-fund-deposit-form/);
    assert.match(panel, /activation-fund-withdraw-form/);
    assert.match(panel, /activationOps\.alloc\.totalValue/);
    assert.match(arArticles.activationOps.alloc.totalValue, /إجمالي قيمة المقال/);
    assert.match(panel, /activationOps\.alloc\.freelancerShare/);
    assert.match(arArticles.activationOps.alloc.freelancerShare, /حصة المستقل/);
    assert.match(panel, /activationOps\.alloc\.platformShare/);
    assert.match(panel, /activationOps\.alloc\.reviewerShare/);
    assert.match(panel, /activation-alloc-error/);
    assert.match(panel, /activationOps\.allocSharesError/);
    assert.match(arArticles.activationOps.allocSharesError, /يجب أن يساوي مجموع الحصص إجمالي قيمة المقال/);
    assert.match(panel, /activation-inventory-form/);
    assert.match(panel, /activationOps\.inventory\.releaseArticle/);
    assert.match(panel, /activation-no-auto-assign-note/);
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    const arActivation = JSON.parse(read("locales/ar/activation.json"));
    assert.doesNotMatch(page, /FreelancerActivationArticleOpsPanel/);
    assert.match(page, /activation-article-mgmt-link-card/);
    assert.match(page, /activation\.page\.openArticles/);
    assert.match(arActivation.page.openArticles, /فتح المقالات/);
    assert.match(page, /\/dashboard\/super-admin\/articles/);
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /listSuperAdminActivationArticleFundRequest|getSuperAdminActivationArticleFundRequest/);
    assert.match(hub, /MarketplaceArticleApplicationsPanel|listSuperAdminActivationLiveArticlesRequest/);
  });

  it("default splits match product examples and validate", () => {
    const s = defaultSplitForTier("starter");
    assert.equal(s.totalArticleValueJod, "1.000");
    assert.ok(
      sharesSumToTotal(s.totalArticleValueJod, s.freelancerShareJod, s.companyShareJod, s.reviewerShareJod),
    );
    const silver = FREELANCER_ACTIVATION_PLAN_SPLIT_DEFAULTS.silver;
    assert.ok(
      sharesSumToTotal(
        silver.totalArticleValueJod,
        silver.freelancerShareJod,
        silver.companyShareJod,
        silver.reviewerShareJod,
      ),
    );
  });

  it("freelancer card shows full value label; detail shows breakdown", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    const ar = JSON.parse(read("locales/ar/articles.json"));
    assert.match(list, /freelancer\.list\.articleValue/);
    assert.match(ar.freelancer.list.articleValue, /قيمة المقال:/);
    assert.match(list, /article-card-full-value/);
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /freelancer\.detail\.totalValue/);
    assert.match(ar.freelancer.detail.totalValue, /إجمالي قيمة المقال/);
    assert.match(detail, /freelancer\.detail\.netAfterSplit/);
    assert.match(ar.freelancer.detail.netAfterSplit, /صافي مستحقاتك بعد التوزيع/);
    assert.match(detail, /freelancer\.detail\.reviewerShare/);
    assert.match(detail, /freelancer\.detail\.platformShare/);
    assert.match(detail, /article-detail-freelancer-share/);
  });

  it("earned balance panel does not claim gross is withdrawable", () => {
    const earned = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.doesNotMatch(earned, /قابل للسحب|withdrawable/i);
    assert.doesNotMatch(earned, /إجمالي قيمة المقال/);
  });
});
