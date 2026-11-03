import { formatHomePublicStat } from "../../utils/homePublicStatFormat.js";
import { localeFromEnFlag, pt } from "../../i18n/activeLocale.js";

/** @deprecated Demo fallbacks removed from hero display — kept for tests/legacy imports only. */
export const FALLBACK_DEMO = {
  views: 24365,
  activeUsers: 1248,
  completed: 324,
  inProgress: 85,
  open: 62,
};

/** Catalog keys under `platformComponents.heroStats.hints` (null = no hint). */
const REASON_HINT_KEYS = {
  toggle_off: null,
  ok: null,
  zero_traffic_views: "zeroTrafficViews",
  zero_traffic_active: "zeroTrafficActive",
  db_unavailable: "dbUnavailable",
  dev_tracking_disabled: "devTrackingDisabled",
};

function reasonHint(reason, locale) {
  const key = Object.prototype.hasOwnProperty.call(REASON_HINT_KEYS, reason) ? REASON_HINT_KEYS[reason] : null;
  return key ? pt(`platformComponents.heroStats.hints.${key}`, undefined, locale) : null;
}

/**
 * Valid public hero count: finite number, integer, >= 0.
 * Real zero is valid; null/NaN/Infinity/negatives/non-numeric are not.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidHomeStatCount(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return false;
  if (typeof value === "string" && value.trim() === "") return false;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return false;
  if (n < 0) return false;
  if (n !== Math.trunc(n)) return false;
  return true;
}

/**
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseHomeStatCount(value) {
  if (!isValidHomeStatCount(value)) return null;
  return Math.trunc(Number(value));
}

/**
 * Order pair (completed + available) must both be present and valid — atomic for the hero strip.
 * @param {object | null | undefined} payload
 * @returns {boolean}
 */
export function hasValidHeroOrderStats(payload) {
  if (payload == null || payload.error) return false;
  if (payload.orderCountsDegraded) return false;
  return (
    isValidHomeStatCount(payload.availableOrdersNow) && isValidHomeStatCount(payload.completedOrders)
  );
}

/**
 * Whether the hero stats block should occupy layout.
 * - payload null: initial loading → show skeleton strip
 * - request error / degraded / missing / invalid order counts → hide entire block
 * - valid numbers including 0/0 → show
 * @param {object | null | undefined} payload
 * @returns {boolean}
 */
export function shouldRenderHeroStatsSection(payload) {
  if (payload == null) return true;
  return hasValidHeroOrderStats(payload);
}

function reasonForKey(payload, key) {
  if (key === "views") return payload?.visitorsReason || null;
  if (key === "active") return payload?.activeUsersReason || null;
  return null;
}

function isBrokenReason(reason) {
  return reason === "db_unavailable";
}

function metricEnabled(payload, key) {
  if (!payload) return true;
  if (key === "views") return payload.showVisitorsCount !== false;
  if (key === "active") return payload.showActiveUsersCount !== false;
  if (key === "availableOrders" || key === "completedOrders") return hasValidHeroOrderStats(payload);
  return true;
}

export function getAnalyticsRawNumber(payload, key) {
  if (!payload || payload.error) return null;
  if (key === "views") {
    if (!payload.showVisitorsCount) return null;
    return parseHomeStatCount(payload.visitors);
  }
  if (key === "active") {
    if (!payload.showActiveUsersCount) return null;
    return parseHomeStatCount(payload.activeUsers);
  }
  if (key === "availableOrders") {
    if (!hasValidHeroOrderStats(payload)) return null;
    return parseHomeStatCount(payload.availableOrdersNow);
  }
  if (key === "completedOrders") {
    if (!hasValidHeroOrderStats(payload)) return null;
    return parseHomeStatCount(payload.completedOrders);
  }
  return null;
}

/** True only on first load when this metric has no value yet (not during background refresh). */
export function isAnalyticsMetricLoading(payload, key) {
  if (payload != null && payload.error) return false;
  if (payload != null && !metricEnabled(payload, key)) return false;
  if (payload != null && (key === "availableOrders" || key === "completedOrders") && !hasValidHeroOrderStats(payload)) {
    return false;
  }
  return getAnalyticsRawNumber(payload, key) == null;
}

function shouldHideZeroVisitors(payload, key) {
  if (key !== "views") return false;
  const reason = reasonForKey(payload, key);
  if (isBrokenReason(reason)) return true;
  return false;
}

/**
 * @param {string} [locale] defaults to Arabic for the Arabic / English UI (unchanged) and to the active locale
 *   for German / Dutch / Romanian
 */
export function resolveAnalyticsHint(payload, key, locale = localeFromEnFlag(false)) {
  const reason = reasonForKey(payload, key);
  if (reason === "zero_traffic") {
    return reasonHint(key === "views" ? "zero_traffic_views" : "zero_traffic_active", locale);
  }
  const hint = reason ? reasonHint(reason, locale) : null;
  if (hint) return hint;
  if (payload?.analyticsDegraded) return reasonHint("db_unavailable", locale);
  return null;
}

/**
 * Formatted display string for a metric. Empty string when unavailable (never "—" for order stats).
 * Callers must not show placeholders for failed order counts — hide the section instead.
 */
export function resolveNumber(payload, key) {
  if (payload == null) return "";
  if (payload.error) return "";

  if (key === "views") {
    if (!payload.showVisitorsCount) return "";
    if (shouldHideZeroVisitors(payload, key)) return "";
    const reason = reasonForKey(payload, key);
    if (isBrokenReason(reason)) return "";
    const n = parseHomeStatCount(payload.visitors);
    return n == null ? "" : formatHomePublicStat(n);
  }
  if (key === "active") {
    if (!payload.showActiveUsersCount) return "";
    const reason = reasonForKey(payload, key);
    if (isBrokenReason(reason)) return "";
    const n = parseHomeStatCount(payload.activeUsers);
    return n == null ? "" : formatHomePublicStat(n);
  }
  if (key === "availableOrders" || key === "completedOrders") {
    if (!hasValidHeroOrderStats(payload)) return "";
    const raw = key === "availableOrders" ? payload.availableOrdersNow : payload.completedOrders;
    const n = parseHomeStatCount(raw);
    return n == null ? "" : formatHomePublicStat(n);
  }
  return "";
}

export function projectCountsFromApi(payload) {
  if (payload == null || payload.error || payload.orderCountsDegraded) return null;
  const o = payload.openProjects;
  const ip = payload.inProgressProjects;
  const c = payload.completedProjects;
  if (o == null || ip == null || c == null) return null;
  if ([o, ip, c].some((n) => !isValidHomeStatCount(n))) return null;
  return { open: Number(o), inProgress: Number(ip), completed: Number(c) };
}

export function resolveProjectNumber(payload, key) {
  if (payload == null) return "";
  const fromApi = projectCountsFromApi(payload);
  if (fromApi) {
    if (key === "open") return formatHomePublicStat(fromApi.open);
    if (key === "inProgress") return formatHomePublicStat(fromApi.inProgress);
    if (key === "completed") return formatHomePublicStat(fromApi.completed);
  }
  return "";
}

export function showProjectSkeleton(payload) {
  return payload == null;
}

export function showAnalyticsSkeleton(payload, key) {
  if (payload != null && payload.error) return false;
  if (payload != null && (key === "availableOrders" || key === "completedOrders")) {
    if (!hasValidHeroOrderStats(payload)) return false;
    return false;
  }
  if (payload != null) return false;
  return key === "views" || key === "active" || key === "availableOrders" || key === "completedOrders";
}

export function statDisplayValueProjects(row, statsPayload) {
  if (statsPayload == null) return "";
  return resolveProjectNumber(statsPayload, row.key);
}

export function statDisplayValueAnalytics(row, statsPayload) {
  if (statsPayload == null) return "";
  return resolveNumber(statsPayload, row.key);
}
