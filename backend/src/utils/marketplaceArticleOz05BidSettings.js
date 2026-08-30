/**
 * OZ05 — Per-article bid collection settings helpers.
 * Duration hours are stored in marketplace_articles.keywords JSONB (unused SEO field)
 * as a structured object so no new migration is required.
 * Minimum bids use marketplace_articles.required_bid_count (migration 159).
 */

const {
  VISIBILITY_DURATION_HOURS_MIN,
  VISIBILITY_DURATION_HOURS_MAX,
  VISIBILITY_DURATION_HOURS_DEFAULT,
  normalizeVisibilityDurationHours,
} = require("../constants/freelancerActivationArticleOps");

const OZ05_DURATION_META_KEY = "bidCollectionDurationHours";
const OZ05_META_FLAG = "oz05BidSettings";

const BID_COLLECTION_DURATION_PRESETS_HOURS = Object.freeze([24, 48, 72, 168]);

const INVENTORY_REQUIRED_BID_COUNT_MIN = 1;
const INVENTORY_REQUIRED_BID_COUNT_MAX = 100;
const INVENTORY_REQUIRED_BID_COUNT_DEFAULT = 10;

function parseKeywordsRaw(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * Read OZ05 settings bag from keywords JSONB (object or legacy array).
 */
function readOz05KeywordsMeta(keywords) {
  const parsed = parseKeywordsRaw(keywords);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    const found = parsed.find(
      (x) => x && typeof x === "object" && !Array.isArray(x) && x[OZ05_META_FLAG],
    );
    return found && typeof found === "object" ? found : {};
  }
  return {};
}

/**
 * Merge OZ05 fields into keywords for persistence.
 * Preserves unrelated object keys; replaces empty/array defaults.
 */
function mergeOz05KeywordsMeta(existingKeywords, patch = {}) {
  const base = readOz05KeywordsMeta(existingKeywords);
  const next = {
    ...base,
    [OZ05_META_FLAG]: true,
    ...patch,
  };
  return next;
}

function readBidCollectionDurationHours(keywords, fallback = VISIBILITY_DURATION_HOURS_DEFAULT) {
  const meta = readOz05KeywordsMeta(keywords);
  const raw = meta[OZ05_DURATION_META_KEY];
  if (raw == null || raw === "") {
    return normalizeVisibilityDurationHours(fallback);
  }
  return normalizeVisibilityDurationHours(raw);
}

function assertInventoryRequiredBidCount(value, {
  defaultValue = INVENTORY_REQUIRED_BID_COUNT_DEFAULT,
} = {}) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    const err = new Error("الحد الأدنى من المتقدمين يجب أن يكون عدداً صحيحاً.");
    err.statusCode = 400;
    err.publicCode = "ARTICLE_REQUIRED_BID_COUNT_INVALID";
    err.exposeToClient = true;
    throw err;
  }
  if (n < INVENTORY_REQUIRED_BID_COUNT_MIN || n > INVENTORY_REQUIRED_BID_COUNT_MAX) {
    const err = new Error(
      `الحد الأدنى من المتقدمين يجب أن يكون بين ${INVENTORY_REQUIRED_BID_COUNT_MIN} و ${INVENTORY_REQUIRED_BID_COUNT_MAX}.`,
    );
    err.statusCode = 400;
    err.publicCode = "ARTICLE_REQUIRED_BID_COUNT_INVALID";
    err.exposeToClient = true;
    throw err;
  }
  return n;
}

function assertBidCollectionDurationHours(value, {
  defaultValue = VISIBILITY_DURATION_HOURS_DEFAULT,
} = {}) {
  if (value === undefined || value === null || value === "") {
    return normalizeVisibilityDurationHours(defaultValue);
  }
  const n = Number(value);
  if (!Number.isInteger(n)) {
    const err = new Error("مدة استقبال التقديمات يجب أن تكون عدداً صحيحاً بالساعات.");
    err.statusCode = 400;
    err.publicCode = "ARTICLE_BID_COLLECTION_DURATION_INVALID";
    err.exposeToClient = true;
    throw err;
  }
  if (n < VISIBILITY_DURATION_HOURS_MIN || n > VISIBILITY_DURATION_HOURS_MAX) {
    const err = new Error(
      `مدة استقبال التقديمات يجب أن تكون بين ${VISIBILITY_DURATION_HOURS_MIN} و ${VISIBILITY_DURATION_HOURS_MAX} ساعة.`,
    );
    err.statusCode = 400;
    err.publicCode = "ARTICLE_BID_COLLECTION_DURATION_INVALID";
    err.exposeToClient = true;
    throw err;
  }
  return n;
}

function resolveDurationHoursFromPayload(payload = {}, existingKeywords = null) {
  const raw =
    payload.bidCollectionDurationHours ??
    payload.bid_collection_duration_hours ??
    payload.visibilityDurationHours ??
    payload.visibility_duration_hours;
  if (raw !== undefined && raw !== null && raw !== "") {
    return assertBidCollectionDurationHours(raw);
  }
  if (existingKeywords != null) {
    return readBidCollectionDurationHours(existingKeywords);
  }
  return VISIBILITY_DURATION_HOURS_DEFAULT;
}

module.exports = {
  OZ05_DURATION_META_KEY,
  OZ05_META_FLAG,
  BID_COLLECTION_DURATION_PRESETS_HOURS,
  INVENTORY_REQUIRED_BID_COUNT_MIN,
  INVENTORY_REQUIRED_BID_COUNT_MAX,
  INVENTORY_REQUIRED_BID_COUNT_DEFAULT,
  VISIBILITY_DURATION_HOURS_DEFAULT,
  readOz05KeywordsMeta,
  mergeOz05KeywordsMeta,
  readBidCollectionDurationHours,
  assertInventoryRequiredBidCount,
  assertBidCollectionDurationHours,
  resolveDurationHoursFromPayload,
  normalizeVisibilityDurationHours,
};
