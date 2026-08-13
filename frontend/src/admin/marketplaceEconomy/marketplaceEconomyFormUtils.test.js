/**
 * Marketplace Economy form utils — Phase B7A (WT / legacy auction locked off).
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
  it("starts with all engines OFF including Priority Bid and fairness", () => {
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.workTokensEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.priorityBiddingEnabled, false);
    assert.strictEqual(MARKETPLACE_ECONOMY_DEFAULT_FORM.fairWorkDistributionEnabled, false);
    assert.strictEqual(
      MARKETPLACE_ECONOMY_DEFAULT_FORM.priorityBidAssignmentStrategy,
      "HIGHEST_TOKEN_ONLY",
    );
    assert.ok(areEconomyEnginesDisabled(MARKETPLACE_ECONOMY_DEFAULT_FORM));
  });

  it("maps renamed normal-application fields and Priority Bid settings", () => {
    const form = settingsToFormState({
      workTokenValueJod: 0.1,
      normalApplicationTokensPerOrderJod: 1,
      normalApplicationTokenRefundPercentage: 100,
      platformCommissionPercentage: 30,
      cashProcessingFeeJod: 5,
      priorityBiddingEnabled: false,
      priorityBidDurationMinutes: 30,
      priorityBidMinimumTokens: 1,
      priorityBidMaximumTokens: null,
      priorityBidAssignmentStrategy: "HIGHEST_TOKEN_ONLY",
      fairWorkDistributionEnabled: false,
      assignmentStrategy: "HIGHEST_TOKEN_ONLY",
      fairnessWeight: 0,
      tokenWeight: 100,
      workTokensEnabled: false,
      marketplaceCommissionEnabled: false,
      cashMembershipPaymentsEnabled: false,
      eliteEngineEnabled: false,
      verificationBonusesEnabled: false,
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
      priorityBidShowHighest: true,
      priorityBidShowPosition: false,
      priorityBidAllowIncrease: true,
      priorityBidAllowDecrease: false,
      priorityBidAllowWithdrawal: false,
      priorityBidWithdrawalReleasesTokens: true,
      priorityBidWithdrawalReturnsUse: false,
      priorityBidReturnUseOnOrderCancel: true,
      priorityBidAutoAssignmentEnabled: true,
      performanceWeight: 0,
      recencyWeight: 0,
      workloadWeight: 0,
      eligibleLossPriorityEffect: "INCREASE_PRIORITY",
      awardResetPolicy: "RESET_TO_ZERO",
      declinePriorityEffect: "NO_BOOST",
      freelancerCancelPriorityEffect: "NO_BOOST",
    });
    assert.strictEqual(form.normalApplicationTokensPerOrderJod, "1.000");
    assert.strictEqual(form.priorityBidDurationMinutes, "30");
    assert.strictEqual(form.priorityBidAssignmentStrategy, "HIGHEST_TOKEN_ONLY");
  });
});

describe("validateMarketplaceEconomyForm", () => {
  it("accepts valid defaults and forces deprecated engines OFF", () => {
    const { ok, patch } = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      workTokensEnabled: true,
      priorityBiddingEnabled: true,
    });
    assert.strictEqual(ok, true);
    assert.strictEqual(patch.workTokensEnabled, false);
    assert.strictEqual(patch.priorityBiddingEnabled, false);
    assert.strictEqual(patch.priorityApplicationBoostEnabled, false);
    assert.strictEqual(patch.bidCreditsEnabled, false);
    assert.strictEqual(patch.verificationBonusesEnabled, false);
    assert.ok(!Object.prototype.hasOwnProperty.call(patch, "identityVerificationBonusTokens"));
    assert.ok(!Object.prototype.hasOwnProperty.call(patch, "workTokenValueJod"));
    assert.ok(!Object.prototype.hasOwnProperty.call(patch, "priorityBidDurationMinutes"));
    assert.ok(!Object.prototype.hasOwnProperty.call(patch, "priorityBidAssignmentStrategy"));
  });

  it("rejects invalid Fair assignment strategy HYBRID", () => {
    const bad = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      assignmentStrategy: "HYBRID",
    });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.errors.assignmentStrategy);
  });
});

describe("SuperAdminMarketplaceEconomyPage wiring", () => {
  it("locks Work Tokens + legacy auction as DEPRECATED; keeps Bid engines", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx"),
      "utf8",
    );
    assert.match(page, /Work Tokens engine — DEPRECATED/);
    assert.match(page, /Legacy Priority Auction — DEPRECATED/);
    assert.match(page, /locked OFF/);
    assert.match(page, /Priority Application Boost/);
    assert.match(page, /Enable Bid Credits engine/);
    assert.match(page, /Fair Work Distribution|التوزيع العادل/);
    assert.doesNotMatch(page, /id="mes-token-value"/);
    assert.doesNotMatch(page, /id="mes-pb-duration"/);
    assert.doesNotMatch(page, /id="mes-normal-refund"/);
    assert.doesNotMatch(page, /Enable Work Tokens engine \(wallet\/ledger\)/);
    assert.match(page, /Verification Work Token bonuses — DEPRECATED/);
    assert.doesNotMatch(page, /id="mes-id-bonus"/);
    assert.doesNotMatch(page, /id="mes-payout-bonus"/);
    assert.doesNotMatch(page, /Enable verification bonuses engine/);
  });
});
