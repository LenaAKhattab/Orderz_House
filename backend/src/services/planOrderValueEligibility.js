/**
 * Central plan ↔ real order value eligibility (catalog-driven).
 *
 * Business rules:
 * - Fixed orders: compare `orders.budget` (JOD) to plan [minOrderValue, maxOrderValue].
 * - Bidding orders: compare plan range to order [bid_budget_min, bid_budget_max] via interval overlap
 *   (freelancer may bid only when client budget band overlaps subscription band).
 * - Free plan (id 1): catalog lists 3–7 د.أ for display, but real orders remain fake-only
 *   (`blocksRealOrders`); pool/claim/bid on real orders are blocked before range checks apply.
 */
const {
  ORDERZHOUSE_PLANS_BY_ID,
  isOrderzhouseFreePlan,
} = require("../constants/orderzhousePlansCatalog");

function parseJod(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePlanRange(planId, row) {
  const minOrderValue = parseJod(row?.minOrderValue ?? row?.orderValueMinJod ?? row?.order_value_min_jod);
  const maxOrderValueRaw = row?.maxOrderValue ?? row?.orderValueMaxJod ?? row?.order_value_max_jod;
  const maxOrderValue = maxOrderValueRaw === null || maxOrderValueRaw === undefined || maxOrderValueRaw === ""
    ? null
    : parseJod(maxOrderValueRaw);
  const id = Number(planId);
  return {
    planId: id,
    minOrderValue,
    maxOrderValue,
    /** Stronger than catalog range: free tier must not access real marketplace orders. */
    blocksRealOrders: isOrderzhouseFreePlan(id),
  };
}

function getPlanOrderValueRange(planId) {
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return null;
  const catalog = ORDERZHOUSE_PLANS_BY_ID[id];
  if (catalog) return normalizePlanRange(id, catalog);
  return null;
}

async function getPlanOrderValueRangeFromDb(planId) {
  const { pool } = require("../config/db");
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await pool.query(
    `SELECT id, name, order_value_min_jod, order_value_max_jod
     FROM plans
     WHERE id = $1::bigint AND deleted_at IS NULL
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  return normalizePlanRange(id, rows[0]);
}

async function resolvePlanOrderValueRange(planId) {
  return getPlanOrderValueRange(planId) || (await getPlanOrderValueRangeFromDb(planId));
}

/**
 * Interval overlap: order [oMin, oMax] vs plan [pMin, pMax] (pMax null = open-ended).
 */
function budgetRangesOverlap(pMin, pMax, oMin, oMax) {
  const planMin = parseJod(pMin);
  const planMax = parseJod(pMax);
  const orderMin = parseJod(oMin);
  const orderMax = parseJod(oMax);
  if (planMin == null) return false;
  if (orderMin == null && orderMax == null) return false;
  const effectiveOrderMin = orderMin ?? orderMax;
  const effectiveOrderMax = orderMax ?? orderMin;
  if (effectiveOrderMin == null || effectiveOrderMax == null) return false;
  if (effectiveOrderMin > effectiveOrderMax) return false;
  if (effectiveOrderMax < planMin) return false;
  if (planMax != null && effectiveOrderMin > planMax) return false;
  return true;
}

function isSingleValueInPlanRange(range, value) {
  if (!range) return false;
  const v = parseJod(value);
  if (v == null) return false;
  const min = parseJod(range.minOrderValue);
  const max = parseJod(range.maxOrderValue);
  if (min == null) return false;
  if (v < min) return false;
  if (max != null && v > max) return false;
  return true;
}

function isOrderRowAllowedForPlanRange(orderRow, range) {
  if (!orderRow || !range) return false;
  const projectType = String(orderRow.project_type || orderRow.projectType || "").trim();
  if (projectType === "fixed") {
    return isSingleValueInPlanRange(range, orderRow.budget);
  }
  if (projectType === "bidding") {
    return budgetRangesOverlap(
      range.minOrderValue,
      range.maxOrderValue,
      orderRow.bid_budget_min,
      orderRow.bid_budget_max,
    );
  }
  return false;
}

function isOrderValueAllowedForPlan(planId, orderLike) {
  const range = getPlanOrderValueRange(planId);
  return isPlanValueAllowedForOrder(orderLike, range);
}

async function getFreelancerPlanOrderValueRange(freelancerUserId) {
  const subscriptionsService = require("./subscriptionsService");
  const sub = await subscriptionsService.getCurrentSubscriptionForFreelancer(freelancerUserId);
  if (!sub?.planId) return null;
  return resolvePlanOrderValueRange(sub.planId);
}

function buildPlanOrderValueWhereClause(alias, minParamIndex, maxParamIndex) {
  const a = alias || "o";
  return `(
    (${a}.project_type = 'fixed'
      AND ${a}.budget IS NOT NULL
      AND ${a}.budget >= $${minParamIndex}::numeric
      AND ($${maxParamIndex}::numeric IS NULL OR ${a}.budget <= $${maxParamIndex}::numeric))
    OR
    (${a}.project_type = 'bidding'
      AND ${a}.bid_budget_min IS NOT NULL
      AND ${a}.bid_budget_max IS NOT NULL
      AND ${a}.bid_budget_min > 0
      AND ${a}.bid_budget_max >= ${a}.bid_budget_min
      AND ${a}.bid_budget_max >= $${minParamIndex}::numeric
      AND ($${maxParamIndex}::numeric IS NULL OR ${a}.bid_budget_min <= $${maxParamIndex}::numeric))
  )`;
}

/**
 * Append SQL AND-clause for real orders matching plan value band (fixed + bidding).
 * Pushes [min, max] onto `params` when omitted from caller.
 */
function appendSqlPlanOrderValueFilter(whereParts, params, alias, range) {
  if (!range || range.blocksRealOrders) return { applied: false };
  const min = parseJod(range.minOrderValue);
  if (min == null) return { applied: false };
  params.push(min);
  params.push(range.maxOrderValue != null ? parseJod(range.maxOrderValue) : null);
  const minIdx = params.length - 1;
  const maxIdx = params.length;
  whereParts.push(buildPlanOrderValueWhereClause(alias, minIdx, maxIdx));
  return { applied: true, minParamIndex: minIdx, maxParamIndex: maxIdx };
}

function formatPlanRangeLabel(range) {
  if (!range) return null;
  if (range.blocksRealOrders) {
    return "الاشتراك المجاني — الطلبات الحقيقية تتطلب ترقية الاشتراك";
  }
  const min = parseJod(range.minOrderValue);
  const max = parseJod(range.maxOrderValue);
  if (min != null && max != null) return `من ${min} إلى ${max} د.أ`;
  if (min != null) return `من ${min} د.أ وأكثر`;
  return null;
}

function normalizeOrderLikeForPlanCheck(orderLike) {
  if (!orderLike || typeof orderLike !== "object") return {};
  return {
    project_type: orderLike.project_type ?? orderLike.projectType,
    budget: orderLike.budget,
    bid_budget_min: orderLike.bid_budget_min ?? orderLike.bidBudgetMin,
    bid_budget_max: orderLike.bid_budget_max ?? orderLike.bidBudgetMax,
    orderSource: orderLike.orderSource ?? orderLike.order_source,
  };
}

function isPlanValueAllowedForOrder(orderLike, range) {
  if (!range) return false;
  const norm = normalizeOrderLikeForPlanCheck(orderLike);
  const isFake = norm.orderSource === "fake";
  if (!isFake && range.blocksRealOrders) return false;
  return isOrderRowAllowedForPlanRange(norm, range);
}

/**
 * Pool UI eligibility (visibility vs action). Real + fake/training use catalog money bands.
 * Free plan: real orders stay blocked by blocksRealOrders; fake orders use 3–7 د.أ band only.
 */
function computePoolOrderPlanEligibility(orderLike, range) {
  const norm = normalizeOrderLikeForPlanCheck(orderLike);
  const isFake = norm.orderSource === "fake";
  const allowed = isPlanValueAllowedForOrder(orderLike, range);
  const blocksReal = !isFake && (!range || range.blocksRealOrders);
  const locked = !allowed || blocksReal;

  let lockReason = null;
  if (blocksReal) {
    lockReason = "غير متاح لباقتك";
  } else if (!allowed) {
    lockReason = "خارج نطاق قيمة طلبات باقتك";
  }

  const requiredPlanLabel = formatPlanRangeLabel(range);
  const requiredPlanRange =
    range && !range.blocksRealOrders
      ? {
          minOrderValue: parseJod(range.minOrderValue),
          maxOrderValue: parseJod(range.maxOrderValue),
        }
      : null;

  const projectType = String(norm.project_type || "").trim();
  const pricedBidding =
    projectType === "bidding" &&
    norm.bid_budget_min != null &&
    norm.bid_budget_max != null;

  return {
    canViewDetails: !locked,
    canClaim: !locked && projectType === "fixed",
    canBid: !locked && pricedBidding,
    isLockedByPlan: locked,
    lockReason,
    requiredPlanRange,
    requiredPlanLabel,
  };
}

async function enrichFreelancerPoolOrdersPlanEligibility(orders, freelancerUserId) {
  const range = await getFreelancerPlanOrderValueRange(freelancerUserId);
  if (!Array.isArray(orders)) return [];
  return orders.map((order) => {
    const withSource = { ...order, orderSource: order?.orderSource || "real" };
    const poolEligibility = computePoolOrderPlanEligibility(withSource, range);
    return { ...withSource, poolEligibility };
  });
}

async function loadFakeOrderRow(orderId, clientMaybe) {
  const oid = Number(orderId);
  if (!Number.isInteger(oid) || oid < 1) return null;
  const runner = clientMaybe || require("../config/db").pool;
  const { rows } = await runner.query(`SELECT * FROM fake_orders WHERE id = $1::bigint LIMIT 1`, [oid]);
  return rows[0] || null;
}

async function assertFreelancerMayAccessFakeOrderByPlan(freelancerUserId, orderOrId, client) {
  const runner = client || require("../config/db").pool;
  let order = orderOrId;
  if (order == null || (typeof orderOrId !== "object" && orderOrId != null)) {
    const oid = Number(typeof orderOrId === "object" ? orderOrId?.id : orderOrId);
    order = await loadFakeOrderRow(oid, runner);
  }
  if (!order) {
    const err = new Error("Order not found.");
    err.statusCode = 404;
    throw err;
  }

  const range = await getFreelancerPlanOrderValueRange(freelancerUserId);
  if (!range) {
    const err = new Error("لا يوجد اشتراك نشط يسمح بالوصول إلى هذا الطلب.");
    err.statusCode = 403;
    err.reason = "no_subscription";
    err.exposeToClient = true;
    throw err;
  }

  const orderLike = { ...order, orderSource: "fake" };
  if (!isPlanValueAllowedForOrder(orderLike, range)) {
    const err = new Error("قيمة هذا الطلب خارج نطاق باقة اشتراكك.");
    err.statusCode = 403;
    err.reason = "order_value_outside_plan_range";
    err.exposeToClient = true;
    throw err;
  }

  return { order, range };
}

async function assertFreelancerMayAccessOrderByPlan(freelancerUserId, orderOrId, client) {
  const subscriptionsService = require("./subscriptionsService");
  await subscriptionsService.assertFreelancerMayAccessRealPoolOrders(freelancerUserId);

  const runner = client || require("../config/db").pool;
  let order = orderOrId;
  if (order == null || (typeof orderOrId !== "object" && orderOrId != null)) {
    const oid = Number(typeof orderOrId === "object" ? orderOrId?.id : orderOrId);
    if (!Number.isInteger(oid) || oid < 1) {
      const err = new Error("Order not found.");
      err.statusCode = 404;
      throw err;
    }
    const { rows } = await runner.query(`SELECT * FROM orders WHERE id = $1::bigint LIMIT 1`, [oid]);
    order = rows[0];
  }
  if (!order) {
    const err = new Error("Order not found.");
    err.statusCode = 404;
    throw err;
  }

  const range = await getFreelancerPlanOrderValueRange(freelancerUserId);
  if (!range) {
    const err = new Error("لا يوجد اشتراك نشط يسمح بالوصول إلى هذا الطلب.");
    err.statusCode = 403;
    err.reason = "no_subscription";
    err.exposeToClient = true;
    throw err;
  }

  const orderLike = { ...order, orderSource: "real" };
  if (!isPlanValueAllowedForOrder(orderLike, range)) {
    const err = new Error("قيمة هذا الطلب خارج نطاق باقة اشتراكك.");
    err.statusCode = 403;
    err.reason = "order_value_outside_plan_range";
    err.exposeToClient = true;
    throw err;
  }

  return { order, range };
}

module.exports = {
  parseJod,
  getPlanOrderValueRange,
  getPlanOrderValueRangeFromDb,
  resolvePlanOrderValueRange,
  isOrderValueAllowedForPlan,
  isOrderRowAllowedForPlanRange,
  isSingleValueInPlanRange,
  budgetRangesOverlap,
  getFreelancerPlanOrderValueRange,
  formatPlanRangeLabel,
  isPlanValueAllowedForOrder,
  computePoolOrderPlanEligibility,
  enrichFreelancerPoolOrdersPlanEligibility,
  loadFakeOrderRow,
  assertFreelancerMayAccessFakeOrderByPlan,
  buildPlanOrderValueWhereClause,
  appendSqlPlanOrderValueFilter,
  assertFreelancerMayAccessOrderByPlan,
};
