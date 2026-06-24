/**
 * Dev-only timing snapshot for Training Orders admin endpoints.
 * Usage: node scripts/benchmarkTrainingAdminEndpoints.js
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");

async function time(label, fn) {
  const started = Date.now();
  const result = await fn();
  const durationMs = Date.now() - started;
  return { label, durationMs, result };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("benchmarkTrainingAdminEndpoints.js is dev-only.");
    process.exit(1);
  }

  const rows = [];

  rows.push(
    await time("getTrainingOrdersReadiness", () => fakeOrdersService.getTrainingOrdersReadiness()),
  );
  rows.push(
    await time("getFakeOrdersAutomationHealth", () => fakeOrdersService.getFakeOrdersAutomationHealth()),
  );
  rows.push(
    await time("listCurrentlyVisibleFakeOrders page=1 limit=10", () =>
      fakeOrdersService.queryCurrentlyVisibleFakeOrdersPaginated(null, { page: 1, limit: 10 }),
    ),
  );
  rows.push(
    await time("countFakeOrdersPool", async () => {
      const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`);
      return Number(countRows[0]?.c || 0);
    }),
  );
  rows.push(
    await time("listRounds page=1 limit=10", () =>
      fakeOrdersService.listRounds({ actorUserId: 1, page: 1, limit: 10 }).catch(async () => {
        const { rows: roundRows } = await pool.query(
          `SELECT COUNT(*)::int AS c FROM fake_order_rounds`,
        );
        return { pagination: { total: Number(roundRows[0]?.c || 0) }, rounds: [] };
      }),
    ),
  );

  const summary = rows.map(({ label, durationMs, result }) => {
    let extra = {};
    if (label.includes("readiness") && result) {
      extra = {
        eligibleForNextRound: result.eligibleForNextRound,
        currentlyVisibleFakeOrders: result.currentlyVisibleFakeOrders,
        oldVisibleOrdersCount: result.oldVisibleOrdersCount,
      };
    }
    if (label.includes("visible") && result?.pagination) {
      extra = { total: result.pagination.total, returned: result.orders?.length };
    }
    if (label.includes("countFakeOrdersPool")) {
      extra = { total: result?.total };
    }
    if (label.includes("listRounds") && result?.pagination) {
      extra = { totalRounds: result.pagination.total };
    }
    return { label, durationMs, ...extra };
  });

  console.log(JSON.stringify({ benchmark: "trainingAdminEndpoints", at: new Date().toISOString(), summary }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
