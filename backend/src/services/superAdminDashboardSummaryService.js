/**
 * Super Admin dashboard ops summary — cheap COUNT aggregates for attention queues.
 */

const { pool } = require("../config/db");
const notificationService = require("./notificationService");
const publicHomeOrderStatsService = require("./publicHomeOrderStatsService");
const { CLAIM_STATUSES } = require("./financialClaimsService");
const { SUBSCRIPTION_ACTIVATION_STATUSES } = require("./subscriptionsService");

const INTERNAL_ORDER_SOURCES = Object.freeze(["admin_created", "super_admin_created"]);

function toCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

/** Matches listClaimsForSuperAdmin({ status: 'pending' }). */
async function countPendingFinancialClaims() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM financial_claims WHERE status = $1`,
    [CLAIM_STATUSES.PENDING],
  );
  return toCount(rows[0]?.n);
}

/**
 * Matches AdminSubscriptionsActivationPage client filter:
 * activation === company_pending && payment in paid|pending|not_required|empty
 */
async function countSubscriptionsAwaitingActivation() {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM freelancer_subscriptions
     WHERE activation_status = $1
       AND (
         payment_status IN ('paid', 'pending', 'not_required')
         OR payment_status IS NULL
         OR payment_status = ''
       )`,
    [SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING],
  );
  return toCount(rows[0]?.n);
}

/** Internal admin orders with at least one pending order_claim. */
async function countInternalOrdersWithPendingClaims() {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT o.id)::int AS n
     FROM orders o
     INNER JOIN order_claims oc ON oc.order_id = o.id AND oc.status = 'pending'
     WHERE o.source_type = ANY($1::text[])`,
    [INTERNAL_ORDER_SOURCES],
  );
  return toCount(rows[0]?.n);
}

async function safeCount(label, fn) {
  try {
    return { ok: true, value: toCount(await fn()) };
  } catch (err) {
    return { ok: false, value: null, error: err?.message || String(err), label };
  }
}

async function safePlatformOrders() {
  const label = "platformOrders";
  try {
    const counts = await publicHomeOrderStatsService.getPublicHomeOrderCounts();
    return {
      ok: true,
      label,
      value: {
        openProjects: toCount(counts?.openProjects),
        inProgressProjects: toCount(counts?.inProgressProjects),
        completedProjects: toCount(counts?.completedProjects),
      },
    };
  } catch (err) {
    return { ok: false, value: null, error: err?.message || String(err), label };
  }
}

async function getDashboardSummary({ userId }) {
  const updatedAt = new Date().toISOString();
  const sectionErrors = {};

  const [claimsR, activationsR, internalR, unreadR, platformR] = await Promise.all([
    safeCount("financialClaimsPending", countPendingFinancialClaims),
    safeCount("subscriptionsAwaitingActivation", countSubscriptionsAwaitingActivation),
    safeCount("internalOrdersPendingClaims", countInternalOrdersWithPendingClaims),
    safeCount("unreadNotifications", () => notificationService.getUnreadCount(userId)),
    safePlatformOrders(),
  ]);

  for (const result of [claimsR, activationsR, internalR, unreadR, platformR]) {
    if (!result.ok) {
      sectionErrors[result.label] = result.error;
    }
  }

  const platform = platformR.ok
    ? platformR.value
    : { openProjects: 0, inProgressProjects: 0, completedProjects: 0 };

  return {
    updatedAt,
    attention: {
      financialClaimsPending: claimsR.value,
      subscriptionsAwaitingActivation: activationsR.value,
      internalOrdersPendingClaims: internalR.value,
      unreadNotifications: unreadR.value,
    },
    platformOrders: platform,
    ...(Object.keys(sectionErrors).length ? { meta: { sectionErrors } } : {}),
  };
}

module.exports = {
  getDashboardSummary,
  countPendingFinancialClaims,
  countSubscriptionsAwaitingActivation,
  countInternalOrdersWithPendingClaims,
};
