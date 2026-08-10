/**
 * Marketplace Economy form utils + wiring after Priority Bid / Fairness update.
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
      normalApplicationTokenRefundPercentage: 70,
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
  it("accepts valid defaults", () => {
    const { ok, patch } = validateMarketplaceEconomyForm({ ...MARKETPLACE_ECONOMY_DEFAULT_FORM });
    assert.strictEqual(ok, true);
    assert.strictEqual(patch.normalApplicationTokenRefundPercentage, 70);
    assert.strictEqual(patch.priorityBidAssignmentStrategy, "HIGHEST_TOKEN_ONLY");
    assert.strictEqual(patch.priorityBiddingEnabled, false);
  });

  it("rejects invalid Priority Bid duration", () => {
    const bad = validateMarketplaceEconomyForm({
      ...MARKETPLACE_ECONOMY_DEFAULT_FORM,
      priorityBidDurationMinutes: "0",
    });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.errors.priorityBidDurationMinutes);
  });
});

describe("SuperAdminMarketplaceEconomyPage wiring", () => {
  it("documents Priority Bid vs normal application separation in UI", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx"),
      "utf8",
    );
    assert.match(page, /Priority Bid/);
    assert.match(page, /HIGHEST_TOKEN_ONLY/);
    assert.match(page, /normalApplicationTokensPerOrderJod/);
    assert.match(page, /100%|يُحرَّر دائماً 100%/);
    assert.match(page, /Fair Work Distribution|التوزيع العادل/);
    assert.doesNotMatch(page, /bidTokensPerOrderJod/);
  });
});
