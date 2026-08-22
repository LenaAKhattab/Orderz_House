/**
 * Bildazo Writer Experience Phase 1 — route wiring, portfolio, duplicate ID, monitoring column.
 * Run: node --test test/bildazoWriterExperiencePhase1.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/bildazo_writer_phase1_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const portfolio = require("../src/utils/freelancerMyArticlesPortfolio");
const adminService = require("../src/services/bildazoAuthorLinkAdminService");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("Bildazo Writer Experience Phase 1 wiring", () => {
  it("mounts GET /api/freelancer/my-articles", () => {
    const app = read("src/app.js");
    assert.match(app, /freelancerMyArticlesRoutes/);
    const routes = read("src/routes/freelancerMyArticlesRoutes.js");
    assert.match(routes, /\/my-articles/);
    assert.match(routes, /requireFreelancer/);
  });

  it("Super Admin bildazo integration summary route exists", () => {
    const routes = read("src/routes/superAdminBildazoAuthorLinkRoutes.js");
    assert.match(routes, /bildazo-integration/);
    assert.match(read("src/services/superAdminFreelancerBildazoIntegrationService.js"), /publishedArticlesCount/);
  });

  it("article application context exposes writerProfileUrl", () => {
    const ctrl = read("src/controllers/marketplaceArticleApplicationsController.js");
    assert.match(ctrl, /writerProfileUrl/);
    assert.match(ctrl, /loadWriterProfileUrl/);
  });
});

describe("My Articles portfolio statuses", () => {
  it("maps all freelancer-visible states", () => {
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "pending",
        submissionStatus: null,
        bildazoPublishStatus: null,
      }),
      "awaiting_selection",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "selected",
        submissionStatus: null,
        bildazoPublishStatus: null,
      }),
      "awaiting_execution",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "selected",
        submissionStatus: "submitted",
      }),
      "under_review",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "selected",
        submissionStatus: "revision_requested",
      }),
      "revision_requested",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "approved",
        submissionStatus: "approved",
      }),
      "accepted",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "approved",
        submissionStatus: "approved",
        bildazoPublishStatus: "published",
      }),
      "published_on_bildazo",
    );
    assert.equal(
      portfolio.resolvePortfolioStatus({
        applicationStatus: "rejected",
        submissionStatus: null,
      }),
      "rejected",
    );
    assert.deepEqual(portfolio.PORTFOLIO_STATUS_KEYS, [
      "awaiting_selection",
      "awaiting_execution",
      "under_review",
      "revision_requested",
      "accepted",
      "published_on_bildazo",
      "rejected",
    ]);
    assert.equal(portfolio.portfolioStatusLabelAr("awaiting_selection"), "بانتظار الاختيار");
  });
});

describe("Live monitoring bildazo_article_url column", () => {
  it("reads bildazo_article_url not article_url", () => {
    const svc = read("src/services/freelancerActivationLiveArticleMonitoringService.js");
    assert.match(svc, /p\.bildazo_article_url/);
    assert.doesNotMatch(svc, /p\.article_url/);
  });
});

describe("Duplicate Bildazo writer identifier safeguard", () => {
  it("S2S persist paths call assertBildazoWriterIdentifierAvailableForFreelancer", () => {
    const svc = read("src/services/bildazoAuthorLinkService.js");
    assert.match(svc, /bildazoAuthorLinkIdentifierGuard/);
    assert.match(svc, /persistBildazoSyncOutcome/);
    assert.match(svc, /persistBildazoReplaceOutcome/);
  });

  it("admin manual link uses shared identifier guard", () => {
    const svc = read("src/services/bildazoAuthorLinkAdminService.js");
    assert.match(svc, /bildazoAuthorLinkIdentifierGuard/);
    assert.equal(typeof require("../src/utils/bildazoAuthorLinkIdentifierGuard").assertBildazoWriterIdentifierAvailableForFreelancer, "function");
  });
});

describe("Trial expiry does not remove Bildazo integration", () => {
  it("forfeiture service does not delete author links or publish records", () => {
    const svc = read("src/services/trialPendingEarningsForfeitureService.js");
    assert.doesNotMatch(svc, /DELETE FROM freelancer_bildazo_author_links/i);
    assert.doesNotMatch(svc, /DELETE FROM bildazo_article_publish_records/i);
  });
});
