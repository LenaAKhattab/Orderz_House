/**
 * B8A follow-up counts — correct Production table/column names.
 * READ ONLY.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) throw new Error("Expected Production");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const one = async (sql, params = []) => (await q(sql, params))[0] || null;
  const safe = async (label, fn) => {
    try {
      return { [label]: await fn() };
    } catch (e) {
      return { [label]: null, [`${label}Error`]: String(e.message || e).slice(0, 240) };
    }
  };

  try {
    await pool.query("BEGIN READ ONLY");
    const out = {
      membershipTables: (
        await q(
          `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE '%membership%' ORDER BY 1`,
        )
      ).map((r) => r.tablename),
      orderFakeCols: (
        await q(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='orders'
              AND column_name ILIKE '%fake%' OR (table_name='orders' AND column_name ILIKE '%train%')
            ORDER BY 1`,
        )
      ).map((r) => r.column_name),
      boostCols: (
        await q(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema='public' AND table_name='order_freelancer_priority_application_boosts'
            ORDER BY ordinal_position`,
        )
      ).map((r) => r.column_name),
      membershipStatuses: await q(
        `SELECT status, COUNT(*)::int AS c FROM freelancer_marketplace_memberships GROUP BY status ORDER BY c DESC`,
      ),
      ...(await safe("usableMemberships", async () =>
        Number(
          (
            await one(
              `SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships WHERE status IN ('active','grace')`,
            )
          ).c,
        ),
      )),
      ...(await safe("membershipsTotal", async () =>
        Number((await one(`SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships`)).c),
      )),
      ...(await safe("activeCycles", async () =>
        Number(
          (await one(`SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles WHERE status='active'`))
            .c,
        ),
      )),
      ...(await safe("openPricedBidding", async () => {
        // Prefer source_type / is_training style columns when present
        const cols = (
          await q(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema='public' AND table_name='orders'`,
          )
        ).map((r) => r.column_name);
        const has = (c) => cols.includes(c);
        let where = `project_type = 'bidding'
          AND is_published = TRUE
          AND is_open_for_pool = TRUE
          AND order_status = 'open_for_bids'
          AND assigned_freelancer_id IS NULL`;
        if (has("is_fake")) where += ` AND COALESCE(is_fake,FALSE)=FALSE`;
        else if (has("source_type")) where += ` AND COALESCE(source_type,'') NOT IN ('fake','training')`;
        if (has("is_training")) where += ` AND COALESCE(is_training,FALSE)=FALSE`;
        return {
          columnsUsed: { hasIsFake: has("is_fake"), hasIsTraining: has("is_training"), hasSourceType: has("source_type") },
          count: Number((await one(`SELECT COUNT(*)::int AS c FROM orders WHERE ${where}`)).c),
        };
      })),
      ...(await safe("pendingAppsOnOpenOrders", async () => {
        return Number(
          (
            await one(`
              SELECT COUNT(*)::int AS c
                FROM order_freelancer_bids ofb
                JOIN orders o ON o.id = ofb.order_id
               WHERE o.order_status = 'open_for_bids'
                 AND o.assigned_freelancer_id IS NULL
                 AND o.is_published = TRUE`)
          ).c,
        );
      })),
      ...(await safe("articleStatuses", async () =>
        q(`SELECT status, COUNT(*)::int AS c FROM marketplace_articles GROUP BY status ORDER BY c DESC`),
      )),
      packages: await q(
        `SELECT id, bid_quantity, price_jod, validity_days, is_active FROM marketplace_bid_credit_packages ORDER BY id`,
      ),
      activePlanAllowances: await q(
        `SELECT tier_code, monthly_bid_allowance, priority_bid_uses_per_cycle, article_access_level, is_active
           FROM marketplace_membership_plans
          WHERE is_active = TRUE
          ORDER BY sort_order, id`,
      ),
    };
    await pool.query("ROLLBACK");
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    try {
      await pool.query("ROLLBACK");
    } catch (_) {}
    console.error(e);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
