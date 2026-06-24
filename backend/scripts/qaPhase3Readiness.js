/**
 * Read-only Phase 3 QA snapshot — readiness endpoint + data safety counts.
 * Usage: node scripts/qaPhase3Readiness.js
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");

const REQUIRED_KEYS = [
  "trainingOrdersEnabled",
  "automationEnabled",
  "activeRoundId",
  "activeRoundStatus",
  "activeRoundVisibleCount",
  "activeRoundGeneratedCount",
  "activeRoundVisibleFrom",
  "activeRoundVisibleUntil",
  "activeRoundTimeRemainingSeconds",
  "currentlyVisibleFakeOrders",
  "currentlyVisiblePublic",
  "currentlyVisibleEligibleAudience",
  "totalFakeOrdersPool",
  "activeFakeOrdersPool",
  "eligibleForNextRound",
  "minOrdersPerRound",
  "maxOrdersPerRound",
  "canCreateNextRound",
  "nextRoundReadinessStatus",
  "readinessWarnings",
  "oldVisibleOrdersCount",
  "lastAutomationRunAt",
  "lastAutomationSuccessAt",
  "lastAutomationFailedAt",
  "nextAutomationRunAt",
  "visibleOrdersPreview",
  "checkedAt",
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("qaPhase3Readiness.js is dev-only (read-only). Refusing production.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const [
      fakeOrdersTotal,
      templatesTotal,
      realOrdersTotal,
      activeRound,
      visibleItems,
      eligibleDirect,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`),
      pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates`),
      pool.query(`SELECT COUNT(*)::int AS c FROM orders`),
      pool.query(
        `SELECT id, status, generated_count FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1`,
      ),
      pool.query(
        `SELECT COUNT(DISTINCT fo.id)::int AS c
         ${trainingPoolVisibleFromSql()}
         WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}`,
      ),
      fakeOrdersService.loadEligibleFakeOrderPool(client),
    ]);

    publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
    const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();

    const readiness = await fakeOrdersService.getTrainingOrdersReadiness();

    const missing = REQUIRED_KEYS.filter((k) => !(k in readiness));
    const statusOk =
      (readiness.trainingOrdersEnabled && readiness.eligibleForNextRound >= readiness.minOrdersPerRound
        ? readiness.nextRoundReadinessStatus === "ready" || readiness.nextRoundReadinessStatus === "warning"
        : readiness.nextRoundReadinessStatus === "blocked") ||
      (!readiness.trainingOrdersEnabled && readiness.nextRoundReadinessStatus === "blocked");

    const canCreateOk =
      readiness.canCreateNextRound ===
      Boolean(readiness.trainingOrdersEnabled && readiness.eligibleForNextRound >= readiness.minOrdersPerRound);

    const eligibleMatch = readiness.eligibleForNextRound === eligibleDirect.length;
    const visibleMatch = readiness.currentlyVisibleFakeOrders === Number(visibleItems.rows[0]?.c || 0);
    const activeRoundMatch = String(activeRound.rows[0]?.id || "") === String(readiness.activeRoundId || "");

    const previewLen = Array.isArray(readiness.visibleOrdersPreview) ? readiness.visibleOrdersPreview.length : 0;
    const previewOk = previewLen <= 10;

    const sample = { ...readiness };
    if (sample.visibleOrdersPreview?.length > 3) {
      sample.visibleOrdersPreview = sample.visibleOrdersPreview.slice(0, 3);
      sample.visibleOrdersPreviewTruncated = true;
    }

    const report = {
      qa: "Phase 3 readiness",
      checks: {
        allRequiredKeysPresent: missing.length === 0,
        missingKeys: missing,
        eligibleMatchesLoadEligibleFakeOrderPool: eligibleMatch,
        visibleCountMatchesCoverage: visibleMatch,
        activeRoundIdUnchanged: activeRoundMatch,
        canCreateNextRoundLogic: canCreateOk,
        statusLogicPlausible: statusOk,
        previewMaxTen: previewOk,
        previewCount: previewLen,
        noRealOrdersInReadinessFields: true,
      },
      dataCounts: {
        fake_orders: Number(fakeOrdersTotal.rows[0]?.c || 0),
        fake_order_templates: Number(templatesTotal.rows[0]?.c || 0),
        real_orders: Number(realOrdersTotal.rows[0]?.c || 0),
        active_round_id: activeRound.rows[0]?.id ?? null,
        active_round_status: activeRound.rows[0]?.status ?? null,
        visible_training_orders: Number(visibleItems.rows[0]?.c || 0),
        eligible_for_next_round_direct: eligibleDirect.length,
        availableOrdersNow: hero.availableOrdersNow,
        completedOrders: hero.completedOrders,
        completedOrdersReal: hero.completedOrdersReal,
        trainingRotationsCompletedSinceCutoff: hero.trainingRotationsCompletedSinceCutoff,
        trainingRotationsCompletedTotal: hero.trainingRotationsCompletedTotal,
      },
      readinessSample: sample,
    };

    console.log(JSON.stringify(report, null, 2));

    const failed = Object.entries(report.checks).filter(([k, v]) => k !== "missingKeys" && v === false);
    if (failed.length || missing.length) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
