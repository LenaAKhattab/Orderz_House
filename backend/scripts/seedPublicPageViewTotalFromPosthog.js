/**
 * One-time floor for public_page_view_totals from PostHog all-time $pageview count.
 * Uses GREATEST(local_total, posthog_total) — never adds both together.
 * Does NOT seed active users (they rebuild from local events over 7 days).
 *
 * Usage (from backend/):
 *   node scripts/seedPublicPageViewTotalFromPosthog.js
 *
 * Requires DATABASE_URL and PostHog server env (POSTHOG_*).
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const posthogAnalyticsService = require("../src/services/posthogAnalyticsService");
const publicPageViewService = require("../src/services/publicPageViewService");
const { pool } = require("../src/config/db");

async function main() {
  const localBefore = await publicPageViewService.getTotalPageViewCount();
  let posthogTotal = null;

  const cfg = posthogAnalyticsService.readPosthogCredentialsLoose();
  if (!cfg) {
    console.log("[seed] PostHog not configured — nothing to seed.");
    console.log(`[seed] Local total remains: ${localBefore}`);
    return;
  }

  try {
    const snap = await posthogAnalyticsService.getHeroSnapshotNumbersWithTimeout(cfg);
    posthogTotal = snap.pageViewsAllTime;
  } catch (err) {
    console.warn("[seed] PostHog query failed:", err?.message || err);
    console.log(`[seed] Local total remains: ${localBefore}`);
    return;
  }

  const result = await publicPageViewService.seedTotalCountFloor(posthogTotal);
  console.log("[seed] Pageview total floor applied:");
  console.log(`  local before: ${result.previous}`);
  console.log(`  posthog all-time: ${posthogTotal}`);
  console.log(`  local after:  ${result.next}`);
  console.log(`  updated: ${result.updated ? "yes" : "no (local already >= posthog)"}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
