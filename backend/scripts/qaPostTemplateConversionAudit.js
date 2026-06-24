/**
 * Read-only post-conversion audit.
 * Run: node scripts/qaPostTemplateConversionAudit.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), override: true });

const { pool } = require("../src/config/db");
const fakeOrdersService = require("../src/services/fakeOrdersService");
const publicHomeOrderStatsService = require("../src/services/publicHomeOrderStatsService");

async function main() {
  const [
    fakeOrders,
    templates,
    bySource,
    templateIdNotNull,
    templateConverted,
    adminCreated,
    poolEligible,
    roundItems,
    realOrders,
    health,
    readiness,
    hero,
  ] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_templates`),
    pool.query(`SELECT source_type, COUNT(*)::int AS c FROM fake_orders GROUP BY source_type ORDER BY c DESC`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders WHERE template_id IS NOT NULL`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders WHERE source_type = 'template_converted'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders WHERE source_type = 'admin_created'`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_orders WHERE is_published = TRUE AND is_open_for_pool = TRUE AND COALESCE(is_archived, FALSE) = FALSE`),
    pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_round_items ri INNER JOIN fake_order_rounds fr ON fr.id = ri.round_id WHERE fr.status = 'active' AND ri.status = 'active' AND ri.visible_from <= NOW() AND ri.visible_until > NOW()`),
    pool.query(`SELECT COUNT(*)::int AS c FROM orders`),
    fakeOrdersService.getFakeOrdersAutomationHealth(),
    fakeOrdersService.getTrainingOrdersReadiness(),
    publicHomeOrderStatsService.queryHeroOrderCounts(),
  ]);

  console.log(JSON.stringify({
    fake_orders: fakeOrders.rows[0].c,
    fake_order_templates: templates.rows[0].c,
    source_type_breakdown: bySource.rows,
    template_id_not_null: templateIdNotNull.rows[0].c,
    template_converted: templateConverted.rows[0].c,
    admin_created: adminCreated.rows[0].c,
    pool_eligible: poolEligible.rows[0].c,
    visible_round_items: roundItems.rows[0].c,
    visible_training_orders: health.pool?.visibleAnyAudience,
    active_rounds: health.pool?.activeRounds,
    eligibleForNextRound: readiness.eligibleForNextRound,
    availableOrdersNow: hero.availableOrdersNow,
    completedOrders: hero.completedOrders,
    real_orders: realOrders.rows[0].c,
    conversion_tracking_rows: (await pool.query(`SELECT COUNT(*)::int AS c FROM fake_order_template_conversions`)).rows[0].c,
  }, null, 2));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
