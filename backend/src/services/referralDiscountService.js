const { calculateDiscountMinor } = require("../domain/referralPolicy");

/**
 * Server-side referral discount for an eligible platform purchase.
 * Uses the referred user's snapshotted policy version (never the current policy) and
 * applies once: the first confirmed discounted purchase is recorded in
 * referral_discount_redemptions and closes the offer.
 *
 * @returns {Promise<{ discountMinor: number, chargeMinor: number, policyVersionId: number|null }>}
 */
async function resolveReferralDiscount({ userId, paymentType, listAmountMinor }, client = require("../config/db").pool) {
  const list = Math.trunc(Number(listAmountMinor));
  const none = { discountMinor: 0, chargeMinor: list, policyVersionId: null };
  if (!Number(userId) || !Number.isInteger(list) || list <= 0) return none;
  const { rows } = await client.query(
    `SELECT r.id, r.policy_version_id, p.discount_enabled, p.discount_mode, p.discount_percentage_bps,
            p.discount_fixed_minor, p.discount_payment_types,
            EXISTS (SELECT 1 FROM referral_discount_redemptions d WHERE d.referred_user_id = r.referred_user_id) AS redeemed
       FROM user_referrals r
       JOIN referral_commission_policy_versions p ON p.id = r.policy_version_id
      WHERE r.referred_user_id = $1
      LIMIT 1`,
    [userId],
  );
  const row = rows[0];
  if (!row || !row.discount_enabled || row.redeemed) return none;
  if (!(row.discount_payment_types || []).includes(paymentType)) return none;
  const discountMinor = calculateDiscountMinor({
    enabled: true,
    mode: row.discount_mode,
    percentageBps: row.discount_percentage_bps,
    fixedMinor: row.discount_fixed_minor,
    baseMinor: list,
  });
  if (discountMinor <= 0) return none;
  return {
    discountMinor,
    chargeMinor: list - discountMinor,
    policyVersionId: Number(row.policy_version_id),
  };
}

module.exports = { resolveReferralDiscount };
