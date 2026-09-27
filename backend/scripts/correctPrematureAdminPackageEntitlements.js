/**
 * Read-only by default.
 * APPLY_CORRECTION=1 rewrites only drawer entitlements that have dates but no real first order.
 * Does not touch legacy dated assignments, payments, or rows that already have an accepted order.
 */
const { pool } = require("../src/config/db");
const { classifyPrematureAdminEntitlement, DRAWER_ENTITLEMENT_NOTE } = require("../src/utils/adminPackageEntitlement");

const REAL_ORDER_STATUSES = [
  "assigned",
  "in_progress",
  "pending_client_review",
  "completed",
  "cancelled",
];

async function loadCandidates() {
  const { rows } = await pool.query(
    `SELECT
       fs.id,
       fs.notes,
       fs.has_first_order,
       fs.first_order_id,
       fs.first_order_date,
       fs.actual_start_date,
       fs.expiry_date,
       fs.status,
       fs.source,
       fs.payment_status,
       fs.activation_status,
       fs.entitlement_duration_months,
       EXISTS (
         SELECT 1
           FROM legacy_freelancer_package_assignments a
          WHERE a.subscription_id = fs.id
       ) AS legacy_assignment,
       EXISTS (
         SELECT 1
           FROM orders o
          WHERE o.assigned_freelancer_id = fs.freelancer_user_id
            AND o.received_at IS NOT NULL
            AND o.order_status = ANY($1::text[])
       ) AS has_accepted_real_order
     FROM freelancer_subscriptions fs
     WHERE fs.is_current = TRUE
       AND fs.source = 'admin'
       AND COALESCE(fs.has_first_order, FALSE) = FALSE
       AND (fs.actual_start_date IS NOT NULL OR fs.expiry_date IS NOT NULL)`,
    [REAL_ORDER_STATUSES],
  );
  return rows.map((row) => ({
    id: String(row.id),
    notes: row.notes,
    has_first_order: row.has_first_order,
    first_order_id: row.first_order_id,
    actual_start_date: row.actual_start_date,
    expiry_date: row.expiry_date,
    entitlement_duration_months: row.entitlement_duration_months,
    legacyAssignment: row.legacy_assignment === true,
    hasAcceptedRealOrder: row.has_accepted_real_order === true,
    decision: classifyPrematureAdminEntitlement({
      notes: row.notes,
      has_first_order: row.has_first_order,
      first_order_id: row.first_order_id,
      actual_start_date: row.actual_start_date,
      expiry_date: row.expiry_date,
      entitlement_duration_months: row.entitlement_duration_months,
      legacyAssignment: row.legacy_assignment === true,
      hasAcceptedRealOrder: row.has_accepted_real_order === true,
    }),
  }));
}

async function main() {
  const rows = await loadCandidates();
  const correct = rows.filter((row) => row.decision.action === "correct");
  const skipped = rows.filter((row) => row.decision.action !== "correct");
  const summary = {
    datedAdminWithoutFirstOrder: rows.length,
    safeToCorrect: correct.length,
    skipped: skipped.map((row) => ({ id: row.id, reason: row.decision.reason })),
    corrections: correct.map((row) => ({
      id: row.id,
      durationMonths: row.decision.entitlement_duration_months,
    })),
  };
  console.log(JSON.stringify(summary));

  if (process.env.APPLY_CORRECTION !== "1") {
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of correct) {
      const decision = row.decision;
      const { rowCount } = await client.query(
        `UPDATE freelancer_subscriptions
         SET status = 'assigned_not_started',
             has_first_order = FALSE,
             first_order_date = NULL,
             actual_start_date = NULL,
             expiry_date = NULL,
             entitlement_duration_months = $2,
             updated_at = NOW()
         WHERE id = $1
           AND is_current = TRUE
           AND COALESCE(has_first_order, FALSE) = FALSE
           AND first_order_id IS NULL
           AND notes LIKE ('%' || $3 || '%')
           AND NOT EXISTS (
             SELECT 1 FROM legacy_freelancer_package_assignments a WHERE a.subscription_id = freelancer_subscriptions.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM orders o
              WHERE o.assigned_freelancer_id = freelancer_subscriptions.freelancer_user_id
                AND o.received_at IS NOT NULL
                AND o.order_status = ANY($4::text[])
           )`,
        [Number(row.id), decision.entitlement_duration_months, DRAWER_ENTITLEMENT_NOTE, REAL_ORDER_STATUSES],
      );
      if (rowCount !== 1) {
        throw new Error(`correction_mismatch:${row.id}`);
      }
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ applied: correct.length }));
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
