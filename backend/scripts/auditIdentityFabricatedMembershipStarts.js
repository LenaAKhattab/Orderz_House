/**
 * Read-only unless APPLY_CORRECTION=1.
 * Clears fabricated has_first_order rows that have no canonical real order.
 * Does not touch legacy assignments, Stripe recurring rows, or real first orders.
 */
const { pool } = require("../src/config/db");
const {
  classifyFabricatedFirstOrderWithoutRealOrder,
  classifyPrematureAdminEntitlement,
} = require("../src/utils/adminPackageEntitlement");

const REAL_ORDER_STATUSES = [
  "assigned",
  "in_progress",
  "pending_client_review",
  "completed",
  "cancelled",
];

async function loadRows() {
  const { rows } = await pool.query(
    `SELECT
       fs.id,
       fs.notes,
       fs.has_first_order,
       fs.first_order_id,
       fs.actual_start_date,
       fs.expiry_date,
       fs.entitlement_duration_months,
       fs.stripe_subscription_id,
       fs.source,
       EXISTS (
         SELECT 1 FROM legacy_freelancer_package_assignments a
          WHERE a.subscription_id = fs.id
       ) AS legacy_assignment,
       EXISTS (
         SELECT 1 FROM orders o
          WHERE o.assigned_freelancer_id = fs.freelancer_user_id
            AND o.received_at IS NOT NULL
            AND o.order_status = ANY($1::text[])
       ) AS has_accepted_real_order
     FROM freelancer_subscriptions fs
     WHERE fs.is_current = TRUE
       AND (
         (COALESCE(fs.has_first_order, FALSE) = FALSE AND (fs.actual_start_date IS NOT NULL OR fs.expiry_date IS NOT NULL))
         OR (
           fs.has_first_order = TRUE
           AND fs.first_order_id IS NULL
           AND (fs.actual_start_date IS NOT NULL OR fs.expiry_date IS NOT NULL)
         )
       )`,
    [REAL_ORDER_STATUSES],
  );
  return rows;
}

async function main() {
  const rows = await loadRows();
  const datedWithoutFirstOrder = [];
  const fabricated = [];
  for (const row of rows) {
    const input = {
      notes: row.notes,
      has_first_order: row.has_first_order,
      first_order_id: row.first_order_id,
      actual_start_date: row.actual_start_date,
      expiry_date: row.expiry_date,
      entitlement_duration_months: row.entitlement_duration_months,
      stripe_subscription_id: row.stripe_subscription_id,
      legacyAssignment: row.legacy_assignment === true,
      hasAcceptedRealOrder: row.has_accepted_real_order === true,
    };
    if (!row.has_first_order) {
      datedWithoutFirstOrder.push({
        id: String(row.id),
        source: row.source,
        decision: classifyPrematureAdminEntitlement(input),
      });
    } else {
      fabricated.push({
        id: String(row.id),
        source: row.source,
        decision: classifyFabricatedFirstOrderWithoutRealOrder(input),
      });
    }
  }
  const correct = fabricated.filter((row) => row.decision.action === "correct");
  console.log(JSON.stringify({
    datedWithoutFirstOrder: datedWithoutFirstOrder.length,
    datedWithoutFirstOrderSkipped: datedWithoutFirstOrder.map((row) => ({
      id: row.id,
      source: row.source,
      reason: row.decision.reason,
    })),
    fabricatedCandidates: fabricated.length,
    safeToCorrect: correct.length,
    fabricatedSkipped: fabricated
      .filter((row) => row.decision.action !== "correct")
      .map((row) => ({ id: row.id, source: row.source, reason: row.decision.reason })),
    corrections: correct.map((row) => ({
      id: row.id,
      source: row.source,
      durationMonths: row.decision.entitlement_duration_months,
    })),
  }));

  if (process.env.APPLY_CORRECTION !== "1") {
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of correct) {
      const { rowCount } = await client.query(
        `UPDATE freelancer_subscriptions
            SET status = 'assigned_not_started',
                has_first_order = FALSE,
                first_order_date = NULL,
                actual_start_date = NULL,
                expiry_date = NULL,
                entitlement_duration_months = COALESCE($2::int, entitlement_duration_months),
                updated_at = NOW()
          WHERE id = $1
            AND is_current = TRUE
            AND has_first_order = TRUE
            AND first_order_id IS NULL
            AND stripe_subscription_id IS NULL
            AND COALESCE(notes, '') NOT LIKE '%LEGACY_%'
            AND NOT EXISTS (
              SELECT 1 FROM legacy_freelancer_package_assignments a
               WHERE a.subscription_id = freelancer_subscriptions.id
            )
            AND NOT EXISTS (
              SELECT 1 FROM orders o
               WHERE o.assigned_freelancer_id = freelancer_subscriptions.freelancer_user_id
                 AND o.received_at IS NOT NULL
                 AND o.order_status = ANY($3::text[])
            )`,
        [Number(row.id), row.decision.entitlement_duration_months, REAL_ORDER_STATUSES],
      );
      if (rowCount !== 1) throw new Error(`correction_mismatch:${row.id}`);
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
