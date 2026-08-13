/**
 * Phase B4 — Priority Application Boost constants.
 * ACTIVE product: binary boost (normal | priority). No Token auction stake.
 * LEGACY Phase 6 Token auction remains in codebase as LEGACY_DEPRECATED.
 */

const PRIORITY_APPLICATION_BOOST_ENGINE_FLAG = "priority_application_boost_enabled";

const NORMAL_APPLICATION_BID_COST = 1;
const PRIORITY_BOOST_ADDITIONAL_BID_COST = 0;
const PRIORITY_BOOST_USE_COST = 1;
const PRIORITY_BOOST_WORK_TOKEN_COST = 0;

const PRIORITY_AUTOMATIC_ASSIGNMENT = "REMOVED_FROM_ACTIVE_PRODUCT";
const ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME = "NONE";
const LEGACY_PRIORITY_AUCTION_ENGINE = "DEPRECATED";
const LEGACY_PRIORITY_AUCTION_SCHEMA_DELETION = "DEFERRED";
const PRIORITY_BOOST_HISTORICAL_BACKFILL = "NONE";
const PRIORITY_APPLICATION_BOOST_ENGINE_STATE_WHEN_FLAG_OFF = "DORMANT";
const FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH = "NOT_USED";

const PRIORITY_APPLICATION_BOOST_USAGE_REFERENCE_TYPE = "priority_application_boost";
const PRIORITY_APPLICATION_BOOST_IDEMPOTENCY_PREFIX = "priority_application_boost";

const PRIORITY_APPLICATION_BOOST_STATUSES = Object.freeze(["active", "returned"]);
const PRIORITY_APPLICATION_BOOST_SOURCES = Object.freeze(["submit", "upgrade"]);

const PRIORITY_APPLICATION_BOOST_ERROR_CODES = Object.freeze({
  PRIORITY_APPLICATION_BOOST_ENGINE_OFF: "PRIORITY_APPLICATION_BOOST_ENGINE_OFF",
  PRIORITY_APPLICATION_BOOST_SCHEMA_NOT_READY: "PRIORITY_APPLICATION_BOOST_SCHEMA_NOT_READY",
  PRIORITY_APPLICATION_BOOST_INELIGIBLE: "PRIORITY_APPLICATION_BOOST_INELIGIBLE",
  PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED: "PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED",
  PRIORITY_APPLICATION_BOOST_NO_MEMBERSHIP: "PRIORITY_APPLICATION_BOOST_NO_MEMBERSHIP",
  PRIORITY_APPLICATION_BOOST_BID_REQUIRED: "PRIORITY_APPLICATION_BOOST_BID_REQUIRED",
  PRIORITY_APPLICATION_BOOST_NOT_FOUND: "PRIORITY_APPLICATION_BOOST_NOT_FOUND",
  PRIORITY_APPLICATION_BOOST_FAKE_FORBIDDEN: "PRIORITY_APPLICATION_BOOST_FAKE_FORBIDDEN",
  PRIORITY_APPLICATION_BOOST_ARTICLE_FORBIDDEN: "PRIORITY_APPLICATION_BOOST_ARTICLE_FORBIDDEN",
  PRIORITY_APPLICATION_BOOST_ELITE_FORBIDDEN: "PRIORITY_APPLICATION_BOOST_ELITE_FORBIDDEN",
  PRIORITY_APPLICATION_BOOST_FIXED_TAKE_FORBIDDEN: "PRIORITY_APPLICATION_BOOST_FIXED_TAKE_FORBIDDEN",
});

function buildPriorityApplicationBoostIdempotencyKey(orderId, freelancerUserId) {
  return `${PRIORITY_APPLICATION_BOOST_IDEMPOTENCY_PREFIX}:order:${Number(orderId)}:freelancer:${Number(freelancerUserId)}`;
}

/**
 * Deterministic Client/Admin proposal ordering for priced-bidding lists.
 * Priority (active) first by created_at ASC, id ASC; then normals by amount ASC, created_at ASC.
 */
function compareBidsForPriorityDisplay(a, b) {
  const aPri = Boolean(a?.isPriority || a?.priorityBoosted);
  const bPri = Boolean(b?.isPriority || b?.priorityBoosted);
  if (aPri !== bPri) return aPri ? -1 : 1;
  if (aPri && bPri) {
    const ta = new Date(a.createdAt || a.created_at || 0).getTime();
    const tb = new Date(b.createdAt || b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    const ida = Number(a.id) || 0;
    const idb = Number(b.id) || 0;
    return ida - idb;
  }
  const amountA = Number(a.amount);
  const amountB = Number(b.amount);
  if (Number.isFinite(amountA) && Number.isFinite(amountB) && amountA !== amountB) {
    return amountA - amountB;
  }
  const ta = new Date(a.createdAt || a.created_at || 0).getTime();
  const tb = new Date(b.createdAt || b.created_at || 0).getTime();
  if (ta !== tb) return ta - tb;
  return (Number(a.id) || 0) - (Number(b.id) || 0);
}

function sortBidsForPriorityDisplay(bids) {
  if (!Array.isArray(bids)) return [];
  return [...bids].sort(compareBidsForPriorityDisplay);
}

module.exports = {
  PRIORITY_APPLICATION_BOOST_ENGINE_FLAG,
  NORMAL_APPLICATION_BID_COST,
  PRIORITY_BOOST_ADDITIONAL_BID_COST,
  PRIORITY_BOOST_USE_COST,
  PRIORITY_BOOST_WORK_TOKEN_COST,
  PRIORITY_AUTOMATIC_ASSIGNMENT,
  ACTIVE_PRIORITY_WORK_TOKEN_RUNTIME,
  LEGACY_PRIORITY_AUCTION_ENGINE,
  LEGACY_PRIORITY_AUCTION_SCHEMA_DELETION,
  PRIORITY_BOOST_HISTORICAL_BACKFILL,
  PRIORITY_APPLICATION_BOOST_ENGINE_STATE_WHEN_FLAG_OFF,
  FAIR_PRIORITY_TOKEN_TIEBREAK_NEW_PATH,
  PRIORITY_APPLICATION_BOOST_USAGE_REFERENCE_TYPE,
  PRIORITY_APPLICATION_BOOST_IDEMPOTENCY_PREFIX,
  PRIORITY_APPLICATION_BOOST_STATUSES,
  PRIORITY_APPLICATION_BOOST_SOURCES,
  PRIORITY_APPLICATION_BOOST_ERROR_CODES,
  buildPriorityApplicationBoostIdempotencyKey,
  compareBidsForPriorityDisplay,
  sortBidsForPriorityDisplay,
};
