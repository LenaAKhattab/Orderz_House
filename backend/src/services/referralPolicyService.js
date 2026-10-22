const crypto = require("crypto");
const { pool } = require("../config/db");
const {
  CODE_ALPHABET,
  isEligibleReferralRole,
  validatePolicyDraft,
  policySnapshotUnchanged,
} = require("../domain/referralPolicy");

function mapPolicy(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    enabled: Boolean(row.enabled),
    calculationMode: row.calculation_mode,
    percentageBps: row.percentage_bps == null ? null : Number(row.percentage_bps),
    fixedAmountMinor: row.fixed_amount_minor == null ? null : Number(row.fixed_amount_minor),
    currency: row.currency,
    eligiblePaymentTypes: row.eligible_payment_types || [],
    commissionHoldDays: Number(row.commission_hold_days),
    minimumWithdrawalMinor: Number(row.minimum_withdrawal_minor),
    discountEnabled: Boolean(row.discount_enabled),
    discountMode: row.discount_mode,
    discountPercentageBps: row.discount_percentage_bps == null ? null : Number(row.discount_percentage_bps),
    discountFixedMinor: row.discount_fixed_minor == null ? null : Number(row.discount_fixed_minor),
    createdAt: row.created_at,
    createdByAdminId: row.created_by_admin_id == null ? null : Number(row.created_by_admin_id),
  };
}

async function getCurrentPolicy(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM referral_commission_policy_versions ORDER BY id DESC LIMIT 1`,
  );
  return mapPolicy(rows[0]);
}

async function listPolicyHistory(client = pool) {
  const { rows } = await client.query(
    `SELECT * FROM referral_commission_policy_versions ORDER BY id DESC`,
  );
  return rows.map(mapPolicy);
}

function randomCode() {
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

async function ensureReferralCode(userId, role, client = pool) {
  if (!isEligibleReferralRole(role)) return null;
  const existing = await client.query(`SELECT * FROM referral_codes WHERE user_id = $1`, [userId]);
  if (existing.rows[0]) return existing.rows[0];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    try {
      const inserted = await client.query(
        `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) RETURNING *`,
        [userId, code],
      );
      return inserted.rows[0];
    } catch (error) {
      if (error?.code !== "23505") throw error;
    }
  }
  throw new Error("referral_code_generation_failed");
}

async function regenerateReferralCode(userId, adminId, client = pool) {
  const code = randomCode();
  const { rows } = await client.query(
    `UPDATE referral_codes
        SET code = $2, updated_at = NOW(), regenerated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
    [userId, code],
  );
  if (!rows[0]) return null;
  await client.query(
    `INSERT INTO referral_admin_audit (admin_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'regenerate_code', 'referral_code', $2, $3::jsonb)`,
    [adminId, String(rows[0].id), JSON.stringify({ userId: Number(userId) })],
  );
  return rows[0];
}

async function createPolicyVersion(draft, adminId, client = pool) {
  const validation = validatePolicyDraft(draft);
  if (!validation.ok) {
    const error = new Error("invalid_referral_policy");
    error.publicCode = "REFERRAL_POLICY_INVALID";
    error.status = 400;
    error.details = validation.errors;
    throw error;
  }
  const current = await getCurrentPolicy(client);
  if (policySnapshotUnchanged(current, draft)) {
    const error = new Error("referral_policy_unchanged");
    error.publicCode = "REFERRAL_POLICY_UNCHANGED";
    error.status = 409;
    throw error;
  }
  const { rows } = await client.query(
    `INSERT INTO referral_commission_policy_versions (
       enabled, calculation_mode, percentage_bps, fixed_amount_minor, currency,
       eligible_payment_types, commission_hold_days, minimum_withdrawal_minor,
       discount_enabled, discount_mode, discount_percentage_bps, discount_fixed_minor,
       created_by_admin_id
     ) VALUES ($1,$2,$3,$4,'JOD',$5::text[],$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      Boolean(draft.enabled),
      draft.calculationMode,
      draft.calculationMode === "percentage" ? Math.trunc(draft.percentageBps) : null,
      draft.calculationMode === "fixed" ? Math.trunc(draft.fixedAmountMinor) : null,
      draft.eligiblePaymentTypes,
      Math.trunc(draft.commissionHoldDays),
      Math.trunc(draft.minimumWithdrawalMinor),
      Boolean(draft.discountEnabled),
      draft.discountEnabled ? draft.discountMode : null,
      draft.discountEnabled && draft.discountMode === "percentage" ? Math.trunc(draft.discountPercentageBps) : null,
      draft.discountEnabled && draft.discountMode === "fixed" ? Math.trunc(draft.discountFixedMinor) : null,
      adminId,
    ],
  );
  await client.query(
    `INSERT INTO referral_admin_audit (admin_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, 'create_policy_version', 'referral_policy', $2, $3::jsonb)`,
    [adminId, String(rows[0].id), JSON.stringify({ previousId: current?.id || null })],
  );
  return mapPolicy(rows[0]);
}

module.exports = {
  mapPolicy,
  getCurrentPolicy,
  listPolicyHistory,
  ensureReferralCode,
  regenerateReferralCode,
  createPolicyVersion,
};
