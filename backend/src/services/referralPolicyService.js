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
    discountPaymentTypes: row.discount_payment_types || [],
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
    `SELECT p.*, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.family_name)), '') AS created_by_name,
            (SELECT COUNT(*)::int FROM user_referrals r WHERE r.policy_version_id = p.id) AS referral_count
       FROM referral_commission_policy_versions p
       LEFT JOIN users u ON u.id = p.created_by_admin_id
      ORDER BY p.id DESC`,
  );
  return rows.map((row) => ({
    ...mapPolicy(row),
    createdByName: row.created_by_name || null,
    referralCount: Number(row.referral_count || 0),
  }));
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
        `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING
         RETURNING *`,
        [userId, code],
      );
      if (inserted.rows[0]) return inserted.rows[0];
      // A concurrent request created this user's code first — return that one.
      const raced = await client.query(`SELECT * FROM referral_codes WHERE user_id = $1`, [userId]);
      if (raced.rows[0]) return raced.rows[0];
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
  if (client === pool) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(`SELECT pg_advisory_xact_lock(hashtext('referral_policy_versions'))`);
      const created = await createPolicyVersion(draft, adminId, db);
      await db.query("COMMIT");
      return created;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
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
       created_by_admin_id, discount_payment_types
     ) VALUES ($1,$2,$3,$4,'JOD',$5::text[],$6,$7,$8,$9,$10,$11,$12,$13::text[])
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
      draft.discountEnabled ? draft.discountPaymentTypes : [],
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
