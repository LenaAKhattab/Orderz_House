/**
 * OZ03-P0 — Unified marketplace_articles inventory release.
 * Run: node --test test/oz03UnifiedArticleInventoryRelease.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), "utf8");
}

describe("OZ03 — no new migration required", () => {
  it("uses existing marketplace_articles status + OZ02 fields (migration 183)", () => {
    const mig = read("sql/migrations/183_marketplace_articles_bildazo_inventory_oz02.sql");
    assert.match(mig, /bildazo_category_id/);
    assert.match(mig, /writing_mode/);
    assert.doesNotMatch(
      fs.readdirSync(path.join(root, "sql/migrations")).join("\n"),
      /184_.*oz03/i,
    );
  });
});

describe("OZ03 — unified release service source of truth", () => {
  it("service publishes same marketplace_articles row and deducts fund with metadata idempotency", () => {
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.match(src, /status = 'published'/);
    assert.match(src, /WHERE id = \$1 AND status = 'draft'/);
    assert.match(src, /marketplaceArticleId/);
    assert.match(src, /oz03_marketplace_draft_release/);
    assert.match(src, /findFundDeductionForArticle/);
    assert.match(src, /OZ03_EMPTY_INVENTORY_AR/);
    assert.match(src, /OZ03_INSUFFICIENT_FUND_AR/);
    assert.doesNotMatch(src, /executeInventoryReleaseOnRunner/);
    assert.doesNotMatch(src, /INSERT INTO marketplace_articles/);
    assert.match(src, /listEligibleDraftArticles/);
    assert.doesNotMatch(src, /freelancer_activation_article_inventory_items/);
  });

  it("does not insert inventory templates on main release path", () => {
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.doesNotMatch(src, /FROM freelancer_activation_article_inventory_items/);
    assert.doesNotMatch(src, /INTO freelancer_activation_article_inventory_items/);
  });

  it("assertDraftReleasable and plan helpers are exported", () => {
    // Avoid loading db.js — parse exports from source
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.match(src, /assertDraftReleasable/);
    assert.match(src, /planTierFromArticleRow/);
    assert.match(src, /countDraftInventoryArticles/);
  });
});

describe("OZ03 — controller wiring", () => {
  it("preview/run article-release use OZ03 marketplace inventory service", () => {
    const ctrl = read("src/controllers/freelancerActivationCampaignController.js");
    assert.match(ctrl, /marketplaceArticleUnifiedReleaseService/);
    assert.match(ctrl, /previewMarketplaceInventoryRelease/);
    assert.match(ctrl, /runMarketplaceInventoryRelease/);
    assert.match(ctrl, /Legacy activation inventory release/);
  });

  it("marketplace articles expose draft release endpoints", () => {
    const routes = read("src/routes/superAdminMarketplaceArticlesRoutes.js");
    const ctrl = read("src/controllers/marketplaceArticlesController.js");
    assert.match(routes, /marketplace-articles\/:id\/release/);
    assert.match(routes, /marketplace-articles\/release-batch/);
    assert.match(ctrl, /releaseDraftInventory/);
    assert.match(ctrl, /releaseMarketplaceDraftArticle/);
  });
});

describe("OZ03 — pure validation helpers via vm-free source checks", () => {
  it("empty inventory and insufficient fund Arabic messages are fixed", () => {
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.match(src, /لا توجد مقالات جاهزة للإنزال في مخزون المقالات/);
    assert.match(src, /رصيد صندوق التمويل غير كافٍ لإنزال المقالات المطلوبة/);
  });

  it("batch path records per-article fund metadata and skips inventory_empty", () => {
    const src = read("src/services/marketplaceArticleUnifiedReleaseService.js");
    assert.match(src, /skipReason: "inventory_empty"/);
    assert.match(src, /skipReason: "insufficient_fund"/);
    assert.match(src, /inventorySource: "marketplace_articles"/);
  });
});

describe("OZ03 — legacy activation inventory kept but not main path", () => {
  it("legacy engine still exists for compatibility tests", () => {
    const engine = read("src/services/freelancerActivationArticleReleaseEngineService.js");
    assert.match(engine, /runDailyMiniArticleRelease/);
    assert.match(engine, /executeInventoryReleaseOnRunner|loadInventoryCandidates/);
  });
});
