const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculateCommissionMinor,
  calculateDiscountMinor,
  resolveAttributionSource,
  nextCommissionStatus,
  sumLedgerBuckets,
  assertWithdrawalAmount,
  uniquePaidReferralCount,
  validatePolicyDraft,
  policySnapshotUnchanged,
  isEligibleReferralRole,
  refundAdjustment,
  MIN_DISCOUNTED_CHARGE_MINOR,
} = require("../src/domain/referralPolicy");
const { signPayload, readCookieToken } = require("../src/services/referralCookie");

describe("referral policy", () => {
  before(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  });

  it("keeps a snapshotted percentage after a later fixed policy", () => {
    const v1 = { mode: "percentage", percentageBps: 1000 };
    const v2 = { mode: "fixed", fixedMinor: 5000 };
    const base = 80000;
    assert.equal(calculateCommissionMinor({ ...v1, baseMinor: base }), 8000);
    assert.equal(calculateCommissionMinor({ ...v2, baseMinor: base }), 5000);
    assert.equal(policySnapshotUnchanged(v1, { ...v1, calculationMode: "percentage", percentageBps: 1000, eligiblePaymentTypes: [], commissionHoldDays: 7, minimumWithdrawalMinor: 1, enabled: true }), false);
  });

  it("caps fixed commission at the payment base", () => {
    assert.equal(calculateCommissionMinor({ mode: "fixed", fixedMinor: 5000, baseMinor: 3000 }), 3000);
  });

  it("rejects invalid percentages and negatives", () => {
    assert.equal(calculateCommissionMinor({ mode: "percentage", percentageBps: 0, baseMinor: 1000 }), 0);
    assert.equal(calculateCommissionMinor({ mode: "percentage", percentageBps: 20000, baseMinor: 1000 }), 0);
    assert.equal(calculateCommissionMinor({ mode: "fixed", fixedMinor: -1, baseMinor: 1000 }), 0);
    const invalid = validatePolicyDraft({
      calculationMode: "percentage",
      percentageBps: -5,
      commissionHoldDays: 7,
      minimumWithdrawalMinor: 1000,
      eligiblePaymentTypes: ["training_package_purchase"],
    });
    assert.equal(invalid.ok, false);
  });

  it("uses first valid referral and does not let a manual code overwrite it", () => {
    const now = Date.parse("2026-10-22T00:00:00Z");
    const cookie = { code: "abcd2345", expiresAt: "2026-11-21T00:00:00Z", visitId: "v1" };
    const chosen = resolveAttributionSource({ cookie, manualCode: "ZZZZ2345", now });
    assert.equal(chosen.source, "link");
    assert.equal(chosen.code, "ABCD2345");
    assert.equal(chosen.ignoredManual, true);
  });

  it("accepts a manual code only when no live attribution exists", () => {
    const chosen = resolveAttributionSource({
      cookie: { code: "ABCD2345", expiresAt: "2020-01-01T00:00:00Z" },
      manualCode: "qwert234",
      now: Date.parse("2026-10-22T00:00:00Z"),
    });
    assert.equal(chosen.source, "manual");
    assert.equal(chosen.code, "QWERT234");
  });

  it("signs attribution cookies and rejects tampering", () => {
    const token = signPayload({ code: "ABCD2345", visitId: "v", expiresAt: "2026-12-01T00:00:00Z" });
    assert.equal(readCookieToken(token).code, "ABCD2345");
    assert.equal(readCookieToken(`${token}x`), null);
  });

  it("moves pending and available commissions to reversed, and keeps paid history", () => {
    assert.equal(nextCommissionStatus("pending", "refund"), "reversed");
    assert.equal(nextCommissionStatus("available", "refund"), "reversed");
    assert.equal(nextCommissionStatus("paid", "refund"), "paid");
    assert.equal(nextCommissionStatus("reversed", "refund"), "reversed");
  });

  it("reserves withdrawal balance once and restores it on rejection", () => {
    const reserved = sumLedgerBuckets([
      { bucket: "available", amountMinor: 10000 },
      { bucket: "available", amountMinor: -4000 },
      { bucket: "reserved", amountMinor: 4000 },
    ]);
    assert.equal(reserved.available, 6000);
    assert.equal(assertWithdrawalAmount(reserved.available, 7000, 1000).code, "INSUFFICIENT_AVAILABLE");
    const restored = sumLedgerBuckets([
      { bucket: "available", amountMinor: 10000 },
      { bucket: "available", amountMinor: -4000 },
      { bucket: "reserved", amountMinor: 4000 },
      { bucket: "reserved", amountMinor: -4000 },
      { bucket: "available", amountMinor: 4000 },
    ]);
    assert.equal(restored.available, 10000);
    assert.equal(restored.reserved, 0);
  });

  it("counts unique settled referrals once toward a bonus", () => {
    assert.equal(uniquePaidReferralCount(["b", "b", "c"]), 2);
    assert.equal(uniquePaidReferralCount(["b"]).valueOf() >= 10, false);
  });

  it("keeps referred-user discount separate and disabled by default", () => {
    assert.equal(calculateDiscountMinor({ enabled: false, mode: "percentage", percentageBps: 1000, baseMinor: 50000 }), 0);
    assert.equal(calculateDiscountMinor({ enabled: true, mode: "fixed", fixedMinor: 2000, baseMinor: 50000 }), 2000);
  });

  it("excludes administrative roles from referral ownership", () => {
    assert.equal(isEligibleReferralRole("client"), true);
    assert.equal(isEligibleReferralRole("freelancer"), true);
    assert.equal(isEligibleReferralRole("super_admin"), false);
    assert.equal(isEligibleReferralRole("admin"), false);
  });

  it("versions policy rows instead of mutating them", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../sql/migrations/204_referral_commissions.sql"), "utf8");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS referral_commission_policy_versions/);
    assert.match(sql, /UNIQUE \(payment_source_type, payment_source_id\)/);
    assert.match(sql, /referred_user_id BIGINT NOT NULL UNIQUE/);
    assert.match(sql, /referrer_user_id <> referred_user_id/);
    assert.match(sql, /UNIQUE \(rule_id, referrer_user_id\)/);
    assert.doesNotMatch(sql, /UPDATE referral_commission_policy_versions/);
    const webhook = fs.readFileSync(path.join(__dirname, "../src/controllers/stripeWebhookController.js"), "utf8");
    assert.match(webhook, /processCheckoutSession/);
    assert.doesNotMatch(
      fs.readFileSync(path.join(__dirname, "../src/services/referralPaymentBridge.js"), "utf8"),
      /req\.body\.paid/,
    );
  });

  it("computes referral discount in integer fils with safe limits", () => {
    // 10% of 50 JOD → 45 JOD charged.
    assert.equal(calculateDiscountMinor({ enabled: true, mode: "percentage", percentageBps: 1000, baseMinor: 50000 }), 5000);
    // Percentage above the 50% cap is refused.
    assert.equal(calculateDiscountMinor({ enabled: true, mode: "percentage", percentageBps: 6000, baseMinor: 50000 }), 0);
    // Fixed discount never reaches the full price; the charge keeps the minimum.
    assert.equal(
      calculateDiscountMinor({ enabled: true, mode: "fixed", fixedMinor: 90000, baseMinor: 35000 }),
      35000 - MIN_DISCOUNTED_CHARGE_MINOR,
    );
    // Stripe JOD step: rounded down to a multiple of 10 fils.
    assert.equal(calculateDiscountMinor({ enabled: true, mode: "percentage", percentageBps: 333, baseMinor: 35000 }) % 10, 0);
    assert.equal(Number.isInteger(calculateDiscountMinor({ enabled: true, mode: "percentage", percentageBps: 1250, baseMinor: 35000 })), true);
  });

  it("validates discount configuration and scope", () => {
    const base = {
      enabled: false,
      calculationMode: "percentage",
      percentageBps: 1000,
      commissionHoldDays: 7,
      minimumWithdrawalMinor: 10000,
      eligiblePaymentTypes: ["training_package_purchase"],
    };
    assert.equal(validatePolicyDraft({ ...base, discountEnabled: true, discountMode: "percentage", discountPercentageBps: 1000, discountPaymentTypes: [] }).ok, false);
    assert.equal(validatePolicyDraft({ ...base, discountEnabled: true, discountMode: "percentage", discountPercentageBps: 6000, discountPaymentTypes: ["training_package_purchase"] }).ok, false);
    assert.equal(validatePolicyDraft({ ...base, discountEnabled: true, discountMode: "fixed", discountFixedMinor: 2005, discountPaymentTypes: ["training_package_purchase"] }).ok, false);
    assert.equal(validatePolicyDraft({ ...base, discountEnabled: true, discountMode: "percentage", discountPercentageBps: 1000, discountPaymentTypes: ["client_order"] }).ok, false);
    assert.equal(validatePolicyDraft({ ...base, discountEnabled: true, discountMode: "percentage", discountPercentageBps: 1000, discountPaymentTypes: ["training_package_purchase"] }).ok, true);
    // Discount scope is part of the snapshot: changing only the scope creates a new version.
    const prev = { ...base, discountEnabled: true, discountMode: "percentage", discountPercentageBps: 1000, discountPaymentTypes: ["training_package_purchase"] };
    assert.equal(policySnapshotUnchanged(prev, { ...prev }), true);
    assert.equal(policySnapshotUnchanged(prev, { ...prev, discountPaymentTypes: ["training_package_purchase", "marketplace_membership_purchase"] }), false);
  });

  it("calculates commission on the net amount actually paid after discount", () => {
    const paid = 50000 - calculateDiscountMinor({ enabled: true, mode: "percentage", percentageBps: 1000, baseMinor: 50000 });
    assert.equal(paid, 45000);
    assert.equal(calculateCommissionMinor({ mode: "percentage", percentageBps: 1000, baseMinor: paid }), 4500);
  });

  it("recomputes the commission target on partial and full refunds", () => {
    const terms = { mode: "percentage", percentageBps: 1000, baseMinor: 50000, commissionMinor: 5000 };
    const partial = refundAdjustment({ ...terms, refundedBaseMinor: 20000, reversedMinor: 0 });
    assert.deepEqual(
      { target: partial.targetMinor, reverse: partial.reverseMinor, full: partial.fullyReversed },
      { target: 3000, reverse: 2000, full: false },
    );
    // A later full refund only posts the remaining delta.
    const full = refundAdjustment({ ...terms, refundedBaseMinor: 50000, reversedMinor: 2000 });
    assert.deepEqual({ target: full.targetMinor, reverse: full.reverseMinor, full: full.fullyReversed }, { target: 0, reverse: 3000, full: true });
    // Replaying the same cumulative refund posts nothing new.
    assert.equal(refundAdjustment({ ...terms, refundedBaseMinor: 20000, reversedMinor: 2000 }).reverseMinor, 0);
    // Fixed commission stays until the remaining base drops below it.
    const fixed = { mode: "fixed", fixedMinor: 5000, baseMinor: 50000, commissionMinor: 5000 };
    assert.equal(refundAdjustment({ ...fixed, refundedBaseMinor: 20000, reversedMinor: 0 }).reverseMinor, 0);
    assert.equal(refundAdjustment({ ...fixed, refundedBaseMinor: 47000, reversedMinor: 0 }).reverseMinor, 2000);
  });

  it("enforces final-completion constraints in migration 205", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../sql/migrations/205_referral_final_completion.sql"), "utf8");
    assert.match(sql, /BEFORE UPDATE OR DELETE ON referral_commission_policy_versions/);
    assert.match(sql, /referral_withdrawals_one_open_idx/);
    assert.match(sql, /discount_percentage_bps <= 5000/);
    assert.match(sql, /reversed_minor <= commission_minor/);
    assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN|DELETE FROM/i);
  });

  it("never creates commissions from client order payments or unrelated purposes", () => {
    const webhook = fs.readFileSync(path.join(__dirname, "../src/controllers/stripeWebhookController.js"), "utf8");
    const calls = webhook.match(/bridge\.processCheckoutSession\([^)]*\)/g) || [];
    assert.equal(calls.length, 2);
    assert.ok(calls.every((c) => /MARKETPLACE_MEMBERSHIP|TRAINING_PACKAGE/.test(c)));
  });
});
