/**
 * Marketplace Membership Phase 1 — frontend form utils + page wiring guards.
 * Run: node --test src/admin/marketplaceMembership/marketplacePlanFormUtils.test.js
 *      node --test src/pages/dashboard/superAdminMarketplacePlansPage.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMarketplaceReorderIds,
  formatMarketplaceAccessLabel,
  getInitialMarketplacePlanFormState,
  normalizeMarketplacePlanPayload,
  planToMarketplaceFormState,
  validateMarketplacePlanForm,
} from "./marketplacePlanFormUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("marketplacePlanFormUtils", () => {
  it("validates create form and unlimited access", () => {
    const base = getInitialMarketplacePlanFormState({
      tierCode: "pro",
      nameAr: "Pro",
      monthlyPriceJod: "14.99",
      maxRealOrderValueJod: "100",
    });
    assert.deepStrictEqual(validateMarketplacePlanForm(base, { isCreate: true }), {});

    const unlimited = {
      ...base,
      unlimitedRealOrderValue: true,
      maxRealOrderValueJod: "",
    };
    assert.deepStrictEqual(validateMarketplacePlanForm(unlimited, { isCreate: true }), {});

    const bad = validateMarketplacePlanForm(
      { ...base, tierCode: "Elite", monthlyPriceJod: "-1" },
      { isCreate: true },
    );
    assert.ok(bad.tierCode);
    assert.ok(bad.monthlyPriceJod);
  });

  it("normalizes payload with null max when unlimited", () => {
    const payload = normalizeMarketplacePlanPayload(
      getInitialMarketplacePlanFormState({
        tierCode: "elite",
        nameAr: "Elite",
        monthlyPriceJod: "49.99",
        unlimitedRealOrderValue: true,
        eliteDirectOrdersEnabled: true,
      }),
      { isCreate: true },
    );
    assert.ok(!Object.prototype.hasOwnProperty.call(payload, "includedTokensPerCycle"));
    assert.strictEqual(payload.tierCode, "elite");
    assert.strictEqual(payload.unlimitedRealOrderValue, true);
    assert.strictEqual(payload.maxRealOrderValueJod, null);
    assert.strictEqual(payload.eliteDirectOrdersEnabled, true);
  });

  it("formats unlimited access and reorders cards", () => {
    assert.match(formatMarketplaceAccessLabel({ unlimitedRealOrderValue: true }, false), /غير محدود/);
    const plans = [{ id: "1" }, { id: "2" }, { id: "3" }];
    assert.deepStrictEqual(buildMarketplaceReorderIds(plans, "2", "up"), ["2", "1", "3"]);
    assert.strictEqual(buildMarketplaceReorderIds(plans, "1", "up"), null);
  });

  it("round-trips plan → form", () => {
    const form = planToMarketplaceFormState({
      tierCode: "active",
      nameAr: "Active",
      nameEn: "Active",
      monthlyPriceJod: 44.99,
      maxRealOrderValueJod: 25,
      unlimitedRealOrderValue: false,
      includedTokensPerCycle: 220,
      monthlyBidAllowance: 30,
      articleAccessLevel: 3,
      cashAllowed: false,
      minimumCashMonths: 1,
      maximumPrepaidMonths: 1,
      eliteDirectOrdersEnabled: false,
      isActive: true,
      saleEnabled: false,
    });
    assert.strictEqual(form.tierCode, "active");
    assert.strictEqual(form.maxRealOrderValueJod, 25);
    // Phase B1: Work Token grants removed from active Membership UI payload.
    assert.ok(!Object.prototype.hasOwnProperty.call(form, "includedTokensPerCycle"));
    assert.strictEqual(form.monthlyBidAllowance, 30);
    assert.strictEqual(form.articleAccessLevel, 3);
  });

  it("rejects article access level outside 1..5", () => {
    const base = getInitialMarketplacePlanFormState({
      tierCode: "start",
      nameAr: "ابدأ",
      monthlyPriceJod: "24.99",
      maxRealOrderValueJod: "15",
      articleAccessLevel: "9",
    });
    const bad = validateMarketplacePlanForm(base, { isCreate: true });
    assert.ok(bad.articleAccessLevel);
  });
});

describe("SuperAdminMarketplacePlansPage wiring", () => {
  it("page and card exist and do not import legacy AdminPlanCard", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminMarketplacePlansPage.jsx"),
      "utf8",
    );
    const card = fs.readFileSync(
      path.join(__dirname, "MarketplaceMembershipPlanCard.jsx"),
      "utf8",
    );
    assert.match(page, /SECTION_COPY\.marketplace/);
    assert.match(page, /PlanCatalogAdminShell/);
    assert.match(page, /MarketplaceMembershipPlanCard/);
    assert.match(page, /MarketplaceMembershipPlanFormModal/);
    assert.match(page, /DefaultPlanCatalogControl/);
    assert.match(page, /PLAN_CATALOG\.MARKETPLACE_PLANS/);
    assert.doesNotMatch(page, /كل أقسام الباقات|All plan catalogs/);
    assert.doesNotMatch(page, /AdminPlanCard|orderzhousePlansCatalog/);
    assert.doesNotMatch(card, /from [\"'].*AdminPlanCard|orderzhousePlansCatalog/);
  });

  it("legacy plans hub shares catalog navigation without embedding marketplace CRUD", () => {
    const hub = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminPlansPage.jsx"),
      "utf8",
    );
    const nav = fs.readFileSync(path.join(__dirname, "../plans/planCatalogNav.js"), "utf8");
    const shell = fs.readFileSync(path.join(__dirname, "../plans/PlanCatalogAdminShell.jsx"), "utf8");
    const tabs = fs.readFileSync(path.join(__dirname, "../plans/PlanCatalogNavigation.jsx"), "utf8");
    assert.match(hub, /PlanCatalogAdminShell/);
    assert.match(nav, /\/dashboard\/super-admin\/marketplace-plans/);
    assert.match(nav, /PLAN_CATALOG_LABELS\[PLAN_CATALOG\.MARKETPLACE_PLANS\]/);
    assert.match(shell, /PlanCatalogNavigation/);
    assert.match(tabs, /PLAN_CATALOG_NAV/);
    assert.doesNotMatch(hub, /listAdminMarketplaceMembershipPlansRequest/);
  });

  it("App route and nav are registered", () => {
    const app = fs.readFileSync(path.join(__dirname, "../../App.jsx"), "utf8");
    const nav = fs.readFileSync(path.join(__dirname, "../../constants/superAdminNav.js"), "utf8");
    assert.match(app, /marketplace-plans/);
    assert.match(app, /SuperAdminMarketplacePlansPage/);
    assert.match(nav, /marketplacePlans/);
    assert.match(nav, /marketplace-plans/);
  });
});
