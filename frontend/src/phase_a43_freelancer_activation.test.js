import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activationFairBadges,
  activationFairReasonLabel,
  isActivationFairRankingApplied,
} from "./constants/freelancerActivationFairDistribution.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A4.3 Super Admin activation ranking UI", () => {
  it("application list shows activation recommendation badges in Arabic", () => {
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /activation-fair-badges/);
    assert.match(panel, /activation-fair-reason-tag/);
    assert.match(panel, /isActivationFairRankingApplied/);
    assert.match(panel, /FairSelectionOverrideDialog/);
    assert.equal(
      activationFairReasonLabel("preferred_activation_candidate", { isEn: false }),
      "مرشح مفضل للتفعيل",
    );
    assert.equal(
      activationFairReasonLabel("first_work_opportunity", { isEn: false }),
      "أول فرصة عمل",
    );
    assert.equal(
      activationFairReasonLabel("no_previous_accepted_work", { isEn: false }),
      "لم يحصل على عمل مقبول سابقًا",
    );
    assert.equal(
      activationFairReasonLabel("low_workload", { isEn: false }),
      "عبء عمل منخفض",
    );
    assert.equal(
      activationFairReasonLabel("waiting", { isEn: false, waitingDays: 6 }),
      "ينتظر منذ 6 أيام",
    );
    const badges = activationFairBadges(
      {
        reasonTags: ["preferred_activation_candidate", "first_work_opportunity", "waiting"],
        metrics: { waitingDays: 6 },
      },
      { isEn: false },
    );
    assert.deepEqual(
      badges.map((b) => b.label),
      ["مرشح مفضل للتفعيل", "أول فرصة عمل", "ينتظر منذ 6 أيام"],
    );
  });

  it("non-activation article UI does not show activation recommendation", () => {
    assert.equal(isActivationFairRankingApplied({ activationFairRankingApplied: false }), false);
    assert.equal(isActivationFairRankingApplied({ candidates: [{ activationFairness: {} }] }), false);
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /isActivationFairRankingApplied\(fairRanking\)/);
    const dialog = read("admin/marketplaceArticles/FairSelectionOverrideDialog.jsx");
    assert.match(dialog, /activationOverride/);
    assert.match(dialog, /يمكن المتابعة/);
  });

  it("freelancer UI does not show ranking details", () => {
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.doesNotMatch(detail, /activation-fair-badges/);
    assert.doesNotMatch(detail, /مرشح مفضل للتفعيل/);
    assert.doesNotMatch(detail, /activationFairness/);
    assert.doesNotMatch(detail, /fairRanking/);
    assert.doesNotMatch(list, /activation-fair-badges/);
    assert.doesNotMatch(list, /مرشح مفضل للتفعيل/);
    assert.doesNotMatch(list, /activationFairness/);
  });

  it("existing application selection UI still works", () => {
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /selectAdminArticleApplicationRequest/);
    assert.match(panel, /isRecommendedArticleApplicant/);
    assert.match(panel, /overrideReason/);
  });
});
