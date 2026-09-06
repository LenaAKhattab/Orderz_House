/**
 * OZ05 frontend — unified inventory bid settings fields.
 * Run: node --test src/oz05ArticleBidCollectionSettings.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("OZ05 unified inventory form fields", () => {
  it("shows min applicants, duration, and refund/recycle hint", () => {
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(modal, /الحد الأدنى من المتقدمين/);
    assert.match(modal, /مدة استقبال التقديمات/);
    assert.match(modal, /ARTICLE_OZ05_REFUND_RECYCLE_HINT_AR/);
    assert.match(utils, /يعود إلى المخزون ويتم إرجاع مبلغ التمويل/);
    assert.match(modal, /article-form-required-bid-count/);
    assert.match(modal, /article-form-bid-collection-duration/);
    assert.match(modal, /article-form-oz05-refund-hint/);
  });

  it("keeps level/value/words/refs inputs hidden in inventorySimplified", () => {
    const modal = read("admin/marketplaceArticles/MarketplaceArticleFormModal.jsx");
    // Inventory block must not reintroduce these labels inside inventorySimplified section.
    const oz05Block = modal.slice(
      modal.indexOf("article-form-oz05-bid-settings"),
      modal.indexOf("{!inventorySimplified"),
    );
    assert.doesNotMatch(oz05Block, /مستوى المقال/);
    assert.doesNotMatch(oz05Block, /عدد الكلمات المطلوب/);
    assert.doesNotMatch(oz05Block, /عدد المراجع المطلوب/);
    assert.match(modal, /inventorySimplified/);
  });

  it("payload includes bid settings fields", () => {
    const utils = read("admin/marketplaceArticles/marketplaceArticleFormUtils.js");
    assert.match(utils, /bidCollectionDurationHours/);
    assert.match(utils, /ARTICLE_OZ05_REFUND_RECYCLE_HINT_AR/);
    assert.match(utils, /ARTICLE_BID_COLLECTION_DURATION_PRESETS/);
  });
});
