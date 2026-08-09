/**
 * Mark 25 JOD subscription activation fee as paid for a freelancer by email.
 *
 * Usage (from backend/):
 *   node scripts/markActivationFeePaidByEmail.js lenakattab@gmail.com
 */
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { assertOperationalScriptAllowed } = require("../src/utils/databaseEnvironmentSafety");
try {
  assertOperationalScriptAllowed("markActivationFeePaidByEmail.js");
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

const { pool } = require("../src/config/db");
const {
  markActivationFeePaidOffline,
  getActivationFeeStatus,
} = require("../src/services/subscriptionActivationFeeService");
const subscriptionsService = require("../src/services/subscriptionsService");

async function inspectUser(email) {
  const { rows } = await pool.query(
    `SELECT id, email, role, subscription_activation_fee_paid_at
     FROM users WHERE lower(email) = lower($1::text) LIMIT 1`,
    [email],
  );
  if (!rows[0]) return null;
  const uid = rows[0].id;

  const fee = await getActivationFeeStatus(uid);
  const { rows: subs } = await pool.query(
    `SELECT id, plan_id, status, payment_status, activation_status, is_current, actual_start_date, expiry_date
     FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
     ORDER BY id DESC
     LIMIT 5`,
    [uid],
  );
  const { rows: payments } = await pool.query(
    `SELECT id, amount_minor, currency, paid_at, source, notes
     FROM subscription_activation_fee_payments
     WHERE user_id = $1
     ORDER BY id DESC`,
    [uid],
  );
  const canTake = await subscriptionsService.canFreelancerTakeOrders(String(uid));

  return { user: rows[0], fee, subs, payments, canTake };
}

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const notes = String(process.argv[3] || "Manual admin: mark 25 JOD activation fee paid").trim();
  if (!email) {
    console.error("Usage: node scripts/markActivationFeePaidByEmail.js <email> [notes]");
    process.exit(1);
  }

  const before = await inspectUser(email);
  if (!before?.user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  if (before.user.role !== "freelancer") {
    console.error(`User ${email} is role=${before.user.role}, expected freelancer`);
    process.exit(1);
  }

  console.log("Before:", JSON.stringify(before, null, 2));

  const result = await markActivationFeePaidOffline({
    adminUserId: null,
    freelancerUserId: before.user.id,
    notes,
  });

  const after = await inspectUser(email);
  console.log("Mark result:", JSON.stringify(result, null, 2));
  console.log("After:", JSON.stringify(after, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
