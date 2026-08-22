import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activationAssignmentErrorMessage,
  formatActivationBudgetState,
} from "./constants/freelancerActivationCampaign.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A4.2 Super Admin budget UI", () => {
  it("campaign detail renders reserved/used/remaining and wave budget", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(src, /campaign-budget-summary/);
    assert.match(src, /محجوز \{budget\?\.reservedBudgetJod\}/);
    assert.match(src, /مستخدم \{budget\?\.usedBudgetJod\}/);
    assert.match(src, /متبقي \{budget\?\.remainingBudgetJod\}/);
    assert.match(src, /activation-wave-budget/);
    assert.match(src, /assigned-articles-count/);
    assert.match(src, /accepted-articles-count/);
  });

  it("article card shows budget state badge and assignment error is Arabic", () => {
    const card = read("admin/marketplaceArticles/MarketplaceArticleCard.jsx");
    assert.match(card, /activation-budget-state-badge/);
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /activationAssignmentErrorMessage/);
    assert.equal(
      activationAssignmentErrorMessage(
        { response: { data: { code: "ACTIVATION_CAMPAIGN_BUDGET_INSUFFICIENT" } } },
        { isEn: false },
      ),
      "ميزانية الحملة لا تكفي لإسناد هذه المقالة.",
    );
    assert.equal(formatActivationBudgetState("reserved"), "محجوز");
  });

  it("freelancer article pages do not expose campaign budget internals", () => {
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.doesNotMatch(detail, /reservedBudgetJod/);
    assert.doesNotMatch(detail, /activation-budget-state-badge/);
    assert.doesNotMatch(detail, /ميزانية الحملة لا تكفي/);
    assert.doesNotMatch(list, /reservedBudgetJod/);
    assert.doesNotMatch(list, /activation-budget-state-badge/);
  });
});
