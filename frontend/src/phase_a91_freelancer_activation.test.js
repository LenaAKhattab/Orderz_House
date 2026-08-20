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
    assert.match(panel, /activation-article-ops-panel/);
    assert.match(panel, /صندوق المقالات/);
    assert.match(panel, /توزيع الخطط اليومي/);
    assert.match(panel, /مخزن المقالات/);
    assert.match(panel, /activation-fund-balance/);
    assert.match(panel, /activation-fund-deposit-form/);
    assert.match(panel, /activation-fund-withdraw-form/);
    assert.match(panel, /إجمالي قيمة المقال/);
    assert.match(panel, /حصة الفريلانسر/);
    assert.match(panel, /حصة الشركة/);
    assert.match(panel, /حصة التدقيق/);
    assert.match(panel, /activation-alloc-error/);
    assert.match(panel, /يجب أن يساوي مجموع الحصص إجمالي قيمة المقال/);
    assert.match(panel, /activation-inventory-form/);
    assert.match(panel, /إنزال مقال/);
    assert.match(panel, /activation-no-auto-assign-note/);
    const page = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(page, /FreelancerActivationArticleOpsPanel/);
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
    assert.match(list, /قيمة المقال:/);
    assert.match(list, /article-card-full-value/);
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /إجمالي قيمة المقال/);
    assert.match(detail, /صافي مستحقاتك بعد التوزيع/);
    assert.match(detail, /حصة التدقيق/);
    assert.match(detail, /حصة المنصة/);
    assert.match(detail, /article-detail-freelancer-share/);
  });

  it("earned balance panel does not claim gross is withdrawable", () => {
    const earned = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.doesNotMatch(earned, /قابل للسحب|withdrawable/i);
    assert.doesNotMatch(earned, /إجمالي قيمة المقال/);
  });
});
