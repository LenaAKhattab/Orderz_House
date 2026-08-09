/**
 * Backfill offline subscription + activation fee payments for an existing Admin assignment.
 * Does not create a new subscription.
 *
 *   node scripts/applyAdminAssignmentOfflinePayments.js --email=ahmed2002@gmail.com --subscription-id=1900 --expected-plan-id=3 --dry-run
 *   node scripts/applyAdminAssignmentOfflinePayments.js --email=ahmed2002@gmail.com --subscription-id=1900 --expected-plan-id=3 --apply
 */
require("dotenv").config();

const { assertOperationalScriptAllowed } = require("../src/utils/databaseEnvironmentSafety");
try {
  assertOperationalScriptAllowed("applyAdminAssignmentOfflinePayments.js");
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}

const { pool } = require("../src/config/db");
const subscriptionsService = require("../src/services/subscriptionsService");
const planOrderValueEligibility = require("../src/services/planOrderValueEligibility");

function parseArgs(argv) {
  const out = {
    email: null,
    subscriptionId: null,
    expectedPlanId: null,
    actorUserId: null,
    apply: false,
    dryRun: true,
  };
  for (const a of argv) {
    if (a.startsWith("--email=")) out.email = String(a.slice("--email=".length)).trim();
    if (a.startsWith("--subscription-id=")) out.subscriptionId = Number(a.slice("--subscription-id=".length));
    if (a.startsWith("--expected-plan-id=")) out.expectedPlanId = Number(a.slice("--expected-plan-id=".length));
    if (a.startsWith("--actor-user-id=")) out.actorUserId = Number(a.slice("--actor-user-id=".length));
    if (a === "--apply") {
      out.apply = true;
      out.dryRun = false;
    }
    if (a === "--dry-run") out.dryRun = true;
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email || !args.subscriptionId) {
    console.error(
      "Usage: --email=... --subscription-id=... [--expected-plan-id=...] [--actor-user-id=...] [--dry-run|--apply]",
    );
    process.exit(1);
  }

  const { rows: users } = await pool.query(
    `SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [args.email],
  );
  const user = users[0];
  if (!user) {
    console.error("USER_NOT_FOUND");
    await pool.end();
    process.exit(1);
  }

  const { rows: subs } = await pool.query(
    `SELECT id, freelancer_user_id, plan_id, status, is_current, source, payment_status, activation_status, paid_at
     FROM freelancer_subscriptions
     WHERE id = $1::bigint
     LIMIT 1`,
    [args.subscriptionId],
  );
  const sub = subs[0];
  if (!sub) {
    console.error("SUBSCRIPTION_NOT_FOUND");
    await pool.end();
    process.exit(1);
  }

  const preconditions = {
    userMatches: Number(sub.freelancer_user_id) === Number(user.id),
    isCurrent: sub.is_current === true,
    isAdminSource: String(sub.source) === "admin",
    statusOk: String(sub.status) === "assigned_not_started",
    planOk: args.expectedPlanId == null || Number(sub.plan_id) === Number(args.expectedPlanId),
  };

  console.log(
    JSON.stringify(
      {
        userId: String(user.id),
        email: user.email,
        subscription: sub,
        preconditions,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );

  if (!Object.values(preconditions).every(Boolean)) {
    console.error("PRECONDITION_FAILED — no data modified");
    await pool.end();
    process.exit(2);
  }

  if (args.dryRun) {
    console.log("DRY_RUN: would apply offline subscription + activation fee payments");
  } else {
    const result = await subscriptionsService.applyOfflinePaymentsToExistingAdminAssignment({
      actorUserId: args.actorUserId || sub.assigned_by_user_id || null,
      freelancerUserId: user.id,
      subscriptionId: sub.id,
      expectedPlanId: args.expectedPlanId,
    });
    console.log("RESULT:", JSON.stringify(result, null, 2));
  }

  const canTake = await subscriptionsService.canFreelancerTakeOrders(String(user.id));
  const range = await planOrderValueEligibility.getFreelancerPlanOrderValueRange(user.id);
  console.log("CAN_TAKE:", JSON.stringify(canTake, null, 2));
  console.log("PLAN_RANGE:", JSON.stringify(range, null, 2));

  await pool.end();
})().catch(async (e) => {
  console.error(e);
  try {
    await pool.end();
  } catch (_) {}
  process.exit(1);
});
