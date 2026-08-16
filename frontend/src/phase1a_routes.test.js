/**
 * Phase 1A — article/admin settings routes must render, not redirect away.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

describe("Phase 1A routes", () => {
  it("App.jsx mounts freelancer article pages instead of home redirects", () => {
    const src = fs.readFileSync(path.join(srcRoot, "App.jsx"), "utf8");
    assert.match(src, /path="\/dashboard\/freelancer\/articles"/);
    assert.match(src, /<FreelancerMarketplaceArticlesPage \/>/);
    assert.match(src, /path="\/dashboard\/freelancer\/articles\/:id"/);
    assert.match(src, /<FreelancerMarketplaceArticleDetailPage \/>/);
    assert.doesNotMatch(
      src,
      /path="\/dashboard\/freelancer\/articles"[\s\S]{0,280}Navigate to="\/dashboard\/freelancer"/,
    );
  });

  it("App.jsx mounts admin settings separately from super-admin settings", () => {
    const src = fs.readFileSync(path.join(srcRoot, "App.jsx"), "utf8");
    assert.match(src, /path="\/dashboard\/admin\/settings"/);
    assert.match(src, /<AdminSettingsPage \/>/);
    assert.match(src, /path="\/dashboard\/super-admin\/settings"/);
    assert.match(src, /<SuperAdminSettingsPage \/>/);
  });

  it("freelancer article UI has no admin fair-ranking / override controls", () => {
    const list = fs.readFileSync(
      path.join(srcRoot, "pages/dashboard/FreelancerMarketplaceArticlesPage.jsx"),
      "utf8",
    );
    const detail = fs.readFileSync(
      path.join(srcRoot, "pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx"),
      "utf8",
    );
    assert.doesNotMatch(list, /FairSelectionOverrideDialog|overrideReason|fairRanking/);
    assert.doesNotMatch(detail, /FairSelectionOverrideDialog|overrideReason|auto-assign/);
    assert.match(detail, /formatArticleBidCollectionLabel/);
    assert.match(list, /formatArticleBidCollectionLabel/);
  });

  it("does not lazy-export TrainingOrderRoundsPage; App keeps a Navigate alias", () => {
    const lazy = fs.readFileSync(path.join(srcRoot, "routes/lazyPages.js"), "utf8");
    const app = fs.readFileSync(path.join(srcRoot, "App.jsx"), "utf8");
    assert.doesNotMatch(lazy, /TrainingOrderRoundsPage/);
    assert.match(
      app,
      /path="rounds"[\s\S]{0,180}Navigate to="\/dashboard\/super-admin\/training-orders#round-history"/,
    );
    assert.match(
      app,
      /path="\/dashboard\/super-admin\/edit-website\/footer-app-downloads"[\s\S]{0,220}Navigate to="\/dashboard\/super-admin\/edit-website\/footer\/app-downloads"/,
    );
  });
});
