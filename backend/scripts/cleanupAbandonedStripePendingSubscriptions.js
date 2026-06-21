/**
 * Remove legacy unpaid Stripe checkout placeholder rows and ensure default free plan fallback.
 *
 * Preview (no writes):
 *   node scripts/cleanupAbandonedStripePendingSubscriptions.js --dry-run
 *
 * Apply delete + default-free bootstrap:
 *   CONFIRM_STRIPE_PENDING_CLEANUP=true node scripts/cleanupAbandonedStripePendingSubscriptions.js --apply
 *
 * Optional age threshold (default 24 hours):
 *   node scripts/cleanupAbandonedStripePendingSubscriptions.js --dry-run --min-age-hours=48
 *
 * Bootstrap only (after migration 084 deleted rows without bootstrap):
 *   CONFIRM_STRIPE_PENDING_CLEANUP=true node scripts/cleanupAbandonedStripePendingSubscriptions.js --bootstrap-only --freelancer-ids=1,2,3
 */

const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

const subscriptionsService = require("../src/services/subscriptionsService");

function parseMinAgeHours(argv) {
  const arg = argv.find((a) => a.startsWith("--min-age-hours="));
  if (!arg) return 24;
  const n = Number.parseInt(arg.split("=")[1], 10);
  return Number.isInteger(n) && n >= 0 ? n : 24;
}

function parseFreelancerIds(argv) {
  const arg = argv.find((a) => a.startsWith("--freelancer-ids="));
  if (!arg) return [];
  return arg
    .split("=")[1]
    .split(",")
    .map((x) => Number.parseInt(x.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
}

async function bootstrapFreelancers(freelancerIds) {
  const results = [];
  for (const uid of freelancerIds) {
    const current = await subscriptionsService.getCurrentSubscriptionForFreelancer(uid);
    const retainable =
      current &&
      current.isCurrent === true &&
      !["failed", "cancelled"].includes(String(current.paymentStatus || "").toLowerCase()) &&
      String(current.status || "").trim().toLowerCase() !== "cancelled";

    if (retainable) {
      results.push({
        freelancerUserId: uid,
        action: "skipped",
        reason: "valid_current_subscription",
        subscriptionId: current.id,
      });
      continue;
    }

    const snap = await subscriptionsService.getFreelancerIdentitySnapshot(uid);
    if (!snap?.isFreelancer) {
      results.push({ freelancerUserId: uid, action: "skipped", reason: "not_freelancer" });
      continue;
    }

    const out = await subscriptionsService.ensureFreelancerDefaultFreePlan(uid);
    results.push({
      freelancerUserId: uid,
      action: out.created ? "created_default_free" : "unchanged",
      subscriptionId: out.subscription?.id || null,
    });
  }
  return results;
}

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || argv.includes("-n") || !argv.includes("--apply");
  const bootstrapOnly = argv.includes("--bootstrap-only");
  const minAgeHours = parseMinAgeHours(argv);

  if (bootstrapOnly) {
    const ids = parseFreelancerIds(argv);
    if (ids.length === 0) {
      // eslint-disable-next-line no-console
      console.error("Provide --freelancer-ids=1,2,3 with --bootstrap-only");
      process.exit(1);
    }
    if (process.env.CONFIRM_STRIPE_PENDING_CLEANUP !== "true") {
      // eslint-disable-next-line no-console
      console.error("Set CONFIRM_STRIPE_PENDING_CLEANUP=true to run bootstrap-only.");
      process.exit(1);
    }
    const results = await bootstrapFreelancers(ids);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ bootstrapOnly: true, results }, null, 2));
    return;
  }

  if (!dryRun && process.env.CONFIRM_STRIPE_PENDING_CLEANUP !== "true") {
    // eslint-disable-next-line no-console
    console.error(
      "Refusing to apply without CONFIRM_STRIPE_PENDING_CLEANUP=true. Run with --dry-run first.",
    );
    process.exit(1);
  }

  const result = await subscriptionsService.cleanupAbandonedStripePendingSubscriptionsWithFreePlanFallback({
    dryRun,
    minAgeHours,
  });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
