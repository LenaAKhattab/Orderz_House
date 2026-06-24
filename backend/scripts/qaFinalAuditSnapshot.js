/**
 * Read-only final QA audit snapshot — Training Orders Admin.
 * Usage: node scripts/qaFinalAuditSnapshot.js
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");
const {
  trainingPoolVisibleFromSql,
  trainingPoolVisibleWhereSql,
} = require("../src/services/trainingPoolEligibility");

async function countVisible(client) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT fo.id)::int AS c
     ${trainingPoolVisibleFromSql()}
     WHERE ${trainingPoolVisibleWhereSql({ anyAudience: true })}`,
  );
  return rows[0].c;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("qaFinalAuditSnapshot.js is dev-only.");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    publicHomeOrderStatsService.invalidatePublicHomeOrderStatsCache();
    const hero = await publicHomeOrderStatsService.queryHeroOrderCounts();
    const readiness = await fakeOrdersService.getTrainingOrdersReadiness();
    const eligibleDirect = await fakeOrdersService.loadEligibleFakeOrderPool(client);

    const admin = await pool.query(
      `SELECT id FROM users WHERE role IN ('super_admin', 'admin') ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1`,
    );
    const actorUserId = admin.rows[0]?.id;

    const [fakeOrders, templates, realOrders, activeRound, visible, poolCount, poolAll, poolVis, poolHidden] =
      await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`),
        pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates`),
        pool.query(`SELECT COUNT(*)::int AS c FROM orders`),
        pool.query(`SELECT id, status FROM fake_order_rounds WHERE status = 'active' ORDER BY id DESC LIMIT 1`),
        countVisible(client),
        actorUserId
          ? fakeOrdersService.countFakeOrdersPool({ actorUserId }).then((r) => r?.total ?? r)
          : null,
        actorUserId
          ? fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1 }).then((r) => r.pagination?.total)
          : null,
        actorUserId
          ? fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1, visibleNow: true }).then((r) => r.pagination?.total)
          : null,
        actorUserId
          ? fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1, visibleNow: false }).then((r) => r.pagination?.total)
          : null,
      ]);

    const checks = {
      readinessReadOnlyKeys: [
        "minOrdersPerRound",
        "maxOrdersPerRound",
        "eligibleForNextRound",
        "nextRoundReadinessStatus",
        "canCreateNextRound",
      ].every((k) => k in readiness),
      minMaxCorrect: readiness.minOrdersPerRound === 50 && readiness.maxOrdersPerRound === 100,
      eligibleMatchesPool: readiness.eligibleForNextRound === eligibleDirect.length,
      visibleMatches: readiness.currentlyVisibleFakeOrders === visible,
      poolCountMatchesFakeOrders:
        poolCount != null && Number(poolCount) === fakeOrders.rows[0].c && poolAll === fakeOrders.rows[0].c,
      poolFilterSum:
        poolVis != null && poolHidden != null && poolVis + poolHidden === poolAll,
      statusLogicConsistent:
        readiness.nextRoundReadinessStatus === "ready"
          ? readiness.eligibleForNextRound >= readiness.maxOrdersPerRound
          : readiness.nextRoundReadinessStatus === "warning"
            ? readiness.eligibleForNextRound >= readiness.minOrdersPerRound &&
              readiness.eligibleForNextRound < readiness.maxOrdersPerRound
            : readiness.nextRoundReadinessStatus === "blocked"
              ? !readiness.trainingOrdersEnabled ||
                readiness.eligibleForNextRound < readiness.minOrdersPerRound
              : true,
    };

    console.log(
      JSON.stringify(
        {
          qa: "Final audit snapshot",
          environment: process.env.NODE_ENV || "development",
          dataCounts: {
            fake_orders: fakeOrders.rows[0].c,
            fake_order_templates: templates.rows[0].c,
            real_orders: realOrders.rows[0].c,
            active_round_id: activeRound.rows[0]?.id ?? null,
            active_round_status: activeRound.rows[0]?.status ?? null,
            visible_training_orders: visible,
            eligibleForNextRound_api: readiness.eligibleForNextRound,
            eligibleForNextRound_direct: eligibleDirect.length,
            availableOrdersNow: hero.availableOrdersNow,
            completedOrders: hero.completedOrders,
            completedOrdersReal: hero.completedOrdersReal,
            trainingRotationsCompletedSinceCutoff: hero.trainingRotationsCompletedSinceCutoff,
            poolCountApi: poolCount,
            poolListTotal: poolAll,
            poolVisibleFilter: poolVis,
            poolHiddenFilter: poolHidden,
          },
          readinessSample: {
            minOrdersPerRound: readiness.minOrdersPerRound,
            maxOrdersPerRound: readiness.maxOrdersPerRound,
            eligibleForNextRound: readiness.eligibleForNextRound,
            nextRoundReadinessStatus: readiness.nextRoundReadinessStatus,
            canCreateNextRound: readiness.canCreateNextRound,
            oldVisibleOrdersCount: readiness.oldVisibleOrdersCount,
            readinessWarnings: readiness.readinessWarnings,
            activeRoundId: readiness.activeRoundId,
          },
          checks,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
