const { pool } = require("../config/db");
const { assertWithdrawalAmount } = require("../domain/referralPolicy");
const { getCurrentPolicy } = require("./referralPolicyService");
const { promoteMaturedCommissions } = require("./referralCommissionService");

async function availableMinor(client, userId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(amount_minor), 0)::bigint AS n
       FROM referral_wallet_ledger
      WHERE user_id = $1 AND bucket = 'available'`,
    [userId],
  );
  return Number(rows[0]?.n || 0);
}

async function requestWithdrawal(userId, amountMinor) {
  const policy = await getCurrentPolicy();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`SELECT pg_advisory_xact_lock($1::bigint)`, [Number(userId)]);
    const active = await db.query(`SELECT is_active FROM users WHERE id = $1`, [userId]);
    if (active.rows[0] && active.rows[0].is_active === false) {
      const error = new Error("account_inactive");
      error.publicCode = "ACCOUNT_DISABLED";
      error.status = 403;
      throw error;
    }
    await promoteMaturedCommissions(db, userId);
    const available = await availableMinor(db, userId);
    const check = assertWithdrawalAmount(available, amountMinor, policy?.minimumWithdrawalMinor || 0);
    if (!check.ok) {
      const error = new Error(check.code);
      error.publicCode = check.code;
      error.status = 400;
      throw error;
    }
    const amount = Math.trunc(Number(amountMinor));
    const inserted = await db.query(
      `INSERT INTO referral_withdrawal_requests (user_id, amount_minor, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [userId, amount],
    );
    const withdrawal = inserted.rows[0];
    await db.query(
      `INSERT INTO referral_wallet_ledger (
         user_id, event_type, bucket, amount_minor, withdrawal_id, idempotency_key
       ) VALUES
         ($1, 'withdrawal_requested', 'available', $2, $3, $4),
         ($1, 'withdrawal_requested', 'reserved', $5, $3, $6)`,
      [
        userId,
        -amount,
        withdrawal.id,
        `withdraw-available:${withdrawal.id}`,
        amount,
        `withdraw-reserved:${withdrawal.id}`,
      ],
    );
    await db.query("COMMIT");
    return withdrawal;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function reviewWithdrawal({ withdrawalId, adminId, action, payoutReference, note }) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT * FROM referral_withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [withdrawalId],
    );
    const row = rows[0];
    if (!row) {
      const error = new Error("not_found");
      error.status = 404;
      error.publicCode = "NOT_FOUND";
      throw error;
    }
    if (action === "approve" && row.status === "pending") {
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = 'approved', reviewed_by_admin_id = $2, reviewed_at = NOW(), admin_note = COALESCE($3, admin_note)
          WHERE id = $1`,
        [withdrawalId, adminId, note || null],
      );
    } else if ((action === "reject" || action === "cancel") && ["pending", "approved"].includes(row.status)) {
      const next = action === "reject" ? "rejected" : "cancelled";
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = $2, reviewed_by_admin_id = $3, reviewed_at = NOW(), admin_note = COALESCE($4, admin_note)
          WHERE id = $1`,
        [withdrawalId, next, adminId, note || null],
      );
      await db.query(
        `INSERT INTO referral_wallet_ledger (
           user_id, event_type, bucket, amount_minor, withdrawal_id, idempotency_key
         ) VALUES
           ($1, 'withdrawal_restored', 'reserved', $2, $3, $4),
           ($1, 'withdrawal_restored', 'available', $5, $3, $6)`,
        [
          row.user_id,
          -Number(row.amount_minor),
          row.id,
          `withdraw-restore-reserved:${row.id}`,
          Number(row.amount_minor),
          `withdraw-restore-available:${row.id}`,
        ],
      );
    } else if (action === "paid" && ["pending", "approved"].includes(row.status)) {
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = 'paid', reviewed_by_admin_id = $2, reviewed_at = NOW(), paid_at = NOW(),
                payout_reference = $3, admin_note = COALESCE($4, admin_note)
          WHERE id = $1`,
        [withdrawalId, adminId, payoutReference || null, note || null],
      );
      await db.query(
        `INSERT INTO referral_wallet_ledger (
           user_id, event_type, bucket, amount_minor, withdrawal_id, idempotency_key
         ) VALUES
           ($1, 'withdrawal_paid', 'reserved', $2, $3, $4),
           ($1, 'withdrawal_paid', 'paid', $5, $3, $6)`,
        [
          row.user_id,
          -Number(row.amount_minor),
          row.id,
          `withdraw-paid-reserved:${row.id}`,
          Number(row.amount_minor),
          `withdraw-paid-credit:${row.id}`,
        ],
      );
    } else {
      const error = new Error("invalid_transition");
      error.status = 409;
      error.publicCode = "INVALID_WITHDRAWAL_STATE";
      throw error;
    }
    await db.query(
      `INSERT INTO referral_admin_audit (admin_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'referral_withdrawal', $3, $4::jsonb)`,
      [adminId, action, String(withdrawalId), JSON.stringify({ payoutReference: payoutReference || null })],
    );
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

module.exports = {
  availableMinor,
  requestWithdrawal,
  reviewWithdrawal,
};
