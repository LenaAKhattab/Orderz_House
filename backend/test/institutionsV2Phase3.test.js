/**
 * Institutions V2 Phase 3 — source guards (no DB required).
 * Run: node --test test/institutionsV2Phase3.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/institutions_v2_phase3_placeholder";
process.env.JWT_SECRET = process.env.JWT_SECRET || "institutions-v2-phase3-secret";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("Phase3 article settlement isolation", () => {
  const apps = read("src/services/marketplaceArticleApplicationsService.js");
  const ctrl = read("src/controllers/institutionalStorageController.js");

  it("defines SETTLEMENT_MODES and workflow_only finalize", () => {
    assert.match(apps, /SETTLEMENT_MODES/);
    assert.match(apps, /WORKFLOW_ONLY:\s*"workflow_only"/);
    assert.match(apps, /MARKETPLACE:\s*"marketplace"/);
    assert.match(apps, /finalizeArticleApplicationWorkflowOnly/);
    assert.match(apps, /resolveSettlementModeForApplication/);
    assert.match(apps, /visibility_scope.*institution/);
  });

  it("institution delivery approve never trusts client skipSettlement", () => {
    assert.doesNotMatch(ctrl, /req\.body\?\.skipSettlement/);
    assert.doesNotMatch(ctrl, /req\.body\?\.workflowOnly/);
    assert.match(ctrl, /SETTLEMENT_MODES\.WORKFLOW_ONLY/);
    assert.match(ctrl, /financialNote: "institution_article_workflow_only_no_settlement"/);
  });

  it("marketplace finalize still calls settlementService by default", () => {
    assert.match(apps, /settlementService\.finalizeArticleApproval/);
    assert.match(apps, /settlementMode: SETTLEMENT_MODES\.MARKETPLACE/);
  });
});

describe("Phase3 atomic institution article create", () => {
  const articles = read("src/services/marketplaceArticlesService.js");
  const work = read("src/services/institutionWorkService.js");

  it("createMarketplaceArticle accepts trusted options institutionId/visibilityScope", () => {
    assert.match(articles, /institutionId = null, visibilityScope = null/);
    assert.match(articles, /institution_id, visibility_scope/);
    assert.match(articles, /Never accept institutionId\/visibilityScope from untrusted payload/);
  });

  it("createInstitutionArticle does not create-then-patch", () => {
    assert.match(work, /visibilityScope:\s*"institution"/);
    assert.doesNotMatch(work, /UPDATE marketplace_articles[\s\S]*visibility_scope = 'institution'/);
  });
});

describe("Phase3 institution status + delete safety", () => {
  const work = read("src/services/institutionWorkService.js");
  const inst = read("src/services/institutionsService.js");

  it("blocks new work on inactive and frozen institutions", () => {
    assert.match(work, /INSTITUTION_INACTIVE/);
    assert.match(work, /INSTITUTION_FROZEN/);
  });

  it("soft-delete treats institution articles and direct orders as used", () => {
    assert.match(inst, /marketplace_articles WHERE institution_id/);
    assert.match(inst, /o\.institution_id = \$1/);
  });
});

describe("Phase3 fixed/take uses canonical claim gate", () => {
  it("claimPoolOrder gates institution visibility via membership", () => {
    const orders = read("src/services/ordersService.js");
    const stored = read("src/services/institutionalStoredOrdersService.js");
    assert.match(orders, /claimPoolOrder/);
    assert.match(orders, /assertUserCanViewInstitutionalOrder/);
    assert.match(stored, /o\.institution_id = ANY/);
    assert.match(stored, /userBelongsToAnyInstitution/);
  });
});
