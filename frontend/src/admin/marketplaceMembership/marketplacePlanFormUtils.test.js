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
  getMarketplaceAdminMoveMeta,
  normalizeMarketplacePlanPayload,
  planToMarketplaceFormState,
  sortMarketplacePlansForAdmin,
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

  it("sorts admin cards visible first, hidden last, preserving sortOrder within groups", () => {
    const plans = [
      { id: 1, nameEn: "FREE", isActive: false, sortOrder: 0 },
      { id: 2, nameEn: "STARTER", isActive: true, sortOrder: 10 },
      { id: 3, nameEn: "PAY AS YOU WORK", isActive: false, sortOrder: 20 },
      { id: 4, nameEn: "SILVER", isActive: true, sortOrder: 30 },
      { id: 5, nameEn: "START", isActive: false, sortOrder: 40 },
      { id: 6, nameEn: "PRO", isActive: true, sortOrder: 50 },
      { id: 7, nameEn: "ACTIVE", isActive: false, sortOrder: 60 },
      { id: 8, nameEn: "ELITE", isActive: true, sortOrder: 70 },
    ];
    const ordered = sortMarketplacePlansForAdmin(plans);
    assert.deepStrictEqual(
      ordered.map((p) => p.nameEn),
      ["STARTER", "SILVER", "PRO", "ELITE", "FREE", "PAY AS YOU WORK", "START", "ACTIVE"],
    );
    assert.strictEqual(ordered.length, plans.length);
    assert.deepStrictEqual(
      new Set(ordered.map((p) => p.id)),
      new Set(plans.map((p) => p.id)),
    );
  });

  it("moves ↑ / ↓ only within the same visibility group and keeps stored public order otherwise", () => {
    const plans = [
      { id: 1, isActive: false, sortOrder: 0 },
      { id: 2, isActive: true, sortOrder: 10 },
      { id: 3, isActive: true, sortOrder: 20 },
      { id: 4, isActive: false, sortOrder: 30 },
    ];
    // Visible 2 then 3; hidden 1 then 4. Moving last visible down must not cross into hidden.
    assert.strictEqual(buildMarketplaceReorderIds(plans, 3, "down"), null);
    assert.strictEqual(getMarketplaceAdminMoveMeta(plans, 3).canMoveDown, false);
    // First hidden cannot move up into visible.
    assert.strictEqual(buildMarketplaceReorderIds(plans, 1, "up"), null);
    assert.strictEqual(getMarketplaceAdminMoveMeta(plans, 1).canMoveUp, false);
    // Swap the two visible plans in stored order without grouping hidden last.
    assert.deepStrictEqual(buildMarketplaceReorderIds(plans, 2, "down"), [1, 3, 2, 4]);
    // Swap the two hidden plans in stored order.
    assert.deepStrictEqual(buildMarketplaceReorderIds(plans, 1, "down"), [4, 2, 3, 1]);
  });

  it("regroups admin cards immediately when isActive is patched locally", () => {
    const plans = [
      { id: 1, nameEn: "FREE", isActive: false, sortOrder: 0 },
      { id: 2, nameEn: "STARTER", isActive: true, sortOrder: 10 },
      { id: 3, nameEn: "SILVER", isActive: true, sortOrder: 20 },
    ];
    assert.deepStrictEqual(
      sortMarketplacePlansForAdmin(plans).map((p) => p.nameEn),
      ["STARTER", "SILVER", "FREE"],
    );
    const afterHide = plans.map((p) => (p.id === 2 ? { ...p, isActive: false } : p));
    assert.deepStrictEqual(
      sortMarketplacePlansForAdmin(afterHide).map((p) => p.nameEn),
      ["SILVER", "FREE", "STARTER"],
    );
    const afterShow = plans.map((p) => (p.id === 1 ? { ...p, isActive: true } : p));
    assert.deepStrictEqual(
      sortMarketplacePlansForAdmin(afterShow).map((p) => p.nameEn),
      ["FREE", "STARTER", "SILVER"],
    );
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
    assert.match(page, /PlanCatalogActionToolbar/);
    assert.match(page, /PLAN_CATALOG\.MARKETPLACE_PLANS/);
    assert.doesNotMatch(page, /كل أقسام الباقات|All plan catalogs/);
    assert.match(page, /sortMarketplacePlansForAdmin/);
    assert.match(page, /getMarketplaceAdminMoveMeta/);
    assert.doesNotMatch(page, /listPublicMarketplaceMembershipPlansRequest/);
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
    assert.match(tabs, /orderPlanCatalogNav/);
    assert.match(shell, /DefaultPlanCatalogAdminProvider/);
    assert.doesNotMatch(hub, /listAdminMarketplaceMembershipPlansRequest/);
    const publicFetch = fs.readFileSync(
      path.join(__dirname, "../../lib/planCatalog/fetchPlansForCatalog.js"),
      "utf8",
    );
    assert.doesNotMatch(publicFetch, /sortMarketplacePlansForAdmin/);
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
