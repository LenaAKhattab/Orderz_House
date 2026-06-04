const { pool } = require("../config/db");
const superAdminAnalyticsOverviewService = require("./superAdminAnalyticsOverviewService");
const { CLAIM_STATUSES } = require("./financialClaimsService");
const { SUBSCRIPTION_ACTIVATION_STATUSES } = require("./subscriptionsService");
const { formatCountryRow } = require("../utils/countryDisplay");

const SECTION_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.SUPERADMIN_INTELLIGENCE_SECTION_TIMEOUT_MS) || 7000, 3000),
  30000,
);

function toInt(v) {
  return Math.max(0, Math.trunc(Number(v) || 0));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function withTimeout(label, fn, timeoutMs = SECTION_TIMEOUT_MS) {
  let timer;
  try {
    const out = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`Section ${label} timed out.`);
          err.code = "SECTION_TIMEOUT";
          reject(err);
        }, timeoutMs);
      }),
    ]);
    return { ok: true, data: out, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err?.message || String(err) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildResult(section, result, fallback = {}) {
  return {
    section,
    updatedAt: new Date().toISOString(),
    data: result.ok ? result.data : fallback,
    ...(result.ok ? {} : { meta: { sectionErrors: { [section]: result.error } } }),
  };
}

function computeTrend(current, previous) {
  const c = toNum(current);
  const p = toNum(previous);
  if (p === 0 && c === 0) {
    return { changePct: 0, trend: "flat" };
  }
  if (p === 0) {
    return { changePct: 100, trend: "up" };
  }
  const changePct = Number((((c - p) / p) * 100).toFixed(1));
  let trend = "flat";
  if (changePct > 0.5) trend = "up";
  else if (changePct < -0.5) trend = "down";
  return { changePct, trend };
}

function mapComparisonMetric({ key, label, current, previous, money = false, hint = null, comparable = true }) {
  const trend = comparable ? computeTrend(current, previous) : { changePct: null, trend: null };
  return {
    key,
    label,
    hint,
    money,
    comparable,
    current: money ? toNum(current) : toInt(current),
    previous: money ? toNum(previous) : toInt(previous),
    ...trend,
  };
}

async function getSummaryIntelligence() {
  const result = await withTimeout("summary", async () => {
    const { rows } = await pool.query(
      `WITH role_counts AS (
         SELECT
           COUNT(*)::int AS total_users,
           COUNT(*) FILTER (WHERE role = 'client')::int AS total_clients,
           COUNT(*) FILTER (WHERE role = 'freelancer')::int AS total_freelancers,
           COUNT(*) FILTER (WHERE role = 'freelancer' AND is_active = TRUE)::int AS active_freelancers
         FROM users
       ),
       sub AS (
         SELECT
           COUNT(*) FILTER (WHERE is_current = TRUE AND status = 'active')::int AS active_subscriptions,
           COUNT(*) FILTER (WHERE is_current = TRUE AND activation_status = 'company_pending')::int AS pending_subscriptions
         FROM freelancer_subscriptions
       ),
       ord AS (
         SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE order_status IN ('published','open_for_freelancers','open_for_bids','pending_payment','awaiting_payment_after_bid_selection','pending_freelancer_acceptance'))::int AS open_orders,
           COUNT(*) FILTER (WHERE order_status = 'completed')::int AS completed_orders,
           COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_orders
         FROM orders
       ),
       fin AS (
         SELECT
           COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'paid'), 0)::numeric AS total_revenue,
           COALESCE(SUM(payment_amount) FILTER (WHERE payment_status = 'paid' AND paid_at >= date_trunc('month', now())), 0)::numeric AS monthly_revenue
         FROM orders
       ),
       claims AS (
         SELECT COUNT(*) FILTER (WHERE status = $1)::int AS pending_financial_claims
         FROM financial_claims
       ),
       courses AS (
         SELECT
           COUNT(*)::int AS total_courses,
           (SELECT COUNT(DISTINCT freelancer_id)::int FROM course_assignments) AS enrolled_students
         FROM courses
       )
       SELECT *
       FROM role_counts, sub, ord, fin, claims, courses`,
      [CLAIM_STATUSES.PENDING],
    );
    const row = rows[0] || {};
    return {
      totalUsers: toInt(row.total_users),
      totalClients: toInt(row.total_clients),
      totalFreelancers: toInt(row.total_freelancers),
      activeFreelancers: toInt(row.active_freelancers),
      totalOrders: toInt(row.total_orders),
      openOrders: toInt(row.open_orders),
      completedOrders: toInt(row.completed_orders),
      cancelledOrders: toInt(row.cancelled_orders),
      totalRevenueJod: toNum(row.total_revenue),
      monthlyRevenueJod: toNum(row.monthly_revenue),
      pendingFinancialClaims: toInt(row.pending_financial_claims),
      activeSubscriptions: toInt(row.active_subscriptions),
      pendingSubscriptions: toInt(row.pending_subscriptions),
      totalCourses: toInt(row.total_courses),
      enrolledStudents: toInt(row.enrolled_students),
    };
  });
  return buildResult("summary", result);
}

async function getExecutiveKpiComparison() {
  const result = await withTimeout("executiveKpis", async () => {
    const { rows } = await pool.query(
      `WITH user_stats AS (
         SELECT
           COUNT(*)::int AS total_users,
           COUNT(*) FILTER (WHERE created_at < date_trunc('month', now()))::int AS users_at_month_start,
           COUNT(*) FILTER (WHERE role = 'client')::int AS total_clients,
           COUNT(*) FILTER (WHERE role = 'client' AND created_at < date_trunc('month', now()))::int AS clients_at_month_start,
           COUNT(*) FILTER (WHERE role = 'freelancer' AND is_active = TRUE)::int AS active_freelancers,
           COUNT(*) FILTER (
             WHERE role = 'freelancer' AND is_active = TRUE AND created_at < date_trunc('month', now())
           )::int AS freelancers_active_at_month_start
         FROM users
       ),
       order_stats AS (
         SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE created_at < date_trunc('month', now()))::int AS orders_at_month_start,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS orders_this_month,
           COUNT(*) FILTER (
             WHERE created_at >= date_trunc('month', now()) - interval '1 month'
               AND created_at < date_trunc('month', now())
           )::int AS orders_last_month,
           COALESCE(SUM(payment_amount) FILTER (
             WHERE payment_status = 'paid' AND paid_at >= date_trunc('month', now())
           ), 0)::numeric AS revenue_this_month,
           COALESCE(SUM(payment_amount) FILTER (
             WHERE payment_status = 'paid'
               AND paid_at >= date_trunc('month', now()) - interval '1 month'
               AND paid_at < date_trunc('month', now())
           ), 0)::numeric AS revenue_last_month
         FROM orders
       ),
       sub_stats AS (
         SELECT
           COUNT(*) FILTER (WHERE is_current = TRUE AND status = 'active')::int AS active_subscriptions,
           COUNT(*) FILTER (
             WHERE is_current = TRUE AND status = 'active'
               AND COALESCE(paid_at, assigned_at) < date_trunc('month', now())
           )::int AS subscriptions_at_month_start
         FROM freelancer_subscriptions
       ),
       claim_stats AS (
         SELECT
           COUNT(*) FILTER (WHERE status = $1)::int AS pending_claims,
           COUNT(*) FILTER (WHERE submitted_at >= date_trunc('month', now()))::int AS claims_this_month,
           COUNT(*) FILTER (
             WHERE submitted_at >= date_trunc('month', now()) - interval '1 month'
               AND submitted_at < date_trunc('month', now())
           )::int AS claims_last_month
         FROM financial_claims
       )
       SELECT
         u.total_users,
         u.users_at_month_start,
         o.total_orders,
         o.orders_at_month_start,
         o.orders_this_month,
         o.orders_last_month,
         o.revenue_this_month,
         o.revenue_last_month,
         s.active_subscriptions,
         s.subscriptions_at_month_start,
         u.total_clients,
         u.clients_at_month_start,
         u.active_freelancers,
         u.freelancers_active_at_month_start,
         c.pending_claims,
         c.claims_this_month,
         c.claims_last_month
       FROM user_stats u, order_stats o, sub_stats s, claim_stats c`,
      [CLAIM_STATUSES.PENDING],
    );
    const r = rows[0] || {};
    return [
      mapComparisonMetric({
        key: "totalUsers",
        label: "إجمالي المستخدمين",
        current: r.total_users,
        previous: r.users_at_month_start,
        hint: "مقارنة ببداية الشهر",
      }),
      mapComparisonMetric({
        key: "totalOrders",
        label: "إجمالي الطلبات",
        current: r.total_orders,
        previous: r.orders_at_month_start,
        hint: "مقارنة ببداية الشهر",
      }),
      mapComparisonMetric({
        key: "ordersThisMonth",
        label: "طلبات الشهر",
        current: r.orders_this_month,
        previous: r.orders_last_month,
      }),
      mapComparisonMetric({
        key: "monthlyRevenue",
        label: "إيرادات الشهر",
        current: r.revenue_this_month,
        previous: r.revenue_last_month,
        money: true,
      }),
      mapComparisonMetric({
        key: "activeSubscriptions",
        label: "اشتراكات نشطة",
        current: r.active_subscriptions,
        previous: r.subscriptions_at_month_start,
      }),
      mapComparisonMetric({
        key: "totalClients",
        label: "إجمالي العملاء",
        current: r.total_clients,
        previous: r.clients_at_month_start,
      }),
      mapComparisonMetric({
        key: "activeFreelancers",
        label: "مستقلون نشطون",
        current: r.active_freelancers,
        previous: r.freelancers_active_at_month_start,
      }),
      mapComparisonMetric({
        key: "pendingClaims",
        label: "مطالبات معلقة",
        current: r.pending_claims,
        previous: r.pending_claims,
        hint: "العدد الحالي فقط — لا يُقارن بفترة سابقة",
        comparable: false,
      }),
      mapComparisonMetric({
        key: "claimsSubmitted",
        label: "مطالبات مقدّمة",
        current: r.claims_this_month,
        previous: r.claims_last_month,
        hint: "هذا الشهر مقابل الشهر السابق",
      }),
    ];
  });
  return buildResult("executiveKpis", result, []);
}

async function getOrdersIntelligence() {
  const result = await withTimeout("orders", async () => {
    const [overview, categories, timing, ranges] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_orders,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS orders_today,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::int AS orders_this_week,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS orders_this_month,
           COUNT(*) FILTER (WHERE order_status = 'completed')::int AS completed_orders,
           COUNT(*) FILTER (WHERE order_status IN ('published','open_for_freelancers','open_for_bids','pending_payment','awaiting_payment_after_bid_selection','pending_freelancer_acceptance'))::int AS pending_orders,
           COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cancelled_orders,
           COUNT(*) FILTER (WHERE project_type = 'fixed')::int AS fixed_orders,
           COUNT(*) FILTER (WHERE project_type = 'bidding')::int AS bidding_orders,
           COALESCE(AVG(CASE WHEN payment_amount > 0 THEN payment_amount WHEN budget > 0 THEN budget END), 0)::numeric AS avg_order_value,
           COALESCE(100.0 * COUNT(*) FILTER (WHERE order_status = 'completed') / NULLIF(COUNT(*),0), 0)::numeric AS completion_rate,
           COALESCE(100.0 * COUNT(*) FILTER (WHERE order_status = 'cancelled') / NULLIF(COUNT(*),0), 0)::numeric AS cancellation_rate,
           COUNT(*) FILTER (
             WHERE order_status IN ('published','open_for_freelancers','open_for_bids','pending_payment','awaiting_payment_after_bid_selection','pending_freelancer_acceptance')
               AND created_at < now() - interval '72 hours'
           )::int AS waiting_too_long,
           COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(taken_at, received_at) - created_at))/3600)
             FILTER (WHERE COALESCE(taken_at, received_at) IS NOT NULL AND created_at IS NOT NULL), 0)::numeric AS avg_hours_create_to_take,
           COALESCE(AVG(EXTRACT(EPOCH FROM (accepted_at - COALESCE(taken_at, received_at)))/3600)
             FILTER (WHERE accepted_at IS NOT NULL AND COALESCE(taken_at, received_at) IS NOT NULL), 0)::numeric AS avg_hours_take_to_complete
         FROM orders`,
      ),
      pool.query(
        `WITH cat AS (
           SELECT
             c.id,
             c.name,
             COUNT(*)::int AS total_orders,
             COUNT(*) FILTER (WHERE o.order_status = 'completed')::int AS completed_orders,
             COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::int AS cancelled_orders
           FROM orders o
           LEFT JOIN categories c ON c.id = o.category_id
           GROUP BY c.id, c.name
         )
         SELECT *
         FROM cat
         ORDER BY total_orders DESC NULLS LAST
         LIMIT 8`,
      ),
      pool.query(
        `WITH h AS (
           SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS orders_count
           FROM orders
           GROUP BY 1
         ),
         d AS (
           SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS orders_count
           FROM orders
           GROUP BY 1
         ),
         t AS (
           SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS orders_count
           FROM orders
           WHERE created_at >= current_date - interval '29 day'
           GROUP BY 1
           ORDER BY 1
         )
         SELECT
          (SELECT json_agg(h ORDER BY h.orders_count DESC, h.hour ASC) FROM h) AS by_hour,
          (SELECT json_agg(d ORDER BY d.orders_count DESC, d.dow ASC) FROM d) AS by_day,
          (SELECT json_agg(t ORDER BY t.day ASC) FROM t) AS trend`,
      ),
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE COALESCE(payment_amount, budget, 0) < 50)::int AS lt_50,
          COUNT(*) FILTER (WHERE COALESCE(payment_amount, budget, 0) >= 50 AND COALESCE(payment_amount, budget, 0) < 200)::int AS from_50_199,
          COUNT(*) FILTER (WHERE COALESCE(payment_amount, budget, 0) >= 200 AND COALESCE(payment_amount, budget, 0) < 500)::int AS from_200_499,
          COUNT(*) FILTER (WHERE COALESCE(payment_amount, budget, 0) >= 500)::int AS gte_500
         FROM orders`,
      ),
    ]);
    const o = overview.rows[0] || {};
    const top = categories.rows || [];
    const timed = timing.rows[0] || {};
    const r = ranges.rows[0] || {};
    const topDemand = top[0] || null;
    const topCompleted = [...top].sort((a, b) => toInt(b.completed_orders) - toInt(a.completed_orders))[0] || null;
    const topCancelled = [...top].sort((a, b) => toInt(b.cancelled_orders) - toInt(a.cancelled_orders))[0] || null;
    const slowestCategory = [...top]
      .filter((x) => toInt(x.total_orders) > 0)
      .sort((a, b) => toInt(b.cancelled_orders) / toInt(b.total_orders) - toInt(a.cancelled_orders) / toInt(a.total_orders))[0] || null;
    const fastestCategory = [...top]
      .filter((x) => toInt(x.total_orders) > 0)
      .sort((a, b) => toInt(b.completed_orders) / toInt(b.total_orders) - toInt(a.completed_orders) / toInt(a.total_orders))[0] || null;

    return {
      totals: {
        totalOrders: toInt(o.total_orders),
        ordersToday: toInt(o.orders_today),
        ordersThisWeek: toInt(o.orders_this_week),
        ordersThisMonth: toInt(o.orders_this_month),
        completedOrders: toInt(o.completed_orders),
        pendingOrders: toInt(o.pending_orders),
        cancelledOrders: toInt(o.cancelled_orders),
        fixedOrders: toInt(o.fixed_orders),
        biddingOrders: toInt(o.bidding_orders),
        averageOrderValueJod: toNum(o.avg_order_value),
        completionRate: toNum(o.completion_rate),
        cancellationRate: toNum(o.cancellation_rate),
        ordersWaitingTooLong: toInt(o.waiting_too_long),
      },
      timing: {
        avgHoursCreateToTake: toNum(o.avg_hours_create_to_take),
        avgHoursTakeToComplete: toNum(o.avg_hours_take_to_complete),
        busiestHours: Array.isArray(timed.by_hour) ? timed.by_hour : [],
        busiestDays: Array.isArray(timed.by_day) ? timed.by_day : [],
        trendByDay: Array.isArray(timed.trend) ? timed.trend : [],
      },
      categories: {
        mostRequested: topDemand ? { categoryId: topDemand.id, name: topDemand.name, totalOrders: toInt(topDemand.total_orders) } : null,
        mostCompleted: topCompleted ? { categoryId: topCompleted.id, name: topCompleted.name, completedOrders: toInt(topCompleted.completed_orders) } : null,
        mostCancelled: topCancelled ? { categoryId: topCancelled.id, name: topCancelled.name, cancelledOrders: toInt(topCancelled.cancelled_orders) } : null,
        slowestCategory: slowestCategory ? { categoryId: slowestCategory.id, name: slowestCategory.name } : null,
        fastestCategory: fastestCategory ? { categoryId: fastestCategory.id, name: fastestCategory.name } : null,
        breakdown: top.map((x) => ({
          categoryId: x.id,
          name: x.name,
          totalOrders: toInt(x.total_orders),
          completedOrders: toInt(x.completed_orders),
          cancelledOrders: toInt(x.cancelled_orders),
        })),
      },
      orderValueRanges: {
        lessThan50: toInt(r.lt_50),
        from50To199: toInt(r.from_50_199),
        from200To499: toInt(r.from_200_499),
        aboveOrEqual500: toInt(r.gte_500),
      },
    };
  });
  return buildResult("orders", result);
}

async function getClientsIntelligence() {
  const result = await withTimeout("clients", async () => {
    const mainQuery = pool.query(
      `WITH c AS (
         SELECT id, created_at FROM users WHERE role = 'client'
       ),
       first_order AS (
         SELECT created_by_user_id AS client_id, MIN(created_at) AS first_order_at
         FROM orders
         WHERE source_type = 'client_created'
         GROUP BY 1
       ),
       stats AS (
         SELECT
           COUNT(*)::int AS total_clients,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('week', now()))::int AS new_clients_week,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS new_clients_month
         FROM c
       ),
       active_orders AS (
         SELECT
           created_by_user_id AS client_id,
           COUNT(*)::int AS orders_count,
           COUNT(*) FILTER (WHERE created_at >= now() - interval '30 day')::int AS orders_30d,
           COALESCE(SUM(COALESCE(payment_amount, budget, 0)), 0)::numeric AS spend
         FROM orders
         WHERE source_type = 'client_created'
         GROUP BY 1
       ),
       conv AS (
         SELECT
           COALESCE(100.0 * COUNT(*) FILTER (WHERE fo.first_order_at IS NOT NULL) / NULLIF(COUNT(*),0), 0)::numeric AS signup_to_first_order_rate
         FROM c
         LEFT JOIN first_order fo ON fo.client_id = c.id
       )
       SELECT
         s.total_clients,
         s.new_clients_week,
         s.new_clients_month,
         COALESCE((SELECT COUNT(*) FROM active_orders WHERE orders_count > 1), 0)::int AS returning_clients,
         COALESCE((SELECT COUNT(*) FROM c LEFT JOIN active_orders ao ON ao.client_id = c.id WHERE COALESCE(ao.orders_30d,0) = 0), 0)::int AS inactive_clients,
         conv.signup_to_first_order_rate
       FROM stats s, conv`,
    );
    const topsQuery = pool.query(
      `SELECT
         u.id AS client_id,
         u.first_name, u.father_name, u.family_name,
         COUNT(o.id)::int AS orders_count,
         COALESCE(SUM(COALESCE(o.payment_amount, o.budget, 0)), 0)::numeric AS spend
       FROM users u
       LEFT JOIN orders o ON o.created_by_user_id = u.id AND o.source_type = 'client_created'
       WHERE u.role = 'client'
       GROUP BY u.id
       ORDER BY orders_count DESC, spend DESC
       LIMIT 8`,
    );
    const trendQuery = pool.query(
      `SELECT date_trunc('week', created_at)::date AS week_start, COUNT(*)::int AS new_clients
       FROM users
       WHERE role = 'client' AND created_at >= current_date - interval '89 day'
       GROUP BY 1
       ORDER BY 1`,
    );
    const [{ rows }, tops, trend] = await Promise.all([mainQuery, topsQuery, trendQuery]);
    const s = rows[0] || {};
    return {
      totals: {
        totalClients: toInt(s.total_clients),
        newClientsThisWeek: toInt(s.new_clients_week),
        newClientsThisMonth: toInt(s.new_clients_month),
        returningClients: toInt(s.returning_clients),
        inactiveClients: toInt(s.inactive_clients),
        signupToFirstOrderRate: toNum(s.signup_to_first_order_rate),
      },
      topClients: tops.rows.map((x) => ({
        clientId: x.client_id,
        fullName: [x.first_name, x.father_name, x.family_name].filter(Boolean).join(" ").trim(),
        ordersCount: toInt(x.orders_count),
        spendJod: toNum(x.spend),
      })),
      signupTrendByWeek: trend.rows.map((x) => ({
        weekStart: x.week_start,
        newClients: toInt(x.new_clients),
      })),
    };
  });
  return buildResult("clients", result);
}

async function getFreelancersIntelligence() {
  const result = await withTimeout("freelancers", async () => {
    const [counts, performance, subscriptionState] = await Promise.all([
      pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE role = 'freelancer')::int AS total_freelancers,
          COUNT(*) FILTER (WHERE role = 'freelancer' AND is_active = TRUE)::int AS active_freelancers,
          COUNT(*) FILTER (WHERE role = 'freelancer' AND is_active = FALSE)::int AS inactive_freelancers
         FROM users`,
      ),
      pool.query(
        `SELECT
          u.id AS freelancer_id,
          u.first_name, u.father_name, u.family_name,
          COUNT(o.id)::int AS total_orders,
          COUNT(*) FILTER (WHERE o.order_status = 'completed')::int AS completed_orders,
          COUNT(*) FILTER (WHERE o.order_status IN ('assigned','in_progress','pending_client_review','ready_for_work'))::int AS pending_work_orders,
          COALESCE(SUM(COALESCE(o.payment_amount, o.budget, 0)) FILTER (WHERE o.order_status = 'completed'), 0)::numeric AS generated_revenue,
          COALESCE(100.0 * COUNT(*) FILTER (WHERE o.order_status = 'completed') / NULLIF(COUNT(o.id),0), 0)::numeric AS completion_rate
         FROM users u
         LEFT JOIN orders o ON o.assigned_freelancer_id = u.id
         WHERE u.role = 'freelancer'
         GROUP BY u.id
         ORDER BY completed_orders DESC, generated_revenue DESC
         LIMIT 10`,
      ),
      pool.query(
        `WITH sub AS (
          SELECT freelancer_user_id, actual_start_date
          FROM freelancer_subscriptions
          WHERE is_current = TRUE
        ),
        active_after_sub AS (
          SELECT DISTINCT o.assigned_freelancer_id AS freelancer_id
          FROM orders o
          INNER JOIN sub ON sub.freelancer_user_id = o.assigned_freelancer_id
          WHERE o.assigned_freelancer_id IS NOT NULL
            AND sub.actual_start_date IS NOT NULL
            AND o.created_at >= sub.actual_start_date
        )
        SELECT
          COUNT(*) FILTER (WHERE sub.freelancer_user_id IS NOT NULL)::int AS subscribed_freelancers,
          COUNT(*) FILTER (WHERE sub.freelancer_user_id IS NULL)::int AS non_subscribed_freelancers,
          COUNT(*) FILTER (
            WHERE sub.freelancer_user_id IS NOT NULL
              AND sub.actual_start_date IS NOT NULL
              AND sub.actual_start_date < now() - interval '30 day'
              AND NOT EXISTS (
                SELECT 1 FROM active_after_sub a WHERE a.freelancer_id = u.id
              )
          )::int AS inactive_after_subscription
        FROM users u
        LEFT JOIN sub ON sub.freelancer_user_id = u.id
        WHERE u.role = 'freelancer'`,
      ),
    ]);
    const c = counts.rows[0] || {};
    const s = subscriptionState.rows[0] || {};
    return {
      totals: {
        totalFreelancers: toInt(c.total_freelancers),
        activeFreelancers: toInt(c.active_freelancers),
        inactiveFreelancers: toInt(c.inactive_freelancers),
        subscribedFreelancers: toInt(s.subscribed_freelancers),
        nonSubscribedFreelancers: toInt(s.non_subscribed_freelancers),
        inactiveAfterSubscription: toInt(s.inactive_after_subscription),
      },
      topPerformers: performance.rows.map((x) => ({
        freelancerId: x.freelancer_id,
        fullName: [x.first_name, x.father_name, x.family_name].filter(Boolean).join(" ").trim(),
        totalOrders: toInt(x.total_orders),
        completedOrders: toInt(x.completed_orders),
        pendingWorkOrders: toInt(x.pending_work_orders),
        generatedRevenueJod: toNum(x.generated_revenue),
        completionRate: toNum(x.completion_rate),
      })),
    };
  });
  return buildResult("freelancers", result);
}

function mapPlanPeriodTrend(current, previous) {
  const c = toNum(current);
  const p = toNum(previous);
  if (c + p === 0) return null;
  const { changePct, trend } = computeTrend(c, p);
  return { current: c, previous: p, changePct, trend };
}

async function getSubscriptionsIntelligence() {
  const result = await withTimeout("subscriptions", async () => {
    const [totals, byPlan, planPeriodFlow, countries, trend] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_current = TRUE AND status = 'active')::int AS active_subscriptions,
           COUNT(*) FILTER (WHERE is_current = TRUE AND activation_status = 'company_pending')::int AS pending_activation,
           COUNT(*) FILTER (WHERE is_current = TRUE AND payment_status = 'pending')::int AS pending_payment,
           COUNT(*) FILTER (WHERE is_current = TRUE AND payment_status = 'failed')::int AS failed_payments
         FROM freelancer_subscriptions`,
      ),
      pool.query(
        `SELECT
           p.id AS plan_id,
           p.title AS plan_title,
           COUNT(fs.id)::int AS subscribers,
           COUNT(fs.id) FILTER (WHERE fs.status = 'active')::int AS active_subscribers,
           COALESCE(SUM(CASE WHEN fs.payment_status = 'paid' THEN p.price_jod ELSE 0 END), 0)::numeric AS revenue_jod
         FROM plans p
         LEFT JOIN freelancer_subscriptions fs ON fs.plan_id = p.id AND fs.is_current = TRUE
         GROUP BY p.id
         ORDER BY subscribers DESC, revenue_jod DESC`,
      ),
      pool.query(
        `SELECT
           fs.plan_id,
           COUNT(*)::int FILTER (
             WHERE COALESCE(fs.paid_at, fs.assigned_at) >= date_trunc('month', CURRENT_TIMESTAMP)
               AND COALESCE(fs.paid_at, fs.assigned_at) < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'
           ) AS subs_current_month,
           COUNT(*)::int FILTER (
             WHERE COALESCE(fs.paid_at, fs.assigned_at) >= date_trunc('month', CURRENT_TIMESTAMP) - interval '1 month'
               AND COALESCE(fs.paid_at, fs.assigned_at) < date_trunc('month', CURRENT_TIMESTAMP)
           ) AS subs_prev_month,
           COALESCE(SUM(
             CASE WHEN fs.payment_status = 'paid'
               AND COALESCE(fs.paid_at, fs.assigned_at) >= date_trunc('month', CURRENT_TIMESTAMP)
               AND COALESCE(fs.paid_at, fs.assigned_at) < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'
             THEN p.price_jod ELSE 0 END
           ), 0)::numeric AS revenue_current_month,
           COALESCE(SUM(
             CASE WHEN fs.payment_status = 'paid'
               AND COALESCE(fs.paid_at, fs.assigned_at) >= date_trunc('month', CURRENT_TIMESTAMP) - interval '1 month'
               AND COALESCE(fs.paid_at, fs.assigned_at) < date_trunc('month', CURRENT_TIMESTAMP)
             THEN p.price_jod ELSE 0 END
           ), 0)::numeric AS revenue_prev_month
         FROM freelancer_subscriptions fs
         JOIN plans p ON p.id = fs.plan_id
         WHERE fs.plan_id IS NOT NULL
         GROUP BY fs.plan_id`,
      ),
      pool.query(
        `SELECT
          COALESCE(NULLIF(upper(trim(u.billing_country)), ''), 'غير محدد') AS country_code,
          COUNT(*)::int AS subscribers
         FROM freelancer_subscriptions fs
         JOIN users u ON u.id = fs.freelancer_user_id
         WHERE fs.is_current = TRUE
         GROUP BY 1
         ORDER BY subscribers DESC
         LIMIT 10`,
      ),
      pool.query(
        `SELECT date_trunc('month', COALESCE(paid_at, assigned_at))::date AS month_start,
                COUNT(*)::int AS subscriptions_count,
                COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN pl.price_jod ELSE 0 END),0)::numeric AS revenue_jod
         FROM freelancer_subscriptions fs
         LEFT JOIN plans pl ON pl.id = fs.plan_id
         WHERE COALESCE(paid_at, assigned_at) >= date_trunc('month', now()) - interval '11 month'
         GROUP BY 1
         ORDER BY 1`,
      ),
    ]);
    const t = totals.rows[0] || {};
    const periodByPlan = new Map(
      planPeriodFlow.rows.map((row) => [String(row.plan_id), row]),
    );
    return {
      totals: {
        activeSubscriptions: toInt(t.active_subscriptions),
        pendingActivation: toInt(t.pending_activation),
        pendingPayment: toInt(t.pending_payment),
        failedPayments: toInt(t.failed_payments),
      },
      byPlan: byPlan.rows.map((x) => {
        const period = periodByPlan.get(String(x.plan_id));
        return {
          planId: x.plan_id,
          planTitle: x.plan_title,
          subscribers: toInt(x.subscribers),
          activeSubscribers: toInt(x.active_subscribers),
          revenueJod: toNum(x.revenue_jod),
          subscriberPeriodTrend: period
            ? mapPlanPeriodTrend(period.subs_current_month, period.subs_prev_month)
            : null,
          revenuePeriodTrend: period
            ? mapPlanPeriodTrend(period.revenue_current_month, period.revenue_prev_month)
            : null,
        };
      }),
      countries: countries.rows.map((x) => ({
        ...formatCountryRow(x.country_code),
        subscribers: toInt(x.subscribers),
      })),
      trendByMonth: trend.rows.map((x) => ({
        monthStart: x.month_start,
        subscriptionsCount: toInt(x.subscriptions_count),
        revenueJod: toNum(x.revenue_jod),
      })),
    };
  });
  return buildResult("subscriptions", result);
}

async function getCoursesIntelligence() {
  const result = await withTimeout("courses", async () => {
    const [totals, topCourses, enrollmentTrend] = await Promise.all([
      pool.query(
        `WITH c AS (
           SELECT
             COUNT(*)::int AS total_courses,
             COUNT(*) FILTER (WHERE is_active = TRUE)::int AS published_courses,
             COUNT(*) FILTER (WHERE is_active = FALSE)::int AS draft_courses
           FROM courses
         ),
         lessons AS (
           SELECT COUNT(*)::int AS total_lessons FROM course_lessons
         ),
         students AS (
           SELECT COUNT(DISTINCT freelancer_id)::int AS students_enrolled FROM course_assignments
         ),
         finals AS (
           SELECT
             COUNT(*) FILTER (WHERE audit_submitted_at IS NOT NULL)::int AS final_exam_submissions,
             COUNT(*) FILTER (WHERE completed_at IS NOT NULL)::int AS final_exam_completed
           FROM course_assignments
         ),
         lesson_totals AS (
           SELECT course_id, COUNT(*)::int AS total_lessons
           FROM course_lessons
           WHERE is_active = TRUE
           GROUP BY course_id
         ),
         progress_totals AS (
           SELECT course_id, freelancer_id, COUNT(*)::int AS completed_lessons
           FROM course_lesson_progress
           GROUP BY course_id, freelancer_id
         ),
         stuck AS (
           SELECT COUNT(*)::int AS stuck_above_80
           FROM course_assignments a
           INNER JOIN lesson_totals l ON l.course_id = a.course_id
           LEFT JOIN progress_totals p
             ON p.course_id = a.course_id AND p.freelancer_id = a.freelancer_id
           WHERE l.total_lessons > 0
             AND (100.0 * COALESCE(p.completed_lessons, 0) / l.total_lessons) >= 80
             AND COALESCE(p.completed_lessons, 0) < l.total_lessons
         ),
         learner_span AS (
           SELECT
             p.course_id,
             p.freelancer_id,
             MIN(p.completed_at) AS first_at,
             MAX(p.completed_at) AS last_at,
             COUNT(*)::int AS done
           FROM course_lesson_progress p
           GROUP BY p.course_id, p.freelancer_id
         ),
         completed_spans AS (
           SELECT EXTRACT(EPOCH FROM (ls.last_at - ls.first_at))::double precision AS span_sec
           FROM learner_span ls
           INNER JOIN lesson_totals lt ON lt.course_id = ls.course_id
           WHERE lt.total_lessons > 0
             AND ls.done >= lt.total_lessons
             AND ls.done > 1
             AND ls.last_at > ls.first_at
         ),
         avg_learning AS (
           SELECT AVG(span_sec)::double precision AS avg_completion_duration_seconds
           FROM completed_spans
           WHERE span_sec > 0
         )
         SELECT c.*, lessons.*, students.*, finals.*, stuck.*, avg_learning.avg_completion_duration_seconds
         FROM c
         CROSS JOIN lessons
         CROSS JOIN students
         CROSS JOIN finals
         CROSS JOIN stuck
         CROSS JOIN avg_learning`,
      ),
      pool.query(
        `WITH stats AS (
           SELECT
             c.id,
             c.title,
             COUNT(DISTINCT a.freelancer_id)::int AS enrolled,
             COUNT(DISTINCT a.freelancer_id) FILTER (WHERE a.completed_at IS NOT NULL)::int AS completed_students
           FROM courses c
           LEFT JOIN course_assignments a ON a.course_id = c.id
           GROUP BY c.id
         )
         SELECT *,
           COALESCE(100.0 * completed_students / NULLIF(enrolled,0), 0)::numeric AS completion_rate
         FROM stats
         ORDER BY enrolled DESC, completion_rate DESC
         LIMIT 10`,
      ),
      pool.query(
        `SELECT date_trunc('month', assigned_at)::date AS month_start,
                COUNT(*)::int AS enrollments
         FROM course_assignments
         WHERE assigned_at >= date_trunc('month', now()) - interval '11 month'
         GROUP BY 1
         ORDER BY 1`,
      ),
    ]);
    const t = totals.rows[0] || {};
    const list = topCourses.rows || [];
    const mostJoined = list[0] || null;
    const mostCompleted = [...list].sort((a, b) => toInt(b.completed_students) - toInt(a.completed_students))[0] || null;
    const lowestCompletion = [...list].sort((a, b) => toNum(a.completion_rate) - toNum(b.completion_rate))[0] || null;
    return {
      totals: {
        totalCourses: toInt(t.total_courses),
        publishedCourses: toInt(t.published_courses),
        draftCourses: toInt(t.draft_courses),
        archivedCourses: 0,
        totalLessons: toInt(t.total_lessons),
        studentsEnrolled: toInt(t.students_enrolled),
        finalExamSubmissions: toInt(t.final_exam_submissions),
        finalExamCompletionRate: toInt(t.final_exam_submissions) > 0
          ? (toInt(t.final_exam_completed) / toInt(t.final_exam_submissions)) * 100
          : 0,
        stuckAbove80Percent: toInt(t.stuck_above_80),
        averageLearningDurationSeconds:
          t.avg_completion_duration_seconds != null && Number(t.avg_completion_duration_seconds) > 0
            ? Number(t.avg_completion_duration_seconds)
            : null,
      },
      topCourses: list.map((x) => ({
        courseId: x.id,
        title: x.title,
        enrolled: toInt(x.enrolled),
        completedStudents: toInt(x.completed_students),
        completionRate: toNum(x.completion_rate),
      })),
      highlights: {
        mostJoinedCourse: mostJoined ? { courseId: mostJoined.id, title: mostJoined.title } : null,
        mostCompletedCourse: mostCompleted ? { courseId: mostCompleted.id, title: mostCompleted.title } : null,
        lowestCompletionCourse: lowestCompletion ? { courseId: lowestCompletion.id, title: lowestCompletion.title } : null,
      },
      enrollmentTrendByMonth: enrollmentTrend.rows.map((x) => ({
        monthStart: x.month_start,
        enrollments: toInt(x.enrollments),
      })),
    };
  });
  return buildResult("courses", result);
}

async function getCategoriesIntelligence() {
  const result = await withTimeout("categories", async () => {
    const { rows } = await pool.query(
      `WITH order_stats AS (
         SELECT
           c.id,
           c.name,
           COUNT(o.id)::int AS total_orders,
           COUNT(*) FILTER (WHERE o.order_status = 'completed')::int AS completed_orders,
           COUNT(*) FILTER (WHERE o.order_status = 'cancelled')::int AS cancelled_orders,
           COALESCE(AVG(CASE WHEN o.payment_amount > 0 THEN o.payment_amount WHEN o.budget > 0 THEN o.budget END), 0)::numeric AS avg_order_value
         FROM categories c
         LEFT JOIN orders o ON o.category_id = c.id
         GROUP BY c.id
       ),
       supply AS (
         SELECT unnest(freelancer_categories)::text AS category_name, COUNT(*)::int AS freelancer_supply
         FROM users
         WHERE role = 'freelancer' AND freelancer_categories IS NOT NULL
         GROUP BY 1
       )
       SELECT
         os.*,
         COALESCE(s.freelancer_supply, 0)::int AS freelancer_supply
       FROM order_stats os
       LEFT JOIN supply s ON lower(trim(s.category_name)) = lower(trim(os.name))
       ORDER BY os.total_orders DESC, os.name ASC`,
    );
    const demandSorted = [...rows].sort((a, b) => toInt(b.total_orders) - toInt(a.total_orders));
    const cancellationSorted = [...rows].sort((a, b) => toInt(b.cancelled_orders) - toInt(a.cancelled_orders));
    const valueSorted = [...rows].sort((a, b) => toNum(b.avg_order_value) - toNum(a.avg_order_value));
    const shortage = [...rows]
      .filter((x) => toInt(x.total_orders) > 0)
      .sort((a, b) => {
        const ar = toInt(a.total_orders) / Math.max(1, toInt(a.freelancer_supply));
        const br = toInt(b.total_orders) / Math.max(1, toInt(b.freelancer_supply));
        return br - ar;
      });
    return {
      mostRequested: demandSorted.slice(0, 6).map((x) => ({ categoryId: x.id, name: x.name, totalOrders: toInt(x.total_orders) })),
      leastRequested: [...demandSorted].reverse().slice(0, 6).map((x) => ({ categoryId: x.id, name: x.name, totalOrders: toInt(x.total_orders) })),
      highestValue: valueSorted.slice(0, 6).map((x) => ({ categoryId: x.id, name: x.name, averageOrderValueJod: toNum(x.avg_order_value) })),
      highestCompletion: [...rows]
        .filter((x) => toInt(x.total_orders) > 0)
        .sort((a, b) => toInt(b.completed_orders) / toInt(b.total_orders) - toInt(a.completed_orders) / toInt(a.total_orders))
        .slice(0, 6)
        .map((x) => ({ categoryId: x.id, name: x.name })),
      highestCancellation: cancellationSorted.slice(0, 6).map((x) => ({ categoryId: x.id, name: x.name, cancelledOrders: toInt(x.cancelled_orders) })),
      demandVsSupply: rows.map((x) => ({
        categoryId: x.id,
        name: x.name,
        demandOrders: toInt(x.total_orders),
        freelancerSupply: toInt(x.freelancer_supply),
      })),
      potentialShortage: shortage.slice(0, 6).map((x) => ({
        categoryId: x.id,
        name: x.name,
        demandOrders: toInt(x.total_orders),
        freelancerSupply: toInt(x.freelancer_supply),
      })),
    };
  });
  return buildResult("categories", result);
}

async function getFinancialIntelligence() {
  const result = await withTimeout("financial", async () => {
    const [summary, trend] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_claims,
           COUNT(*) FILTER (WHERE status = 'accepted')::int AS approved_claims,
           COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_claims,
           COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected_claims,
           COALESCE(SUM(total_price_snapshot), 0)::numeric AS total_claim_amount,
           COALESCE(AVG(total_price_snapshot), 0)::numeric AS avg_claim_amount,
           COUNT(*) FILTER (WHERE status = 'pending' AND submitted_at < now() - interval '7 day')::int AS claims_waiting_too_long
         FROM financial_claims`,
      ),
      pool.query(
        `SELECT date_trunc('month', submitted_at)::date AS month_start,
                COUNT(*)::int AS claims_count,
                COALESCE(SUM(total_price_snapshot), 0)::numeric AS amount_jod
         FROM financial_claims
         WHERE submitted_at >= date_trunc('month', now()) - interval '11 month'
         GROUP BY 1
         ORDER BY 1`,
      ),
    ]);
    const s = summary.rows[0] || {};
    return {
      totals: {
        pendingClaims: toInt(s.pending_claims),
        approvedClaims: toInt(s.approved_claims),
        paidClaims: toInt(s.paid_claims),
        rejectedClaims: toInt(s.rejected_claims),
        totalClaimAmountJod: toNum(s.total_claim_amount),
        averageClaimAmountJod: toNum(s.avg_claim_amount),
        claimsWaitingTooLong: toInt(s.claims_waiting_too_long),
      },
      paymentTrendByMonth: trend.rows.map((x) => ({
        monthStart: x.month_start,
        claimsCount: toInt(x.claims_count),
        amountJod: toNum(x.amount_jod),
      })),
    };
  });
  return buildResult("financial", result);
}

async function getAttentionIntelligence() {
  const result = await withTimeout("attention", async () => {
    const [base, lowCourses] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM freelancer_subscriptions WHERE is_current = TRUE AND activation_status = $1) AS pending_activations,
          (SELECT COUNT(*)::int FROM freelancer_subscriptions WHERE is_current = TRUE AND payment_status IN ('pending','failed')) AS pending_or_failed_payments,
          (SELECT COUNT(*)::int FROM financial_claims WHERE status = 'pending') AS pending_claims_review,
          (SELECT COUNT(*)::int FROM orders
            WHERE order_status IN ('published','open_for_freelancers','open_for_bids','pending_payment','awaiting_payment_after_bid_selection')
              AND created_at < now() - interval '72 hour') AS orders_waiting_too_long,
          (SELECT COUNT(*)::int
            FROM users u
            JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
            WHERE u.role = 'freelancer'
              AND fs.actual_start_date IS NOT NULL
              AND fs.actual_start_date < now() - interval '30 day'
              AND NOT EXISTS (
                SELECT 1 FROM orders o WHERE o.assigned_freelancer_id = u.id AND o.created_at >= fs.actual_start_date
              )
          ) AS inactive_subscribed_freelancers`,
        [SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING],
      ),
      pool.query(
        `WITH course_stats AS (
          SELECT
            c.id,
            c.title,
            COUNT(a.freelancer_id)::int AS enrolled,
            COUNT(a.freelancer_id) FILTER (WHERE a.completed_at IS NOT NULL)::int AS completed
          FROM courses c
          LEFT JOIN course_assignments a ON a.course_id = c.id
          GROUP BY c.id
        )
        SELECT id, title
        FROM course_stats
        WHERE enrolled >= 5 AND COALESCE(100.0 * completed / NULLIF(enrolled,0),0) < 35
        ORDER BY enrolled DESC
        LIMIT 5`,
      ),
    ]);
    const b = base.rows[0] || {};
    const alerts = [
      {
        key: "pending_activations",
        title: "تفعيل اشتراكات بانتظار الموافقة",
        count: toInt(b.pending_activations),
        path: "/dashboard/super-admin/subscriptions/activation",
      },
      {
        key: "pending_or_failed_payments",
        title: "مدفوعات اشتراكات عالقة",
        count: toInt(b.pending_or_failed_payments),
        path: "/dashboard/super-admin/subscriptions",
      },
      {
        key: "pending_claims_review",
        title: "مطالبات مالية بانتظار المراجعة",
        count: toInt(b.pending_claims_review),
        path: "/dashboard/super-admin/financial-claims",
      },
      {
        key: "orders_waiting_too_long",
        title: "طلبات متأخرة دون معالجة",
        count: toInt(b.orders_waiting_too_long),
        path: "/dashboard/super-admin/orders",
      },
      {
        key: "inactive_subscribed_freelancers",
        title: "مستقلون مشتركون بلا نشاط",
        count: toInt(b.inactive_subscribed_freelancers),
        path: "/dashboard/super-admin/subscriptions",
      },
      {
        key: "low_performing_courses",
        title: "دورات منخفضة الأداء",
        count: lowCourses.rowCount || 0,
        path: "/dashboard/super-admin/courses",
      },
    ];
    return {
      alerts,
      lowPerformingCourses: lowCourses.rows.map((x) => ({ courseId: x.id, title: x.title })),
      totalAttentionItems: alerts.reduce((sum, x) => sum + toInt(x.count), 0),
    };
  });
  return buildResult("attention", result);
}

async function getActivityIntelligence() {
  const result = await withTimeout("activity", async () => {
    const posthog = await superAdminAnalyticsOverviewService.getPosthogProductAnalytics({
      range: "30d",
      topLimit: 10,
    });
    return {
      visitorsToday: posthog?.kpis?.visitorsToday ?? null,
      activeUsersToday: posthog?.kpis?.activeUsersToday ?? null,
      ordersToday: posthog?.kpis?.ordersToday ?? null,
      topPages: posthog?.topPages || [],
      trends: posthog?.trends || { visitorsByDay: [], ordersByDay: [] },
      events: posthog?.events || {},
      conversion: posthog?.conversion || {},
      meta: posthog?.meta || {},
    };
  });
  return buildResult("activity", result, {
    visitorsToday: null,
    activeUsersToday: null,
    ordersToday: null,
    topPages: [],
    trends: { visitorsByDay: [], ordersByDay: [] },
    events: {},
    conversion: {},
    meta: { posthogConfigured: false, posthogError: "تعذر تحميل بيانات PostHog حالياً." },
  });
}

module.exports = {
  getSummaryIntelligence,
  getExecutiveKpiComparison,
  getOrdersIntelligence,
  getClientsIntelligence,
  getFreelancersIntelligence,
  getSubscriptionsIntelligence,
  getCoursesIntelligence,
  getCategoriesIntelligence,
  getFinancialIntelligence,
  getAttentionIntelligence,
  getActivityIntelligence,
};

