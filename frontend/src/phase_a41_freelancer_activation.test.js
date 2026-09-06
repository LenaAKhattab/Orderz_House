import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freelancerTrialApplyErrorMessage } from "./constants/freelancerActivationTrial.js";
import {
  formatActivationAttachmentBadge,
  normalizeMarketplaceArticlePayload,
  getInitialMarketplaceArticleFormState,
} from "./admin/marketplaceArticles/marketplaceArticleFormUtils.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A4.1 Super Admin article attachment UI", () => {
  it("article form has campaign/wave selectors and card shows badge", () => {
    const form = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    assert.match(form, /activation-campaign-select/);
    assert.match(form, /activation-wave-select/);
    const card = read("admin/marketplaceArticles/MarketplaceArticleCard.jsx");
    assert.match(card, /activation-attachment-badge/);
    const page = read("pages/dashboard/SuperAdminMarketplaceArticlesPage.jsx");
    assert.match(page, /listSuperAdminActivationCampaignsRequest/);
    assert.match(page, /activationCampaigns/);
  });

  it("payload includes optional activation ids without requiring them", () => {
    const payload = normalizeMarketplaceArticlePayload(
      getInitialMarketplaceArticleFormState({
        title: "T",
        minRequiredBidsAcknowledged: true,
      }),
    );
    assert.equal(payload.activationCampaignId, null);
    assert.equal(payload.activationWaveId, null);
    assert.equal(
      formatActivationAttachmentBadge(
        { activationCampaignId: 3, activationWaveId: 8 },
        [{ id: 3, name: "Fund", waves: [{ id: 8, name: "W1" }] }],
      ),
      "Fund · W1",
    );
  });
});

describe("Phase A4.1 emergency stop and freelancer apply copy", () => {
  it("campaign page explains emergency stop blocks applications and assignment", () => {
    const src = read("pages/dashboard/SuperAdminFreelancerActivationPage.jsx");
    assert.match(src, /emergency-stop-copy/);
    assert.match(src, /blocks new applications and assignment/);
    assert.match(src, /linked-articles-count/);
    assert.doesNotMatch(src, /internal budget/);
  });

  it("freelancer apply blocked messages are Arabic and not generic Bid errors", () => {
    assert.equal(
      freelancerTrialApplyErrorMessage(
        { response: { data: { code: "ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED" } } },
        { isEn: false },
      ),
      "تم إيقاف الحملة مؤقتًا من الإدارة.",
    );
    assert.equal(
      freelancerTrialApplyErrorMessage(
        { response: { data: { code: "ACTIVATION_WAVE_PAUSED" } } },
        { isEn: false },
      ),
      "تم إيقاف استقبال التقديمات لهذه الفرصة مؤقتًا.",
    );
    const ar = freelancerTrialApplyErrorMessage(
      { publicCode: "ACTIVATION_CAMPAIGN_PAUSED" },
      { isEn: false },
    );
    assert.doesNotMatch(ar, /Bid/i);
    assert.doesNotMatch(ar, /ميزانية/);
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /freelancerTrialApplyErrorMessage/);
    assert.doesNotMatch(detail, /ACTIVATION_CAMPAIGN_EMERGENCY_STOPPED/);
  });
});
