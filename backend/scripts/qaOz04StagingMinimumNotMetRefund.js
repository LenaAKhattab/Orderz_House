/**
 * Staging QA plan helper for OZ04 (read/write staging only — never Production).
 *
 * Usage (staging env):
 *   node scripts/qaOz04StagingMinimumNotMetRefund.js --dry-run
 *   node scripts/qaOz04StagingMinimumNotMetRefund.js --execute
 *
 * Does NOT publish Bildazo, does NOT trigger Stripe payments, does NOT deploy.
 */
/* eslint-disable no-console */

const path = require("path");

const PLAN = {
  title: "OZ04 Staging QA — minimum_not_met fund refund + recycle",
  steps: [
    "1. Preflight: APP_ENV=staging, Neon host ep-solitary-band…, pending migrations=0, writable.",
    "2. Create QA draft marketplace_articles row (OZ02 fields) OR reuse existing draft.",
    "3. Note fund balance; release draft via OZ03 (same id → published); confirm one daily_allocation with marketplaceArticleId.",
    "4. Ensure bid collection round is collecting with deadline in the past and applications count < required.",
    "5. Trigger closeExpiredArticleBidCollections (or closeArticleRoundMinimumNotMet) — do NOT assign a winner.",
    "6. Confirm: round status minimum_not_met; article status draft (same id); one daily_allocation_released with reason minimum_not_met_refund / Arabic copy.",
    "7. Confirm fund balance restored by exact deduction amount; repeat close → no second refund.",
    "8. Release same article again → new daily_allocation; no duplicate marketplace_articles row.",
    "9. Cleanup: close/cancel QA article; do not leave published live inventory.",
    "10. Confirm no Bildazo publish occurred.",
  ],
  never: [
    "Production DB",
    "Production migrations",
    "db push/reset/seed",
    "real Bildazo publish",
    "Stripe payments",
    "deploy / git push",
  ],
};

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  console.log(JSON.stringify({ mode: execute ? "execute" : "dry-run", plan: PLAN }, null, 2));
  if (!execute) {
    console.log("Dry-run only. Pass --execute with staging credentials loaded to run controlled QA.");
    console.log("Script path:", path.basename(__filename));
    process.exit(0);
  }
  console.error("Execute mode is intentionally a checklist runner stub — use qaOz03StagingUnifiedInventory.js patterns against staging .env only.");
  process.exit(2);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
