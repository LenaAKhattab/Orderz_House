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

async function cancelOwnWithdrawal(userId, withdrawalId) {
  return reviewWithdrawal({ withdrawalId, adminId: null, action: "cancel", userId });
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
    const open = await db.query(
      `SELECT 1 FROM referral_withdrawal_requests WHERE user_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
      [userId],
    );
    if (open.rows[0]) {
      const error = new Error("withdrawal_already_open");
      error.publicCode = "WITHDRAWAL_ALREADY_OPEN";
      error.status = 409;
      throw error;
    }
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
    if (error?.code === "23505") {
      error.publicCode = "WITHDRAWAL_ALREADY_OPEN";
      error.status = 409;
    }
    throw error;
  } finally {
    db.release();
  }
}

async function reviewWithdrawal({ withdrawalId, adminId, action, payoutReference, note, userId = null }) {
  const reference = String(payoutReference || "").trim().slice(0, 200);
  const cleanNote = note == null ? null : String(note).trim().slice(0, 2000) || null;
  if (action === "paid" && !reference) {
    const error = new Error("payout_reference_required");
    error.status = 400;
    error.publicCode = "PAYOUT_REFERENCE_REQUIRED";
    throw error;
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows } = await db.query(
      `SELECT * FROM referral_withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [withdrawalId],
    );
    const row = rows[0];
    if (!row || (userId != null && Number(row.user_id) !== Number(userId))) {
      const error = new Error("not_found");
      error.status = 404;
      error.publicCode = "NOT_FOUND";
      throw error;
    }
    if (action === "approve" && userId == null && row.status === "pending") {
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = 'approved', reviewed_by_admin_id = $2, reviewed_at = NOW(), admin_note = COALESCE($3, admin_note)
          WHERE id = $1`,
        [withdrawalId, adminId, cleanNote],
      );
    } else if (
      (action === "reject" || action === "cancel") &&
      (userId != null ? row.status === "pending" : ["pending", "approved"].includes(row.status))
    ) {
      const next = action === "reject" ? "rejected" : "cancelled";
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = $2, reviewed_by_admin_id = $3, reviewed_at = NOW(), admin_note = COALESCE($4, admin_note),
                cancelled_by_user = $5
          WHERE id = $1`,
        [withdrawalId, next, adminId, cleanNote, userId != null],
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
    } else if (action === "paid" && userId == null && ["pending", "approved"].includes(row.status)) {
      await db.query(
        `UPDATE referral_withdrawal_requests
            SET status = 'paid', reviewed_by_admin_id = $2, reviewed_at = NOW(), paid_at = NOW(),
                payout_reference = $3, admin_note = COALESCE($4, admin_note)
          WHERE id = $1`,
        [withdrawalId, adminId, reference, cleanNote],
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
      [
        adminId,
        userId != null ? "user_cancel" : action,
        String(withdrawalId),
        JSON.stringify({
          payoutReference: reference || null,
          note: cleanNote,
          fromStatus: row.status,
          amountMinor: Number(row.amount_minor),
          userId: Number(row.user_id),
        }),
      ],
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
  cancelOwnWithdrawal,
};
