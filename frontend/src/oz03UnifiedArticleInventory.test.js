/**
 * OZ03-P0 — frontend contracts for unified marketplace inventory release.
 * Run: node --test src/oz03UnifiedArticleInventory.test.js
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

describe("OZ03 Super Admin inventory/release UI", () => {
  it("only one add form; legacy activation form gated off", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /SHOW_LEGACY_ACTIVATION_INVENTORY_UI\s*=\s*false/);
    assert.match(hub, /MarketplaceArticlesAdminPanel inventoryHub/);
    assert.equal((hub.match(/MarketplaceArticlesAdminPanel inventoryHub/g) || []).length, 1);
    assert.match(hub, /articles-inventory-add-form/);
  });

  it("KPI inventory counts marketplace drafts; release uses draft batch API", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /listAdminMarketplaceArticlesRequest\(\{\s*status:\s*"draft"/);
    assert.match(hub, /draftMarketplaceInventory/);
    assert.match(hub, /releaseMarketplaceArticleDraftBatchRequest/);
    assert.match(hub, /تشغيل إنزال مقالات المخزون/);
    assert.match(hub, /لا توجد مقالات جاهزة للإنزال في مخزون المقالات/);
    assert.match(hub, /رصيد صندوق التمويل غير كافٍ لإنزال المقالات المطلوبة/);
    assert.match(hub, /onManualPublish[\s\S]*releaseMarketplaceArticleDraftBatchRequest/);
  });

  it("manual modal lists draft marketplace articles only", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /status\)\.toLowerCase\(\) === "draft"/);
    assert.match(hub, /inventory=\{draftMarketplaceInventory\}/);
    assert.match(hub, /articles-release-empty-inventory/);
  });

  it("api helpers expose marketplace draft release", () => {
    const api = read("services/api.js");
    assert.match(api, /releaseMarketplaceArticleDraftRequest/);
    assert.match(api, /releaseMarketplaceArticleDraftBatchRequest/);
    assert.match(api, /marketplace-articles\/.*\/release/);
    assert.match(api, /marketplace-articles\/release-batch/);
  });

  it("package requirements remain global on inventory panel", () => {
    const panel = read("components/admin/MarketplaceArticlesAdminPanel.jsx");
    assert.match(panel, /متطلبات الباقات/);
    assert.match(panel, /package-requirements-section/);
  });
});
