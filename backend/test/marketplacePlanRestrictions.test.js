/**
 * Plan-level marketplace restrictions.
 * Run: node --test test/marketplacePlanRestrictions.test.js
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://127.0.0.1:5432/marketplace_plan_restrictions_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeScopes,
  scopesInclude,
  RESTRICTION_SCOPES,
} = require("../src/services/freelancerAccountRestrictionsService");
const {
  unionScopes,
  PLAN_RESTRICTION_TIER_CODES,
} = require("../src/services/marketplacePlanRestrictionsService");
const { AUDIT_ACTIONS } = require("../src/constants/freelancerAccountRestrictions");

const root = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("migration 202 plan restrictions", () => {
  it("creates marketplace_plan_restrictions without per-user fan-out", () => {
    const sql = read("sql/migrations/202_marketplace_plan_restrictions.sql");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS marketplace_plan_restrictions/);
    assert.match(sql, /marketplace_plan_id/);
    assert.match(sql, /hold_plan_restriction_id/);
    assert.match(sql, /mpr_one_active_per_plan_uidx/);
    assert.doesNotMatch(sql, /INSERT INTO freelancer_account_restrictions/);
  });
});

describe("effective scope union", () => {
  it("unions individual + plan scopes", () => {
    const u = unionScopes([["bids"], ["articles"]]);
    assert.deepEqual(u.sort(), ["articles", "bids"].sort());
  });

  it("ALL_MARKETPLACE collapses union", () => {
    const u = unionScopes([["bids"], [RESTRICTION_SCOPES.ALL_MARKETPLACE]]);
    assert.deepEqual(u, [RESTRICTION_SCOPES.ALL_MARKETPLACE]);
  });

  it("scopesInclude treats ALL as matching bids", () => {
    assert.equal(scopesInclude([RESTRICTION_SCOPES.ALL_MARKETPLACE], "bids"), true);
    assert.equal(scopesInclude(["articles"], "bids"), false);
  });
});

describe("wiring", () => {
  it("assertMarketplaceActionAllowedOrHeld loads plan inheritance", () => {
    const src = read("src/services/freelancerAccountRestrictionsService.js");
    assert.match(src, /getEffectiveFreelancerRestrictions/);
    assert.match(src, /marketplacePlanRestrictionsService/);
    assert.match(src, /primaryPlanRestriction/);
    assert.match(src, /inheritedPlanRestrictions/);
  });

  it("orders + articles write hold_plan_restriction_id", () => {
    const orders = read("src/services/ordersService.js");
    const articles = read("src/services/marketplaceArticleApplicationsService.js");
    assert.match(orders, /hold_plan_restriction_id/);
    assert.match(orders, /primaryPlanRestriction/);
    assert.match(articles, /hold_plan_restriction_id/);
  });

  it("super-admin plan routes require Super Admin", () => {
    const routes = read("src/routes/superAdminAccountRestrictionsRoutes.js");
    assert.match(routes, /\/account-restrictions\/plans/);
    assert.match(routes, /plan-restrictions\/:id\/revoke/);
    assert.match(routes, /requireSuperAdmin/);
  });

  it("audit actions include plan events", () => {
    assert.equal(AUDIT_ACTIONS.PLAN_RESTRICTION_CREATED, "plan_restriction_created");
    assert.equal(AUDIT_ACTIONS.PLAN_RESTRICTION_REVOKED, "plan_restriction_revoked");
  });

  it("canonical tiers are starter/silver/pro/elite", () => {
    assert.deepEqual([...PLAN_RESTRICTION_TIER_CODES], ["starter", "silver", "pro", "elite"]);
  });

  it("frontend primary tabs + plans panel exist", () => {
    const page = read("../frontend/src/pages/dashboard/SuperAdminAccountRestrictionsPage.jsx");
    const panel = read("../frontend/src/pages/dashboard/SuperAdminAccountRestrictionsPlansPanel.jsx");
    const ar = read("../frontend/src/locales/ar/accountRestrictions.json");
    assert.match(page, /primaryTabs/);
    assert.match(page, /SuperAdminAccountRestrictionsPlansPanel/);
    assert.match(panel, /listSuperAdminPlanRestrictionsRequest/);
    assert.match(panel, /impactConfirmBody/);
    assert.match(ar, /"المستخدمون"/);
    assert.match(ar, /"الباقات"/);
    assert.match(ar, /قيد موروث من الباقة/);
  });

  it("normalizeScopes still defaults to ALL_MARKETPLACE", () => {
    assert.deepEqual(normalizeScopes([]), [RESTRICTION_SCOPES.ALL_MARKETPLACE]);
  });
});
