/**
 * Bildazo Writer Experience Phase 1 — freelancer مقالاتي, gate copy, post-publish UX.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BILDAZO_GATE_CTA_AR,
  BILDAZO_GATE_REQUIRED_MESSAGE_AR,
  BILDAZO_LINKED_STATUS_AR,
  BILDAZO_VIEW_WRITER_PROFILE_AR,
} from "./constants/bildazoAuthorTerms.js";
import {
  BILDAZO_PUBLISH_SUCCESS_AR,
  BILDAZO_VIEW_ARTICLE_AR,
} from "./constants/bildazoArticlePublish.js";
import {
  MY_ARTICLES_EMPTY_DESC_AR,
  MY_ARTICLES_EMPTY_TITLE_AR,
  MY_ARTICLES_PORTFOLIO_STATUSES,
} from "./constants/freelancerMyArticlesPortfolio.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Freelancer مقالاتي page", () => {
  it("route and nav are registered", () => {
    assert.match(read("App.jsx"), /path="\/dashboard\/freelancer\/my-articles"/);
    assert.match(read("constants/freelancerNav.js"), /\/dashboard\/freelancer\/my-articles/);
    assert.match(read("services/api.js"), /\/freelancer\/my-articles/);
  });

  it("page renders portfolio filters and empty state copy", () => {
    const page = read("pages/dashboard/FreelancerMyArticlesPage.jsx");
    assert.match(page, /FreelancerMyArticlesPage/);
    assert.match(page, /my-articles-filters/);
    assert.match(page, /my-articles-empty/);
    assert.match(page, /MY_ARTICLES_EMPTY_TITLE_AR/);
    assert.match(page, /MY_ARTICLES_EMPTY_DESC_AR/);
    assert.equal(MY_ARTICLES_EMPTY_TITLE_AR, "لم تبدأ بعد في تنفيذ أي مقالات.");
  });

  it("published cards show post-publish success actions", () => {
    const page = read("pages/dashboard/FreelancerMyArticlesPage.jsx");
    assert.match(page, /FreelancerBildazoPublishSuccessBlock/);
    assert.match(page, /published_on_bildazo/);
  });

  it("portfolio filters include awaiting selection and review states", () => {
    const keys = MY_ARTICLES_PORTFOLIO_STATUSES.map((s) => s.key);
    assert.ok(keys.includes("awaiting_selection"));
    assert.ok(keys.includes("awaiting_execution"));
    assert.ok(keys.includes("under_review"));
    assert.ok(keys.includes("published_on_bildazo"));
    const awaitingSelection = MY_ARTICLES_PORTFOLIO_STATUSES.find((s) => s.key === "awaiting_selection");
    assert.equal(awaitingSelection?.labelAr, "بانتظار الاختيار");
    const portfolioUtil = read("../../backend/src/utils/freelancerMyArticlesPortfolio.js");
    assert.match(portfolioUtil, /app === "pending"/);
    assert.match(portfolioUtil, /return "awaiting_selection"/);
    assert.match(portfolioUtil, /submitted.*under_review/s);
    assert.match(portfolioUtil, /return "awaiting_execution"/);
    assert.match(portfolioUtil, /published_on_bildazo/);
  });
});

describe("Bildazo gate Arabic copy", () => {
  it("gate card uses product-focused message and CTA", () => {
    const gate = read("components/freelancer/FreelancerBildazoAuthorGateCard.jsx");
    assert.match(gate, /BILDAZO_GATE_REQUIRED_MESSAGE_AR/);
    assert.match(gate, /BILDAZO_GATE_CTA_AR/);
    assert.equal(
      BILDAZO_GATE_REQUIRED_MESSAGE_AR,
      "لتتمكن من تنفيذ المقالات ونشر أعمالك باسمك، فعّل ملف الكاتب الخاص بك على Bildazo.",
    );
    assert.equal(BILDAZO_GATE_CTA_AR, "تفعيل حساب الكاتب على Bildazo");
  });

  it("linked widget shows activated status and profile CTA", () => {
    const widget = read("components/freelancer/FreelancerBildazoLinkedAccountWidget.jsx");
    assert.match(widget, /BILDAZO_LINKED_STATUS_AR/);
    assert.match(widget, /bildazo-view-writer-profile/);
    assert.equal(BILDAZO_LINKED_STATUS_AR, "حساب Bildazo: مفعّل ✓");
  });
});

describe("Post-publication UX", () => {
  it("success block shows required Arabic copy and actions", () => {
    const block = read("components/freelancer/FreelancerBildazoPublishSuccessBlock.jsx");
    assert.match(block, /freelancerBildazoPublishCopy/);
    assert.match(block, /bildazo-view-article/);
    assert.match(block, /bildazo-view-writer-profile/);
    assert.equal(BILDAZO_PUBLISH_SUCCESS_AR, "تم نشر مقالك بنجاح على Bildazo.");
    assert.equal(BILDAZO_VIEW_ARTICLE_AR, "مشاهدة المقال");
    assert.equal(BILDAZO_VIEW_WRITER_PROFILE_AR, "مشاهدة ملفي ككاتب");
  });

  it("article detail uses success block for published state", () => {
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /FreelancerBildazoPublishSuccessBlock/);
  });

  it("earned balance panel links article and writer profile when URLs exist", () => {
    const panel = read("components/freelancer/FreelancerEarnedBalancePanel.jsx");
    assert.match(panel, /earned-balance-open-article/);
    assert.match(panel, /earned-balance-writer-profile/);
    assert.match(panel, /BILDAZO_VIEW_ARTICLE_AR/);
  });
});

describe("Freelancer pages hide admin internals", () => {
  it("مقالاتي page does not expose campaign fund internals", () => {
    const page = read("pages/dashboard/FreelancerMyArticlesPage.jsx");
    assert.doesNotMatch(page, /article-fund|campaignBudget|freelancer_share_jod/);
  });
});

describe("Super Admin Bildazo integration section", () => {
  it("links page embeds compact integration panel", () => {
    const page = read("pages/dashboard/SuperAdminBildazoAuthorLinksPage.jsx");
    assert.match(page, /SuperAdminFreelancerBildazoIntegrationPanel/);
    assert.match(page, /تكامل Bildazo/);
  });
});
