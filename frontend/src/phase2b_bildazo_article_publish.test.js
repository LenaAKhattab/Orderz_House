/**
 * Phase 2B — Bildazo accepted-article publish UI contracts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freelancerBildazoPublishCopy } from "./constants/bildazoArticlePublish.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("Phase 2B freelancer Bildazo publish copy", () => {
  it("shows published link and safe pending/review states", () => {
    const published = freelancerBildazoPublishCopy(
      { status: "published", articleUrl: "http://127.0.0.1:4001/articles/1" },
      false,
    );
    assert.equal(published.text, "تم نشر مقالك على Bildazo");
    assert.equal(published.url, "http://127.0.0.1:4001/articles/1");
    const pending = freelancerBildazoPublishCopy({ status: "pending" }, false);
    assert.match(pending.text, /جارٍ ربط النشر على Bildazo/);
    assert.equal(pending.url, null);
    const review = freelancerBildazoPublishCopy({ status: "needs_manual_review" }, false);
    assert.match(review.text, /يحتاج النشر على Bildazo إلى مراجعة/);
    const failed = freelancerBildazoPublishCopy({ status: "failed", lastError: "secret boom" }, false);
    assert.doesNotMatch(failed.text, /secret boom/);
  });
});

describe("Phase 2B UI surfaces", () => {
  it("freelancer detail shows publish status without password/secret", () => {
    const page = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(page, /freelancer-bildazo-publish-status/);
    assert.match(page, /freelancerBildazoPublishCopy/);
    assert.doesNotMatch(page, /type=["']password["']/);
    assert.doesNotMatch(page, /INTEGRATION_SECRET/);
    assert.doesNotMatch(page, /lastError/);
  });

  it("super admin applications panel shows status, url, retry, and finalize", () => {
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /admin-bildazo-publish-status/);
    assert.match(panel, /retryAdminArticleBildazoPublishRequest/);
    assert.match(panel, /finalizeAdminArticleApplicationRequest/);
    assert.match(panel, /admin-final-article-status/);
    assert.doesNotMatch(panel, /type=["']password["']/);
  });

  it("freelancer selected detail shows final article form and submitted state", () => {
    const page = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(page, /freelancer-final-article-form/);
    assert.match(page, /freelancer-final-article-status/);
    assert.match(page, /submitFreelancerFinalArticleManuscriptRequest/);
  });
});
