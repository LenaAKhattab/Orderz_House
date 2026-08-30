/**
 * Central plan ↔ order value eligibility (catalog-driven).
 *
 * Business rules:
 * - Fixed orders: compare `orders.budget` (JOD) to plan [minOrderValue, maxOrderValue].
 * - Bidding orders: compare plan range to order [bid_budget_min, bid_budget_max] via interval overlap.
 * - Real and fake/training pool rows use the same value band (e.g. free plan 3–7 د.أ for both).
 * - Display/marketing clones with null bands resolve via `subscription_plan_id` when present.
 */
const { ORDERZHOUSE_PLANS_BY_ID, ORDERZHOUSE_PLAN_IDS } = require("../constants/orderzhousePlansCatalog");

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
  };
}

/** A usable marketplace band requires a finite minimum (max may be open-ended/null). */
function isUsableOrderValueRange(range) {
  if (!range) return false;
  return parseJod(range.minOrderValue) != null;
}

function getPlanOrderValueRange(planId) {
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return null;
  const catalog = ORDERZHOUSE_PLANS_BY_ID[id];
  if (catalog) return normalizePlanRange(id, catalog);
  return null;
}

async function getPlanRowForOrderValue(planId, client) {
  const runner = client || require("../config/db").pool;
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await runner.query(
    `SELECT id, name, order_value_min_jod, order_value_max_jod, subscription_plan_id, deleted_at
     FROM plans
     WHERE id = $1::bigint
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  if (!row || row.deleted_at) return null;
  return row;
}

async function getPlanOrderValueRangeFromDb(planId, client) {
  const row = await getPlanRowForOrderValue(planId, client);
  if (!row) return null;
  return normalizePlanRange(row.id, row);
}

/**
 * Resolve order-value band for a stored subscription plan id.
 * Prefer the plan's own usable band; otherwise follow subscription_plan_id once.
 * Null mins on display clones are never treated as a valid open band.
 */
async function resolvePlanOrderValueRange(planId, client) {
  const id = Number(planId);
  if (!Number.isInteger(id) || id < 1) return null;

  const catalogOwn = getPlanOrderValueRange(id);
  if (isUsableOrderValueRange(catalogOwn)) return catalogOwn;

  const row = await getPlanRowForOrderValue(id, client);
  if (!row) return null;

  const dbOwn = normalizePlanRange(row.id, row);
  if (isUsableOrderValueRange(dbOwn)) return dbOwn;

  const linkedRaw = row.subscription_plan_id;
  if (linkedRaw == null || linkedRaw === "") {
    return null;
  }
  const linkedId = Number(linkedRaw);
  if (!Number.isInteger(linkedId) || linkedId < 1 || linkedId === id) {
    return null;
  }

  const catalogCanon = getPlanOrderValueRange(linkedId);
  if (isUsableOrderValueRange(catalogCanon)) {
    return {
      ...catalogCanon,
      sourcePlanId: id,
      resolvedFromPlanId: linkedId,
    };
  }

  const dbCanon = await getPlanOrderValueRangeFromDb(linkedId, client);
  if (isUsableOrderValueRange(dbCanon)) {
    return {
      ...dbCanon,
      sourcePlanId: id,
      resolvedFromPlanId: linkedId,
    };
  }

  return null;
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

async function getFreelancerPlanOrderValueRange(freelancerUserId, client) {
  const subscriptionsService = require("./subscriptionsService");
  const sub = await subscriptionsService.getCurrentSubscriptionForFreelancer(freelancerUserId);
  if (!sub?.planId) return null;
  return resolvePlanOrderValueRange(sub.planId, client);
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
  if (!range) return { applied: false };
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
  if (!isUsableOrderValueRange(range)) return false;
  const norm = normalizeOrderLikeForPlanCheck(orderLike);
  return isOrderRowAllowedForPlanRange(norm, range);
}

/**
 * Lowest catalog plan whose value band allows this order (upgrade CTA hint only).
 */
function findSuggestedUpgradePlanForOrder(orderLike) {
  const norm = normalizeOrderLikeForPlanCheck(orderLike);
  for (const id of ORDERZHOUSE_PLAN_IDS) {
    const catalog = ORDERZHOUSE_PLANS_BY_ID[id];
    if (!catalog) continue;
    const planRange = normalizePlanRange(id, catalog);
    if (!isUsableOrderValueRange(planRange)) continue;
    if (!isPlanValueAllowedForOrder(norm, planRange)) continue;
    return {
      planId: id,
      planName: catalog.name || null,
      planTitle: catalog.title || null,
      requiredTierCode: id === 1 ? "free" : id === 2 ? "silver" : "pro",
    };
  }
  return null;
}

/** Stable reason codes for freelancer-facing pool plan locks (do not expose internals). */
const POOL_PLAN_ELIGIBILITY_REASON = Object.freeze({
  PLAN_TOO_LOW: "PLAN_TOO_LOW",
  NO_ACTIVE_PLAN: "NO_ACTIVE_PLAN",
  INTERNAL_PLAN_CONFIGURATION: "INTERNAL_PLAN_CONFIGURATION",
});

const POOL_PLAN_ELIGIBILITY_MESSAGE_AR = Object.freeze({
  [POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW]:
    "هذا الطلب متاح لباقات أعلى. قم بترقية خطتك لاستلامه.",
  [POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN]:
    "فعّل باقتك أولاً لاستلام الطلبات.",
  [POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION]:
    "تعذر التحقق من أهلية خطتك حالياً. يرجى التواصل مع الدعم.",
});

function logInternalPlanConfiguration(details = {}) {
  try {
    const safe = {
      reasonCode: POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION,
      planId: details.planId != null ? Number(details.planId) : null,
      sourcePlanId: details.sourcePlanId != null ? Number(details.sourcePlanId) : null,
      resolvedFromPlanId:
        details.resolvedFromPlanId != null ? Number(details.resolvedFromPlanId) : null,
      hasPlanId: details.hasPlanId === true,
      context: details.context ? String(details.context).slice(0, 80) : null,
    };
    console.warn("[planOrderValueEligibility] internal plan configuration", safe);
  } catch {
    /* never throw from logging */
  }
}

/**
 * Pool UI eligibility (visibility vs action). Real + fake/training share the same plan value band.
 * @param {object} [options]
 * @param {boolean} [options.hasPlanId] true when freelancer has a subscription plan id
 * @param {number|null} [options.planId]
 * @param {string} [options.logContext]
 */
function computePoolOrderPlanEligibility(orderLike, range, options = {}) {
  const norm = normalizeOrderLikeForPlanCheck(orderLike);
  const usable = isUsableOrderValueRange(range);
  const allowed = usable && isPlanValueAllowedForOrder(orderLike, range);
  const locked = !allowed;
  const hasPlanId = options.hasPlanId === true;

  let reasonCode = null;
  let lockReason = null;
  if (locked) {
    if (usable) {
      reasonCode = POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW;
      lockReason = POOL_PLAN_ELIGIBILITY_MESSAGE_AR[reasonCode];
    } else if (!hasPlanId && (options.hasPlanId === false || range == null)) {
      reasonCode = POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN;
      lockReason = POOL_PLAN_ELIGIBILITY_MESSAGE_AR[reasonCode];
    } else {
      reasonCode = POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION;
      lockReason = POOL_PLAN_ELIGIBILITY_MESSAGE_AR[reasonCode];
      logInternalPlanConfiguration({
        planId: options.planId ?? range?.planId ?? range?.sourcePlanId,
        sourcePlanId: range?.sourcePlanId,
        resolvedFromPlanId: range?.resolvedFromPlanId,
        hasPlanId: hasPlanId || range != null,
        context: options.logContext || "pool_eligibility",
      });
    }
  }

  const requiredPlanLabel = formatPlanRangeLabel(range);
  const requiredPlanRange = usable
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

  const suggested = locked && usable ? findSuggestedUpgradePlanForOrder(norm) : null;

  return {
    canViewDetails: !locked,
    canClaim: !locked && projectType === "fixed",
    canBid: !locked && pricedBidding,
    isLockedByPlan: locked,
    reasonCode,
    lockReason,
    requiredPlanRange,
    requiredPlanLabel,
    planConfigurationError: reasonCode === POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION,
    requiredTierCode: suggested?.requiredTierCode || null,
    suggestedUpgradePlanId: suggested?.planId || null,
    suggestedUpgradePlanTitle: suggested?.planTitle || null,
  };
}

async function getFreelancerPlanEligibilityContext(freelancerUserId, client) {
  const subscriptionsService = require("./subscriptionsService");
  const sub = await subscriptionsService.getCurrentSubscriptionForFreelancer(freelancerUserId);
  const planId = sub?.planId != null ? Number(sub.planId) : null;
  const hasPlanId = Number.isInteger(planId) && planId > 0;
  const range = hasPlanId ? await resolvePlanOrderValueRange(planId, client) : null;
  return { sub, planId: hasPlanId ? planId : null, hasPlanId, range };
}

async function enrichFreelancerPoolOrdersPlanEligibility(orders, freelancerUserId) {
  const { range, hasPlanId, planId } = await getFreelancerPlanEligibilityContext(freelancerUserId);
  if (!Array.isArray(orders)) return [];
  return orders.map((order) => {
    const withSource = { ...order, orderSource: order?.orderSource || "real" };
    const poolEligibility = computePoolOrderPlanEligibility(withSource, range, {
      hasPlanId,
      planId,
      logContext: "pool_list",
    });
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

function throwPlanRangeUnavailableError(details = {}) {
  logInternalPlanConfiguration({
    ...details,
    hasPlanId: true,
    context: details.context || "assert_access",
  });
  const err = new Error(
    POOL_PLAN_ELIGIBILITY_MESSAGE_AR[POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION],
  );
  err.statusCode = 403;
  err.reason = "plan_configuration_error";
  err.publicCode = POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION;
  err.reasonCode = POOL_PLAN_ELIGIBILITY_REASON.INTERNAL_PLAN_CONFIGURATION;
  err.exposeToClient = true;
  throw err;
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

  const range = await getFreelancerPlanOrderValueRange(freelancerUserId, runner);
  if (!range) {
    const err = new Error(
      POOL_PLAN_ELIGIBILITY_MESSAGE_AR[POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN],
    );
    err.statusCode = 403;
    err.reason = "no_subscription";
    err.publicCode = POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN;
    err.reasonCode = POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN;
    err.exposeToClient = true;
    throw err;
  }
  if (!isUsableOrderValueRange(range)) {
    throwPlanRangeUnavailableError({
      planId: range?.planId,
      sourcePlanId: range?.sourcePlanId,
      resolvedFromPlanId: range?.resolvedFromPlanId,
      context: "fake_order_access",
    });
  }

  const orderLike = { ...order, orderSource: "fake" };
  if (!isPlanValueAllowedForOrder(orderLike, range)) {
    const err = new Error(
      POOL_PLAN_ELIGIBILITY_MESSAGE_AR[POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW],
    );
    err.statusCode = 403;
    err.reason = "order_value_outside_plan_range";
    err.publicCode = POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW;
    err.reasonCode = POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW;
    err.exposeToClient = true;
    throw err;
  }

  return { order, range };
}

async function assertFreelancerMayAccessOrderByPlan(freelancerUserId, orderOrId, client) {
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

  const range = await getFreelancerPlanOrderValueRange(freelancerUserId, runner);
  if (!range) {
    const err = new Error(
      POOL_PLAN_ELIGIBILITY_MESSAGE_AR[POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN],
    );
    err.statusCode = 403;
    err.reason = "no_subscription";
    err.publicCode = POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN;
    err.reasonCode = POOL_PLAN_ELIGIBILITY_REASON.NO_ACTIVE_PLAN;
    err.exposeToClient = true;
    throw err;
  }
  if (!isUsableOrderValueRange(range)) {
    throwPlanRangeUnavailableError({
      planId: range?.planId,
      sourcePlanId: range?.sourcePlanId,
      resolvedFromPlanId: range?.resolvedFromPlanId,
      context: "real_order_access",
    });
  }

  const orderLike = { ...order, orderSource: "real" };
  if (!isPlanValueAllowedForOrder(orderLike, range)) {
    const err = new Error(
      POOL_PLAN_ELIGIBILITY_MESSAGE_AR[POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW],
    );
    err.statusCode = 403;
    err.reason = "order_value_outside_plan_range";
    err.publicCode = POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW;
    err.reasonCode = POOL_PLAN_ELIGIBILITY_REASON.PLAN_TOO_LOW;
    err.exposeToClient = true;
    throw err;
  }

  return { order, range };
}

module.exports = {
  parseJod,
  isUsableOrderValueRange,
  getPlanOrderValueRange,
  getPlanOrderValueRangeFromDb,
  getPlanRowForOrderValue,
  resolvePlanOrderValueRange,
  isOrderValueAllowedForPlan,
  isOrderRowAllowedForPlanRange,
  isSingleValueInPlanRange,
  budgetRangesOverlap,
  getFreelancerPlanOrderValueRange,
  getFreelancerPlanEligibilityContext,
  formatPlanRangeLabel,
  isPlanValueAllowedForOrder,
  findSuggestedUpgradePlanForOrder,
  computePoolOrderPlanEligibility,
  enrichFreelancerPoolOrdersPlanEligibility,
  loadFakeOrderRow,
  assertFreelancerMayAccessFakeOrderByPlan,
  buildPlanOrderValueWhereClause,
  appendSqlPlanOrderValueFilter,
  assertFreelancerMayAccessOrderByPlan,
  POOL_PLAN_ELIGIBILITY_REASON,
  POOL_PLAN_ELIGIBILITY_MESSAGE_AR,
};
