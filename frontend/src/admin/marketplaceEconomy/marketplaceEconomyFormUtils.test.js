/**
 * Marketplace Economy Settings — frontend form utils + page wiring.
 * Run: node --test src/admin/marketplaceEconomy/marketplaceEconomyFormUtils.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKETPLACE_ECONOMY_DEFAULT_FORM,
  settingsToFormState,
  validateMarketplaceEconomyForm,
  areEconomyEnginesDisabled,
} from "./marketplaceEconomyFormUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("marketplaceEconomyFormUtils defaults", () => {
  it("starts with engines OFF", () => {
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.workTokensEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.marketplaceCommissionEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.cashMembershipPaymentsEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.eliteEngineEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.verificationBonusesEnabled, false);
    assert.ok(areEconomyEnginesDisabled(MARKETPLACE_ECONOMY_DEFAULT_FORM));
  });

  it("maps API settings to form with decimal money", () => {
    const form = settingsToFormState({
      workTokenValueJod: 0.1,
      bidTokensPerOrderJod: 1,
      applicationTokenRefundPercentage: 70,
      platformCommissionPercentage: 30,
      cashProcessingFeeJod: 5,
      identityVerificationBonusEnabled: true,
      identityVerificationBonusTokens: 10,
      payoutMethodVerificationBonusEnabled: true,
      payoutMethodVerificationBonusTokens: 10,
      eliteDirectOrdersPerCycle: 1,
      eliteOfferDurationMinutes: 10,
      eliteCarryForwardEnabled: true,
      eliteCarryForwardDays: 7,
      eliteMaximumCarryForward: 1,
      eliteDeclinesAffectCarryForward: false,
      workTokensEnabled: false,
      marketplaceCommissionEnabled: false,
      cashMembershipPaymentsEnabled: false,
      eliteEngineEnabled: false,
      verificationBonusesEnabled: false,
    });
    assert.strictEqual(form.workTokenValueJod, "0.100");
    assert.strictEqual(form.cashProcessingFeeJod, "5.000");
    assert.strictEqual(form.applicationTokenRefundPercentage, "70");
  });
});

describe("validateMarketplaceEconomyForm", () => {
  it("accepts valid defaults", () => {
    const { ok, patch, errors } = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
    });
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(errors, {});
    assert.strictEqual(patch.workTokenValueJod, 0.1);
    assert.strictEqual(patch.platformCommissionPercentage, 30);
    assert.strictEqual(patch.workTokensEnabled, false);
  });

  it("rejects invalid percentage and money", () => {
    const badPct = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      platformCommissionPercentage: "150",
    });
    assert.strictEqual(badPct.ok, false);
    assert.ok(badPct.errors.platformCommissionPercentage);
    assert.strictEqual(badPct.patch, null);

    const badMoney = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      workTokenValueJod: "0",
    });
    assert.strictEqual(badMoney.ok, false);
    assert.ok(badMoney.errors.workTokenValueJod);
  });

  it("allows enabling flags in the form payload", () => {
    const { ok, patch } = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      workTokensEnabled: true,
    });
    assert.strictEqual(ok, true);
    assert.strictEqual(patch.workTokensEnabled, true);
  });
});

describe("SuperAdminMarketplaceEconomyPage wiring", () => {
  it("page renders sections, helpers, and domain warning", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx"),
      "utf8",
    );
    assert.match(page, /إعدادات اقتصاد العمل|Work economy settings/);
    assert.match(page, /باقات العمل/);
    assert.match(page, /الباقات الرئيسية/);
    assert.match(page, /باقات الصفحات/);
    assert.match(page, /القيمة المحاسبية لكل Work Token/);
    assert.match(page, /رسوم إدارية ثابتة لكل عملية دفع نقدي/);
    assert.match(page, /ترحيل استحقاق واحد/);
    assert.match(page, /oh-mes-section/);
    assert.match(page, /getMarketplaceEconomySettingsRequest/);
    assert.match(page, /updateMarketplaceEconomySettingsRequest/);
    assert.match(page, /validateMarketplaceEconomyForm/);
    assert.doesNotMatch(page, /listPublicPlansRequest|AdminPlanCard|fakeOrders/);
  });

  it("marketplace plans page links to economy settings", () => {
    const plans = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminMarketplacePlansPage.jsx"),
      "utf8",
    );
    assert.match(plans, /\/dashboard\/super-admin\/marketplace-economy/);
    assert.match(plans, /إعدادات اقتصاد العمل|Work economy settings/);
  });

  it("App route and nav are registered", () => {
    const app = fs.readFileSync(path.join(__dirname, "../../App.jsx"), "utf8");
    const nav = fs.readFileSync(path.join(__dirname, "../../constants/superAdminNav.js"), "utf8");
    assert.match(app, /marketplace-economy/);
    assert.match(app, /SuperAdminMarketplaceEconomyPage/);
    assert.match(nav, /marketplaceEconomy/);
    assert.match(nav, /marketplace-economy/);
  });

  it("CSS includes responsive breakpoint for mobile", () => {
    const css = fs.readFileSync(path.join(__dirname, "marketplace-economy-settings.css"), "utf8");
    assert.match(css, /@media \(max-width: 720px\)/);
    assert.match(css, /oh-mes-grid/);
  });
});
