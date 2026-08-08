/**
 * Super Admin Analysis page — users by country & subscription statistics.
 * Explicit, documented SQL semantics (is_current, plan_pages.page_type grouping).
 */

const { pool } = require("../config/db");
const { formatCountryRow, normalizeCountryCode } = require("../utils/countryDisplay");

const VALID_RANGES = new Set(["all", "today", "7d", "30d", "this_month", "last_month"]);

/** Real admin assignment — excludes auto_default_free_plan rows. */
const IS_ADMIN_ASSIGNED_SQL = `
  fs.source = 'admin'
  AND fs.payment_status = 'not_required'
  AND fs.assigned_by_user_id IS NOT NULL
  AND COALESCE(fs.notes, '') <> 'auto_default_free_plan'
`.trim();

/**
 * Historical activation-fee revenue for a paid subscription row.
 * Uses the freelancer's latest stored payment amount_minor (immutable), never the live setting.
 */
const PAID_ACTIVATION_FEE_SQL = `
  CASE
    WHEN fs.payment_status = 'paid'
    THEN COALESCE(
      (
        SELECT (afp.amount_minor::numeric / 1000)
        FROM subscription_activation_fee_payments afp
        WHERE afp.user_id = fs.freelancer_user_id
        ORDER BY afp.paid_at DESC, afp.id DESC
        LIMIT 1
      ),
      0
    )
    ELSE 0
  END
`.trim();

const PAID_TOTAL_REVENUE_SQL = `
  CASE
    WHEN fs.payment_status = 'paid'
    THEN COALESCE(p.price_jod, 0) + (${PAID_ACTIVATION_FEE_SQL})
    ELSE 0
  END
`.trim();

const PLAN_GROUP = Object.freeze({
  CORE: "core",
  PAGES: "pages",
  UNASSIGNED: "unassigned",
});

const PLAN_GROUP_LABELS = Object.freeze({
  [PLAN_GROUP.CORE]: "الباقات الأساسية",
  [PLAN_GROUP.PAGES]: "باقات الصفحات",
  [PLAN_GROUP.UNASSIGNED]: "غير مصنّفة",
});

function toInt(v) {
  return Math.max(0, Math.trunc(Number(v) || 0));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseBool(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return defaultValue;
}

function normalizeRange(range) {
  const r = String(range || "all").trim().toLowerCase();
  return VALID_RANGES.has(r) ? r : "all";
}

/**
 * SQL fragment for optional date range on a timestamptz column expression.
 * @returns {{ clause: string, params: unknown[] }}
 */
function buildRangeClause(columnExpr, range, startIndex = 1) {
  if (!range || range === "all") {
    return { clause: "", params: [] };
  }

  let intervalSql;
  switch (range) {
    case "today":
      intervalSql = `${columnExpr} >= date_trunc('day', now())`;
      break;
    case "7d":
      intervalSql = `${columnExpr} >= date_trunc('day', now()) - interval '6 days'`;
      break;
    case "30d":
      intervalSql = `${columnExpr} >= date_trunc('day', now()) - interval '29 days'`;
      break;
    case "this_month":
      intervalSql = `${columnExpr} >= date_trunc('month', now())`;
      break;
    case "last_month":
      intervalSql = `${columnExpr} >= date_trunc('month', now()) - interval '1 month' AND ${columnExpr} < date_trunc('month', now())`;
      break;
    default:
      return { clause: "", params: [] };
  }

  return { clause: ` AND ${intervalSql}`, params: [] };
}

/** Resolve ISO country code: users.country first, then billing_country. */
const USER_COUNTRY_CODE_SQL = `
  CASE
    WHEN u.country IS NOT NULL AND trim(u.country) ~ '^[A-Za-z]{2}$'
      THEN upper(trim(u.country))
    WHEN u.billing_country IS NOT NULL AND trim(u.billing_country) ~ '^[A-Za-z]{2}$'
      THEN upper(trim(u.billing_country))
    ELSE NULL
  END
`.trim();

const SUBSCRIPTION_DATE_SQL = `COALESCE(fs.paid_at, fs.assigned_at, fs.created_at)`;

function resolvePlanGroupKey(pageType) {
  if (pageType === "default") return PLAN_GROUP.CORE;
  if (pageType === "special") return PLAN_GROUP.PAGES;
  return PLAN_GROUP.UNASSIGNED;
}

function mapCountryRow(row, totalForPct) {
  const formatted = formatCountryRow(row.country_code);
  const totalUsers = toInt(row.total_users);
  const pct = totalForPct > 0 ? Math.round((1000 * totalUsers) / totalForPct) / 10 : 0;
  return {
    countryCode: formatted.countryCode,
    countryName: formatted.name,
    totalUsers,
    clients: toInt(row.clients),
    freelancers: toInt(row.freelancers),
    sharePct: pct,
  };
}

async function getUsersByCountry({ range }) {
  const userRange = buildRangeClause("u.created_at", range);
  const { rows } = await pool.query(
    `WITH scoped AS (
       SELECT
         u.id,
         u.role,
         ${USER_COUNTRY_CODE_SQL} AS country_code
       FROM users u
       WHERE u.role IN ('client', 'freelancer')
       ${userRange.clause}
     )
     SELECT
       country_code,
       COUNT(*)::int AS total_users,
       COUNT(*) FILTER (WHERE role = 'client')::int AS clients,
       COUNT(*) FILTER (WHERE role = 'freelancer')::int AS freelancers
     FROM scoped
     GROUP BY country_code`,
    userRange.params,
  );

  const known = [];
  let totalUnknown = 0;
  let totalKnown = 0;

  for (const row of rows) {
    if (!row.country_code) {
      totalUnknown += toInt(row.total_users);
    } else {
      totalKnown += toInt(row.total_users);
      known.push(row);
    }
  }

  known.sort((a, b) => toInt(b.total_users) - toInt(a.total_users));
  const grandTotal = totalKnown + totalUnknown;
  const countries = known.map((row) => mapCountryRow(row, grandTotal));

  if (totalUnknown > 0) {
    countries.push({
      countryCode: null,
      countryName: "غير معروف",
      totalUsers: totalUnknown,
      clients: rows
        .filter((r) => !r.country_code)
        .reduce((s, r) => s + toInt(r.clients), 0),
      freelancers: rows
        .filter((r) => !r.country_code)
        .reduce((s, r) => s + toInt(r.freelancers), 0),
      sharePct: grandTotal > 0 ? Math.round((1000 * totalUnknown) / grandTotal) / 10 : 0,
    });
  }

  return {
    totalKnown,
    totalUnknown,
    totalUsers: grandTotal,
    countries,
  };
}

function buildSubscriptionScopeSql({ currentOnly, range }) {
  const clauses = [];
  if (currentOnly) {
    clauses.push("fs.is_current = TRUE");
  }
  const dateRange = buildRangeClause(SUBSCRIPTION_DATE_SQL, range);
  if (dateRange.clause) {
    clauses.push(dateRange.clause.replace(/^\s*AND\s*/, ""));
  }
  return {
    whereSql: clauses.length ? clauses.join(" AND ") : "TRUE",
    params: dateRange.params,
  };
}

async function getSubscriptionOverview(scope) {
  const { whereSql, params } = scope;
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total_current,
       COUNT(*) FILTER (WHERE fs.payment_status = 'paid')::int AS paid,
       COUNT(*) FILTER (WHERE ${IS_ADMIN_ASSIGNED_SQL})::int AS admin_assigned,
       COUNT(*) FILTER (
         WHERE fs.payment_status IN ('not_required')
           OR fs.payment_status IS NULL
           OR trim(fs.payment_status) = ''
       )::int AS free_not_required,
       COUNT(*) FILTER (WHERE fs.payment_status = 'pending')::int AS pending_payment,
       COUNT(*) FILTER (WHERE fs.activation_status = 'company_pending')::int AS pending_company_activation,
       COUNT(*) FILTER (WHERE fs.status = 'assigned_not_started')::int AS assigned_not_started,
       COUNT(*) FILTER (
         WHERE fs.status = 'active'
           AND (fs.expiry_date IS NULL OR fs.expiry_date > NOW())
       )::int AS active,
       COUNT(*) FILTER (WHERE fs.status IN ('inactive', 'cancelled', 'expired'))::int AS inactive_cancelled,
       COALESCE(SUM(CASE WHEN fs.payment_status = 'paid' THEN COALESCE(p.price_jod, 0) ELSE 0 END), 0)::numeric AS paid_plan_revenue_jod,
       COALESCE(SUM(${PAID_ACTIVATION_FEE_SQL}), 0)::numeric AS paid_activation_fee_revenue_jod,
       COALESCE(SUM(${PAID_TOTAL_REVENUE_SQL}), 0)::numeric AS paid_revenue_jod
     FROM freelancer_subscriptions fs
     LEFT JOIN plans p ON p.id = fs.plan_id
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     WHERE ${whereSql}`,
    params,
  );
  const r = rows[0] || {};
  return {
    totalCurrent: toInt(r.total_current),
    paid: toInt(r.paid),
    adminAssigned: toInt(r.admin_assigned),
    freeNotRequired: toInt(r.free_not_required),
    pendingPayment: toInt(r.pending_payment),
    pendingCompanyActivation: toInt(r.pending_company_activation),
    assignedNotStarted: toInt(r.assigned_not_started),
    active: toInt(r.active),
    inactiveCancelled: toInt(r.inactive_cancelled),
    paidPlanRevenueJod: toNum(r.paid_plan_revenue_jod),
    paidActivationFeeRevenueJod: toNum(r.paid_activation_fee_revenue_jod),
    paidRevenueJod: toNum(r.paid_revenue_jod),
  };
}

async function getSubscriptionsByPlan(scope) {
  const { whereSql, params } = scope;
  const { rows } = await pool.query(
    `SELECT
       p.id AS plan_id,
       p.title AS plan_title,
       p.name AS plan_name,
       p.price_jod,
       p.duration_days,
       pp.id AS plan_page_id,
       pp.title AS plan_page_title,
       pp.page_type AS plan_page_type,
       COUNT(fs.id)::int AS total_subscribers,
       COUNT(fs.id) FILTER (WHERE fs.payment_status = 'paid')::int AS paid_subscribers,
       COUNT(fs.id) FILTER (WHERE ${IS_ADMIN_ASSIGNED_SQL})::int AS admin_assigned_subscribers,
       COUNT(fs.id) FILTER (
         WHERE fs.payment_status IN ('not_required')
           OR fs.payment_status IS NULL
           OR trim(fs.payment_status) = ''
       )::int AS free_not_required_subscribers,
       COUNT(fs.id) FILTER (
         WHERE fs.status = 'active'
           AND (fs.expiry_date IS NULL OR fs.expiry_date > NOW())
       )::int AS active_subscribers,
       COUNT(fs.id) FILTER (WHERE fs.activation_status = 'company_pending')::int AS pending_activation,
       COUNT(fs.id) FILTER (WHERE fs.status = 'assigned_not_started')::int AS assigned_not_started,
       COUNT(fs.id) FILTER (WHERE fs.status IN ('inactive', 'cancelled', 'expired'))::int AS inactive_cancelled,
       COALESCE(SUM(CASE WHEN fs.payment_status = 'paid' THEN COALESCE(p.price_jod, 0) ELSE 0 END), 0)::numeric AS paid_plan_revenue_jod,
       COALESCE(SUM(${PAID_ACTIVATION_FEE_SQL}), 0)::numeric AS paid_activation_fee_revenue_jod,
       COALESCE(SUM(${PAID_TOTAL_REVENUE_SQL}), 0)::numeric AS paid_revenue_jod
     FROM plans p
     LEFT JOIN plan_pages pp ON pp.id = p.plan_page_id
     LEFT JOIN freelancer_subscriptions fs ON fs.plan_id = p.id AND (${whereSql})
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     WHERE p.deleted_at IS NULL
     GROUP BY p.id, pp.id
     HAVING COUNT(fs.id) > 0
     ORDER BY total_subscribers DESC, paid_revenue_jod DESC, p.id ASC`,
    params,
  );

  return rows.map((row) => ({
    planId: toInt(row.plan_id),
    planTitle: row.plan_title || row.plan_name || `باقة #${row.plan_id}`,
    planName: row.plan_name || null,
    priceJod: row.price_jod != null ? toNum(row.price_jod) : null,
    durationDays: row.duration_days != null ? toInt(row.duration_days) : null,
    planPageId: row.plan_page_id != null ? toInt(row.plan_page_id) : null,
    planPageTitle: row.plan_page_title || null,
    planPageType: row.plan_page_type || null,
    planGroup: resolvePlanGroupKey(row.plan_page_type),
    totalSubscribers: toInt(row.total_subscribers),
    paidSubscribers: toInt(row.paid_subscribers),
    adminAssignedSubscribers: toInt(row.admin_assigned_subscribers),
    freeNotRequiredSubscribers: toInt(row.free_not_required_subscribers),
    activeSubscribers: toInt(row.active_subscribers),
    pendingActivation: toInt(row.pending_activation),
    assignedNotStarted: toInt(row.assigned_not_started),
    inactiveCancelled: toInt(row.inactive_cancelled),
    paidPlanRevenueJod: toNum(row.paid_plan_revenue_jod),
    paidActivationFeeRevenueJod: toNum(row.paid_activation_fee_revenue_jod),
    paidRevenueJod: toNum(row.paid_revenue_jod),
  }));
}

async function getSubscriptionsByPlanGroup(scope, byPlan) {
  const { whereSql, params } = scope;
  const { rows } = await pool.query(
    `SELECT
       COALESCE(pp.page_type, 'unassigned') AS page_type_key,
       pp.id AS plan_page_id,
       pp.title AS plan_page_title,
       pp.slug AS plan_page_slug,
       COUNT(fs.id)::int AS total_subscriptions,
       COUNT(fs.id) FILTER (WHERE fs.payment_status = 'paid')::int AS paid_subscriptions,
       COUNT(fs.id) FILTER (WHERE ${IS_ADMIN_ASSIGNED_SQL})::int AS admin_assigned_subscriptions,
       COUNT(fs.id) FILTER (
         WHERE fs.payment_status IN ('not_required')
           OR fs.payment_status IS NULL
           OR trim(fs.payment_status) = ''
       )::int AS free_not_required_subscriptions,
       COUNT(fs.id) FILTER (
         WHERE fs.status = 'active'
           AND (fs.expiry_date IS NULL OR fs.expiry_date > NOW())
       )::int AS active_subscriptions,
       COUNT(fs.id) FILTER (WHERE fs.activation_status = 'company_pending')::int AS pending_activation,
       COUNT(fs.id) FILTER (WHERE fs.status = 'assigned_not_started')::int AS assigned_not_started,
       COALESCE(SUM(CASE WHEN fs.payment_status = 'paid' THEN COALESCE(p.price_jod, 0) ELSE 0 END), 0)::numeric AS paid_plan_revenue_jod,
       COALESCE(SUM(${PAID_ACTIVATION_FEE_SQL}), 0)::numeric AS paid_activation_fee_revenue_jod,
       COALESCE(SUM(${PAID_TOTAL_REVENUE_SQL}), 0)::numeric AS paid_revenue_jod
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     LEFT JOIN plan_pages pp ON pp.id = p.plan_page_id
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     WHERE ${whereSql}
     GROUP BY pp.id, pp.page_type, pp.title, pp.slug
     ORDER BY total_subscriptions DESC`,
    params,
  );

  const groupMap = new Map();

  for (const row of rows) {
    const groupKey = row.plan_page_id == null ? PLAN_GROUP.UNASSIGNED : resolvePlanGroupKey(row.page_type_key);
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        groupLabel: PLAN_GROUP_LABELS[groupKey] || groupKey,
        planPages: [],
        totalSubscriptions: 0,
        paidSubscriptions: 0,
        adminAssignedSubscriptions: 0,
        freeNotRequiredSubscriptions: 0,
        activeSubscriptions: 0,
        pendingActivation: 0,
        assignedNotStarted: 0,
        paidRevenueJod: 0,
        topPlans: [],
      });
    }
    const g = groupMap.get(groupKey);
    g.totalSubscriptions += toInt(row.total_subscriptions);
    g.paidSubscriptions += toInt(row.paid_subscriptions);
    g.adminAssignedSubscriptions += toInt(row.admin_assigned_subscriptions);
    g.freeNotRequiredSubscriptions += toInt(row.free_not_required_subscriptions);
    g.activeSubscriptions += toInt(row.active_subscriptions);
    g.pendingActivation += toInt(row.pending_activation);
    g.assignedNotStarted += toInt(row.assigned_not_started);
    g.paidRevenueJod += toNum(row.paid_revenue_jod);

    if (row.plan_page_id != null) {
      g.planPages.push({
        planPageId: toInt(row.plan_page_id),
        title: row.plan_page_title,
        slug: row.plan_page_slug,
        pageType: row.page_type_key,
        totalSubscriptions: toInt(row.total_subscriptions),
      });
    }
  }

  const plansByGroup = new Map();
  for (const plan of byPlan) {
    const gk = plan.planGroup || PLAN_GROUP.UNASSIGNED;
    if (!plansByGroup.has(gk)) plansByGroup.set(gk, []);
    plansByGroup.get(gk).push(plan);
  }

  const order = [PLAN_GROUP.CORE, PLAN_GROUP.PAGES, PLAN_GROUP.UNASSIGNED];
  return order
    .filter((k) => groupMap.has(k))
    .map((k) => {
      const g = groupMap.get(k);
      const topPlans = (plansByGroup.get(k) || [])
        .slice()
        .sort((a, b) => b.totalSubscribers - a.totalSubscribers)
        .slice(0, 5)
        .map((p) => ({
          planId: p.planId,
          planTitle: p.planTitle,
          totalSubscribers: p.totalSubscribers,
          paidSubscribers: p.paidSubscribers,
        }));
      return { ...g, topPlans };
    });
}

async function getSubscriptionsByCountry(scope) {
  const { whereSql, params } = scope;
  const { rows: countryRows } = await pool.query(
    `WITH scoped AS (
       SELECT
         fs.id,
         fs.freelancer_user_id,
         fs.payment_status,
         fs.source,
         fs.assigned_by_user_id,
         fs.notes,
         fs.plan_id,
         p.title AS plan_title,
         p.price_jod,
         u.subscription_activation_fee_paid_at,
         ${USER_COUNTRY_CODE_SQL} AS country_code,
         EXISTS (
           SELECT 1
           FROM subscription_activation_fee_payments afp
           WHERE afp.user_id = fs.freelancer_user_id
         ) AS has_activation_fee_payment
       FROM freelancer_subscriptions fs
       JOIN users u ON u.id = fs.freelancer_user_id
       LEFT JOIN plans p ON p.id = fs.plan_id
       WHERE ${whereSql}
     )
     SELECT
       country_code,
       COUNT(*)::int AS total_subscriptions,
       COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid_subscriptions,
       COUNT(*) FILTER (
         WHERE source = 'admin'
           AND payment_status = 'not_required'
           AND assigned_by_user_id IS NOT NULL
           AND COALESCE(notes, '') <> 'auto_default_free_plan'
       )::int AS admin_assigned_subscriptions,
       COALESCE(SUM(
         CASE
           WHEN payment_status = 'paid'
           THEN COALESCE(price_jod, 0) + CASE
             WHEN has_activation_fee_payment
             THEN COALESCE(
               (
                 SELECT (afp.amount_minor::numeric / 1000)
                 FROM subscription_activation_fee_payments afp
                 WHERE afp.user_id = freelancer_user_id
                 ORDER BY afp.paid_at DESC, afp.id DESC
                 LIMIT 1
               ),
               0
             )
             ELSE 0
           END
           ELSE 0
         END
       ), 0)::numeric AS paid_revenue_jod
     FROM scoped
     GROUP BY country_code
     ORDER BY total_subscriptions DESC`,
    params,
  );

  const { rows: topPlanRows } = await pool.query(
    `WITH scoped AS (
       SELECT
         fs.plan_id,
         p.title AS plan_title,
         ${USER_COUNTRY_CODE_SQL} AS country_code
       FROM freelancer_subscriptions fs
       JOIN users u ON u.id = fs.freelancer_user_id
       LEFT JOIN plans p ON p.id = fs.plan_id
       WHERE ${whereSql}
     ),
     plan_counts AS (
       SELECT country_code, plan_id, plan_title, COUNT(*)::int AS subs
       FROM scoped
       WHERE country_code IS NOT NULL AND plan_id IS NOT NULL
       GROUP BY country_code, plan_id, plan_title
     )
     SELECT DISTINCT ON (country_code)
       country_code,
       plan_id,
       plan_title,
       subs
     FROM plan_counts
     ORDER BY country_code, subs DESC, plan_id ASC`,
    params,
  );

  const topPlanByCountry = new Map(
    topPlanRows.map((r) => [
      r.country_code,
      {
        planId: toInt(r.plan_id),
        planTitle: r.plan_title || `باقة #${r.plan_id}`,
        subscribers: toInt(r.subs),
      },
    ]),
  );

  return countryRows.map((row) => {
    const formatted = formatCountryRow(row.country_code);
    return {
      countryCode: formatted.countryCode,
      countryName: formatted.name,
      totalSubscriptions: toInt(row.total_subscriptions),
      paidSubscriptions: toInt(row.paid_subscriptions),
      adminAssignedSubscriptions: toInt(row.admin_assigned_subscriptions),
      paidRevenueJod: toNum(row.paid_revenue_jod),
      topPlan: topPlanByCountry.get(row.country_code) || null,
    };
  });
}

async function getDashboardAnalysis(query = {}) {
  const range = normalizeRange(query.range);
  const currentOnly = parseBool(query.currentOnly, true);
  const scope = buildSubscriptionScopeSql({ currentOnly, range });

  const [usersByCountry, subscriptionOverview, subscriptionsByPlan, subscriptionsByCountry] =
    await Promise.all([
      getUsersByCountry({ range }),
      getSubscriptionOverview(scope),
      getSubscriptionsByPlan(scope),
      getSubscriptionsByCountry(scope),
    ]);

  const subscriptionsByPlanGroup = await getSubscriptionsByPlanGroup(scope, subscriptionsByPlan);

  return {
    updatedAt: new Date().toISOString(),
    meta: {
      range,
      currentOnly,
      staffExcludedFromUsers: true,
      userCountryPriority: "users.country → users.billing_country",
      subscriptionScope: currentOnly ? "is_current = TRUE" : "all subscription rows",
      planGroupLogic: "plan_pages.page_type: default = الباقات الأساسية, special = باقات الصفحات",
      revenueNote:
        "paidRevenueJod = سعر الباقة + مبلغ رسوم التفعيل التاريخي (amount_minor من آخر دفعة تفعيل للمستقل)، وليس القيمة الحالية للإعداد",
    },
    usersByCountry,
    subscriptionOverview,
    subscriptionsByPlan,
    subscriptionsByPlanGroup,
    subscriptionsByCountry,
  };
}

module.exports = {
  getDashboardAnalysis,
  PLAN_GROUP,
  PLAN_GROUP_LABELS,
};
