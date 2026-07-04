/**
 * Super Admin dashboard — focused "recent paid subscriptions" feed.
 * Read-only: newest current paid subscriptions plus lightweight counts for the
 * home dashboard section and the attention/notification system.
 */

const { pool } = require("../config/db");
const { mapSubscription } = require("./subscriptionsService");
const { getActivationFeeStatus } = require("./subscriptionActivationFeeService");

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;

function toCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

function clampLimit(limit) {
  const n = Math.trunc(Number(limit) || DEFAULT_LIMIT);
  if (n < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, n);
}

function emptyFocus() {
  return {
    recent: [],
    countToday: 0,
    countThisWeek: 0,
    needsFollowUpCount: 0,
  };
}

/**
 * Attach the one-time subscription activation fee (رسوم تفعيل الاشتراك) to each item.
 * Best-effort per freelancer: a failure leaves activationFee = null without breaking the list.
 */
async function attachActivationFees(subs) {
  await Promise.all(
    (subs || []).map(async (sub) => {
      try {
        const status = await getActivationFeeStatus(sub.freelancerUserId);
        sub.activationFee = {
          amountJod: status.amountJod,
          paid: Boolean(status.isCurrent),
          paidAt: status.paidAt || null,
        };
      } catch {
        sub.activationFee = null;
      }
    }),
  );
}

/**
 * Newest current paid subscriptions + counts.
 * Never throws: resolves to safe defaults on error so the home bundle stays healthy.
 * @param {{ limit?: number }} [opts]
 */
async function getPaidSubscriptionsFocus({ limit = DEFAULT_LIMIT } = {}) {
  const lim = clampLimit(limit);
  try {
    const [listRes, countsRes] = await Promise.all([
      pool.query(
        `SELECT
           fs.*,
           u.first_name AS freelancer_first_name,
           u.father_name AS freelancer_father_name,
           u.family_name AS freelancer_family_name,
           u.email AS freelancer_email,
           u.account_id AS freelancer_account_id,
           u.phone AS freelancer_phone,
           u.whatsapp AS freelancer_whatsapp,
           u.country AS freelancer_country,
           u.billing_country AS freelancer_billing_country,
           p.name AS plan_name,
           p.title AS plan_title,
           p.duration_days AS plan_duration_days,
           p.price_jod AS plan_price_jod
         FROM freelancer_subscriptions fs
         LEFT JOIN users u ON u.id = fs.freelancer_user_id
         LEFT JOIN plans p ON p.id = fs.plan_id
         WHERE fs.is_current = TRUE
           AND fs.payment_status = 'paid'
         ORDER BY COALESCE(fs.paid_at, fs.assigned_at, fs.created_at) DESC, fs.id DESC
         LIMIT $1`,
        [lim],
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE fs.paid_at >= date_trunc('day', now()))::int AS count_today,
           COUNT(*) FILTER (WHERE fs.paid_at >= date_trunc('week', now()))::int AS count_this_week,
           COUNT(*) FILTER (WHERE fs.activation_status = 'company_pending')::int AS needs_follow_up
         FROM freelancer_subscriptions fs
         WHERE fs.is_current = TRUE
           AND fs.payment_status = 'paid'`,
      ),
    ]);

    const counts = countsRes.rows[0] || {};
    const recent = listRes.rows.map(mapSubscription).filter(Boolean);
    await attachActivationFees(recent);
    return {
      recent,
      countToday: toCount(counts.count_today),
      countThisWeek: toCount(counts.count_this_week),
      needsFollowUpCount: toCount(counts.needs_follow_up),
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[superadmin-dashboard] paid subscriptions focus failed:", err?.message || err);
    return emptyFocus();
  }
}

module.exports = {
  getPaidSubscriptionsFocus,
};
