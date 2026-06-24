/**
 * Read-only pool visibleNow filter verification.
 */
require("dotenv").config();

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("qaPhase3PoolFilter.js is dev-only (read-only). Refusing production.");
    process.exit(1);
  }

  const { rows } = await pool.query(
    `SELECT id FROM users WHERE role IN ('super_admin', 'admin') ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END LIMIT 1`,
  );
  const actorUserId = rows[0]?.id;
  if (!actorUserId) throw new Error("No admin user found");

  const [all, visible, hidden] = await Promise.all([
    fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1 }),
    fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1, visibleNow: true }),
    fakeOrdersService.listFakeOrders({ actorUserId, page: 1, limit: 1, visibleNow: false }),
  ]);

  const totalAll = all.pagination?.total ?? 0;
  const totalVisibleNow = visible.pagination?.total ?? 0;
  const totalNotVisible = hidden.pagination?.total ?? 0;

  const settings = await pool.query(
    `SELECT min_orders, max_orders FROM fake_order_settings WHERE id = 1`,
  );

  console.log(
    JSON.stringify(
      {
        poolFilter: {
          totalAll,
          totalVisibleNow,
          totalNotVisible,
          sumVisiblePlusHidden: totalVisibleNow + totalNotVisible,
          matchesAll: totalAll === totalVisibleNow + totalNotVisible,
        },
        dbSettings: settings.rows[0],
        sampleVisibleRow: visible.fakeOrders?.[0]
          ? { id: visible.fakeOrders[0].id, visibleNow: visible.fakeOrders[0].visibleNow }
          : null,
        sampleHiddenRow: hidden.fakeOrders?.[0]
          ? { id: hidden.fakeOrders[0].id, visibleNow: hidden.fakeOrders[0].visibleNow }
          : null,
      },
      null,
      2,
    ),
  );

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
