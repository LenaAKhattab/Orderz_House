/**
 * Institutions V2 Phase 2 — source guards (no DB required).
 * Run: node --test test/institutionsV2Phase2.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/institutions_v2_phase2_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "institutions-v2-phase2-secret";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("migrations 193/194 institution work relation", () => {
  it("193 adds nullable orders.institution_id with deterministic sole-storage backfill", () => {
    const sql = read("sql/migrations/193_orders_institution_id.sql");
    assert.match(sql, /ADD COLUMN IF NOT EXISTS institution_id BIGINT NULL/);
    assert.match(sql, /REFERENCES institutions\(id\) ON DELETE SET NULL/);
    assert.match(sql, /HAVING COUNT\(\*\) = 1/);
    assert.match(sql, /193_orders_institution_id/);
    assert.doesNotMatch(sql, /^\s*DROP TABLE\b/im);
  });

  it("194 adds marketplace_articles institution_id + visibility_scope", () => {
    const sql = read("sql/migrations/194_marketplace_articles_institution.sql");
    assert.match(sql, /marketplace_articles/);
    assert.match(sql, /institution_id/);
    assert.match(sql, /visibility_scope/);
    assert.match(sql, /CHECK \(visibility_scope IN \('public', 'institution'\)\)/);
    assert.match(sql, /194_marketplace_articles_institution/);
  });
});

describe("institutionWorkService canonical reuse", () => {
  const src = read("src/services/institutionWorkService.js");

  it("creates orders via createInternalOrder with institution visibility", () => {
    assert.match(src, /createInternalOrder/);
    assert.match(src, /visibilityScope:\s*"institution"/);
    assert.match(src, /institutionId/);
    assert.match(src, /approveInternalPricedBidAdmin/);
    assert.match(src, /adminApproveInternalDelivery/);
    assert.match(src, /adminRequestInternalDeliveryRevision/);
    assert.doesNotMatch(src, /institution_orders/);
    assert.doesNotMatch(src, /CREATE TABLE/);
  });

  it("creates articles via createMarketplaceArticle atomically", () => {
    assert.match(src, /createMarketplaceArticle/);
    assert.match(src, /visibilityScope:\s*"institution"/);
    assert.doesNotMatch(src, /institution_articles/);
    assert.doesNotMatch(src, /UPDATE marketplace_articles[\s\S]{0,200}visibility_scope = 'institution'/);
  });

  it("does not invent payment checkout or wallet mutations", () => {
    assert.doesNotMatch(src, /createCheckout/i);
    assert.doesNotMatch(src, /walletService/i);
    assert.doesNotMatch(src, /stripeCheckoutService/i);
  });
});

describe("visibility + pool", () => {
  it("pool and access include direct institution_id", () => {
    const stored = read("src/services/institutionalStoredOrdersService.js");
    assert.match(stored, /o\.institution_id = ANY/);
    assert.match(stored, /resolveSoleInstitutionIdForStorage/);
    assert.match(stored, /missing_institution_link/);
  });

  it("createInternalOrder persists institution_id", () => {
    const orders = read("src/services/ordersService.js");
    assert.match(orders, /institution_id/);
    assert.match(orders, /options\.institutionId/);
  });

  it("public article list excludes institution scope", () => {
    const articles = read("src/services/marketplaceArticlesService.js");
    assert.match(articles, /COALESCE\(a\.visibility_scope, 'public'\) = 'public'/);
    const ctrl = read("src/controllers/marketplaceArticlesController.js");
    assert.match(ctrl, /visibilityScope.*institution/);
  });
});

describe("routes", () => {
  it("wires institution work create/get/applicants/delivery", () => {
    const routes = read("src/routes/institutionalStorageRoutes.js");
    assert.match(routes, /\/institutions\/:id\/work/);
    assert.match(routes, /applicants\/:applicantId\/accept/);
    assert.match(routes, /delivery\/approve/);
    assert.match(routes, /delivery\/revision/);
    const ctrl = read("src/controllers/institutionalStorageController.js");
    assert.match(ctrl, /createInstitutionWork/);
    assert.match(ctrl, /acceptInstitutionWorkApplicant/);
    assert.match(ctrl, /approveInstitutionWorkDelivery/);
  });
});
