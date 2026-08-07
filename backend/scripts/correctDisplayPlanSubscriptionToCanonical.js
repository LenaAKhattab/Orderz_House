/**
 * One-time safe correction: remap current display-plan subscription to canonical plan.
 * Does NOT mark activation fee paid.
 *
 *   node scripts/correctDisplayPlanSubscriptionToCanonical.js --email=ahmed2002@gmail.com --dry-run
 *   node scripts/correctDisplayPlanSubscriptionToCanonical.js --email=ahmed2002@gmail.com --apply
 */
require("dotenv").config();
const { pool } = require("../src/config/db");
const plansService = require("../src/services/plansService");
const subscriptionsService = require("../src/services/subscriptionsService");
const planOrderValueEligibility = require("../src/services/planOrderValueEligibility");

function parseArgs(argv) {
  const out = { email: null, apply: false, dryRun: true };
  for (const a of argv) {
    if (a.startsWith("--email=")) out.email = String(a.slice("--email=".length)).trim();
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
  if (!args.email) {
    console.error("Usage: --email=user@example.com [--dry-run|--apply]");
    process.exit(1);
  }

  const { rows: users } = await pool.query(
    `SELECT id, email, role FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [args.email],
  );
  const user = users[0];
  if (!user) {
    console.error("USER_NOT_FOUND");
    await pool.end();
    process.exit(1);
  }

  const { rows: subs } = await pool.query(
    `SELECT fs.*, p.subscription_plan_id, p.name AS plan_name
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
     ORDER BY fs.id DESC
     LIMIT 1`,
    [user.id],
  );
  const current = subs[0];
  if (!current) {
    console.error("NO_CURRENT_SUBSCRIPTION");
    await pool.end();
    process.exit(1);
  }

  const resolved = await plansService.resolveAssignableSubscriptionPlanId(current.plan_id, pool);
  console.log(
    JSON.stringify(
      {
        userId: String(user.id),
        email: user.email,
        subscriptionId: String(current.id),
        currentPlanId: String(current.plan_id),
        currentPlanName: current.plan_name,
        resolved,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );

  if (Number(resolved.assignmentPlanId) === Number(current.plan_id)) {
    console.log("NO_CHANGE_NEEDED: already on assignment/canonical plan");
  } else if (args.dryRun) {
    console.log("DRY_RUN: would UPDATE freelancer_subscriptions.plan_id ->", resolved.assignmentPlanId);
  } else {
    if (String(current.freelancer_user_id) !== String(user.id)) {
      throw new Error("Safety check failed: subscription user mismatch");
    }
    if (!current.is_current) {
      throw new Error("Safety check failed: subscription is not current");
    }
    if (!resolved.resolvedFromDisplay && Number(current.subscription_plan_id) !== Number(resolved.assignmentPlanId)) {
      // Allow only when selected plan links to canonical OR already resolved
    }
    if (current.subscription_plan_id == null && resolved.resolvedFromDisplay !== true) {
      throw new Error("Safety check failed: plan has no subscription_plan_id mapping");
    }
    if (Number(current.subscription_plan_id) !== Number(resolved.assignmentPlanId) && resolved.resolvedFromDisplay) {
      // expected: display -> canonical
    }
    if (resolved.resolvedFromDisplay !== true) {
      throw new Error("Safety check failed: expected display→canonical resolution");
    }

    const { rows: updated } = await pool.query(
      `UPDATE freelancer_subscriptions
       SET plan_id = $2::bigint,
           notes = CASE
             WHEN notes IS NULL OR btrim(notes) = '' THEN $3
             ELSE notes || E'\n' || $3
           END,
           updated_at = NOW()
       WHERE id = $1::bigint
         AND freelancer_user_id = $4::bigint
         AND is_current = TRUE
         AND plan_id = $5::bigint
       RETURNING id, plan_id, freelancer_user_id, is_current, status`,
      [
        current.id,
        resolved.assignmentPlanId,
        `corrected_display_plan_${current.plan_id}_to_canonical_${resolved.assignmentPlanId}`,
        user.id,
        current.plan_id,
      ],
    );
    if (!updated[0]) {
      throw new Error("UPDATE matched 0 rows — aborting");
    }
    console.log("UPDATED:", JSON.stringify(updated[0], null, 2));
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
