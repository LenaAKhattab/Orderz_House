/**
 * READ-ONLY Production post-apply verification for Migration 155.
 * Does not mutate. Does not apply 156. Does not enable engines.
 */
const { loadBackendEnv } = require("../src/config/loadBackendEnv");
loadBackendEnv({ profile: "default", failClosed: false, quiet: true });
const { Pool } = require("pg");
const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");
const {
  mapActiveEconomySettingsForAdminApi,
  getMarketplaceEconomySettings,
} = require("../src/services/marketplaceEconomySettingsService");

async function main() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (!info.isProduction) {
    throw new Error(`Expected Production, got ${info.classification}`);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });
  const client = await pool.connect();
  try {
    const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
    const q = async (sql, params = []) => (await client.query(sql, params)).rows;

    const applied = Number((await one(`SELECT COUNT(*)::int AS c FROM schema_migrations`)).c);
    const c155 = Number(
      (
        await one(
          `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version = '155_marketplace_normal_order_rules_e3'`,
        )
      ).c,
    );
    const c156 = Number(
      (
        await one(
          `SELECT COUNT(*)::int AS c FROM schema_migrations WHERE version = '156_default_plan_catalog'`,
        )
      ).c,
    );

    const orderCols = await q(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='orders'
         AND column_name IN (
           'application_bid_cost','target_applicant_count','application_deadline_at',
           'applications_closed_at','applications_close_reason',
           'deadline_incomplete_target_policy','e3_rules_snapshot','e3_rules_version'
         )
       ORDER BY column_name
    `);
    const settingCols = await q(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema='public' AND table_name='marketplace_economy_settings'
         AND column_name LIKE 'normal_order_%'
       ORDER BY column_name
    `);
    const idx = await one(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='orders_application_deadline_open_idx'
      ) AS ok
    `);
    const costChk = await one(`
      SELECT pg_get_constraintdef(c.oid) AS def
        FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='order_freelancer_bid_credit_economics'
         AND c.conname='order_freelancer_bid_credit_economics_cost_chk'
    `);

    const hist = await one(`
      SELECT
        COUNT(*)::int AS orders,
        COUNT(*) FILTER (WHERE application_bid_cost IS NULL)::int AS bid_cost_null,
        COUNT(*) FILTER (WHERE target_applicant_count IS NULL)::int AS target_null,
        COUNT(*) FILTER (WHERE application_deadline_at IS NULL)::int AS deadline_null,
        COUNT(*) FILTER (WHERE deadline_incomplete_target_policy IS NULL)::int AS policy_null,
        COUNT(*) FILTER (WHERE e3_rules_version IS NULL)::int AS version_null,
        COUNT(*) FILTER (WHERE applications_closed_at IS NULL)::int AS not_closed,
        COUNT(*) FILTER (WHERE applications_close_reason IS NULL)::int AS close_reason_null,
        COUNT(*) FILTER (WHERE COALESCE(e3_rules_snapshot, '{}'::jsonb) = '{}'::jsonb)::int AS empty_snapshot
      FROM orders
    `);

    const engines = await one(`
      SELECT bid_credits_enabled, article_applications_enabled,
             COALESCE(work_tokens_enabled, FALSE) AS work_tokens_enabled,
             COALESCE(bid_credit_purchases_enabled, FALSE) AS bid_credit_purchases_enabled,
             COALESCE(priority_application_boost_enabled, FALSE) AS priority_application_boost_enabled,
             COALESCE(elite_engine_enabled, FALSE) AS elite_engine_enabled,
             normal_order_min_value_jod, normal_order_max_value_jod,
             normal_order_min_target_applicants, normal_order_max_target_applicants,
             normal_order_default_target_applicants,
             normal_order_min_bid_cost, normal_order_max_bid_cost, normal_order_default_bid_cost,
             normal_order_min_application_period_hours, normal_order_max_application_period_hours,
             normal_order_default_application_period_hours,
             normal_order_min_execution_duration_hours, normal_order_max_execution_duration_hours,
             normal_order_default_execution_duration_hours,
             normal_order_deadline_incomplete_target_policy,
             normal_order_refund_client_cancel_before_selection,
             normal_order_refund_system_cancel,
             normal_order_refund_deadline_no_selection,
             normal_order_refund_no_freelancer_selected,
             normal_order_refund_freelancer_withdrawal,
             normal_order_refund_rejected_application,
             normal_order_refund_losing_applicant,
             normal_order_refund_post_award_cancel,
             normal_order_business_timezone
        FROM marketplace_economy_settings WHERE id = 1
    `);

    const settings = await getMarketplaceEconomySettings(client);
    const adminApi = mapActiveEconomySettingsForAdminApi(settings);

    let defaultCatalog = null;
    try {
      defaultCatalog = await one(
        `SELECT key, value FROM system_settings WHERE key = 'default_plan_catalog'`,
      );
    } catch {
      defaultCatalog = { missing_table: true };
    }

    const pantryTables = await q(`
      SELECT tablename FROM pg_tables
       WHERE schemaname='public' AND tablename ILIKE '%pantry%'
       ORDER BY tablename
    `);

    const out = {
      accessMode: "READ_ONLY_PRODUCTION_ACCESS",
      classification: info.classification,
      applied,
      c155,
      c156,
      orderCols: orderCols.map((r) => r.column_name),
      settingColCount: settingCols.length,
      settingCols: settingCols.map((r) => r.column_name),
      deadlineIndex: Boolean(idx.ok),
      costCheck: costChk?.def || null,
      historical: hist,
      engines: {
        bid_credits_enabled: engines.bid_credits_enabled,
        article_applications_enabled: engines.article_applications_enabled,
        work_tokens_enabled: engines.work_tokens_enabled,
        bid_credit_purchases_enabled: engines.bid_credit_purchases_enabled,
        priority_application_boost_enabled: engines.priority_application_boost_enabled,
        elite_engine_enabled: engines.elite_engine_enabled,
      },
      adminMapped: {
        normalOrderMinValueJod: adminApi.normalOrderMinValueJod,
        normalOrderMaxValueJod: adminApi.normalOrderMaxValueJod,
        normalOrderMinTargetApplicants: adminApi.normalOrderMinTargetApplicants,
        normalOrderMaxTargetApplicants: adminApi.normalOrderMaxTargetApplicants,
        normalOrderDefaultTargetApplicants: adminApi.normalOrderDefaultTargetApplicants,
        normalOrderMinBidCost: adminApi.normalOrderMinBidCost,
        normalOrderMaxBidCost: adminApi.normalOrderMaxBidCost,
        normalOrderDefaultBidCost: adminApi.normalOrderDefaultBidCost,
        normalOrderMinApplicationPeriodHours: adminApi.normalOrderMinApplicationPeriodHours,
        normalOrderMaxApplicationPeriodHours: adminApi.normalOrderMaxApplicationPeriodHours,
        normalOrderDefaultApplicationPeriodHours: adminApi.normalOrderDefaultApplicationPeriodHours,
        normalOrderMinExecutionDurationHours: adminApi.normalOrderMinExecutionDurationHours,
        normalOrderMaxExecutionDurationHours: adminApi.normalOrderMaxExecutionDurationHours,
        normalOrderDefaultExecutionDurationHours: adminApi.normalOrderDefaultExecutionDurationHours,
        normalOrderDeadlineIncompleteTargetPolicy: adminApi.normalOrderDeadlineIncompleteTargetPolicy,
        normalOrderRefundClientCancelBeforeSelection: adminApi.normalOrderRefundClientCancelBeforeSelection,
        normalOrderRefundSystemCancel: adminApi.normalOrderRefundSystemCancel,
        normalOrderRefundDeadlineNoSelection: adminApi.normalOrderRefundDeadlineNoSelection,
        normalOrderRefundNoFreelancerSelected: adminApi.normalOrderRefundNoFreelancerSelected,
        normalOrderRefundFreelancerWithdrawal: adminApi.normalOrderRefundFreelancerWithdrawal,
        normalOrderRefundRejectedApplication: adminApi.normalOrderRefundRejectedApplication,
        normalOrderRefundLosingApplicant: adminApi.normalOrderRefundLosingApplicant,
        normalOrderRefundPostAwardCancel: adminApi.normalOrderRefundPostAwardCancel,
        normalOrderBusinessTimezone: adminApi.normalOrderBusinessTimezone,
      },
      defaultCatalog,
      pantryTables: pantryTables.map((r) => r.tablename),
    };

    out.E3_PRODUCTION_SCHEMA =
      out.orderCols.length === 8 &&
      out.settingColCount >= 20 &&
      out.deadlineIndex &&
      String(out.costCheck || "").includes("bid_credit_cost >= 1")
        ? "PASS"
        : "FAIL";
    out.HISTORICAL_ORDER_ECONOMICS_PRESERVED =
      hist.orders > 0 &&
      hist.bid_cost_null === hist.orders &&
      hist.target_null === hist.orders &&
      hist.deadline_null === hist.orders &&
      hist.policy_null === hist.orders &&
      hist.version_null === hist.orders &&
      hist.empty_snapshot === hist.orders
        ? "PASS"
        : "FAIL";
    out.NORMAL_ORDER_ADMIN_CONFIGURATION =
      adminApi.normalOrderDefaultBidCost === 1 &&
      adminApi.normalOrderDeadlineIncompleteTargetPolicy === "continue_with_received" &&
      adminApi.normalOrderRefundDeadlineNoSelection === "full" &&
      adminApi.normalOrderRefundLosingApplicant === "none" &&
      adminApi.normalOrderBusinessTimezone === "Asia/Amman"
        ? "PASS"
        : "FAIL";
    out.BID_CREDITS_ENGINE = engines.bid_credits_enabled === false ? "DORMANT" : "ON";
    out.ARTICLE_APPLICATIONS_ENGINE =
      engines.article_applications_enabled === false ? "DORMANT" : "ON";
    out.MIGRATION_156_APPLIED = c156 === 0 ? "NO" : "YES";

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(out, null, 2));
    if (
      c155 !== 1 ||
      c156 !== 0 ||
      out.E3_PRODUCTION_SCHEMA !== "PASS" ||
      out.HISTORICAL_ORDER_ECONOMICS_PRESERVED !== "PASS" ||
      out.NORMAL_ORDER_ADMIN_CONFIGURATION !== "PASS" ||
      out.BID_CREDITS_ENGINE !== "DORMANT" ||
      out.ARTICLE_APPLICATIONS_ENGINE !== "DORMANT"
    ) {
      process.exitCode = 1;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
