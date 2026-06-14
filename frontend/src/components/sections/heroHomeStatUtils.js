import { formatHomePublicStat } from "../../hooks/usePublicHomeStats";

/** @deprecated Demo fallbacks removed from hero display — kept for tests/legacy imports only. */
export const FALLBACK_DEMO = {
  views: 24365,
  activeUsers: 1248,
  completed: 324,
  inProgress: 85,
  open: 62,
};

const REASON_HINTS = {
  toggle_off: null,
  ok: null,
  zero_traffic_views: "لا مشاهدات مسجّلة بعد",
  zero_traffic_active: "لا نشاط مسجّل خلال 7 أيام",
  db_unavailable: "إحصائيات المنصة غير متاحة مؤقتاً",
  dev_tracking_disabled: "التتبع معطّل في بيئة التطوير",
};

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
  if (key === "availableOrders" || key === "completedOrders") return !payload.orderCountsDegraded;
  return true;
}

export function getAnalyticsRawNumber(payload, key) {
  if (!payload || payload.error) return null;
  if (key === "views") {
    if (!payload.showVisitorsCount) return null;
    if (payload.visitors == null || Number.isNaN(Number(payload.visitors))) return null;
    return Math.trunc(Number(payload.visitors));
  }
  if (key === "active") {
    if (!payload.showActiveUsersCount) return null;
    if (payload.activeUsers == null || Number.isNaN(Number(payload.activeUsers))) return null;
    return Math.trunc(Number(payload.activeUsers));
  }
  if (key === "availableOrders") {
    if (payload.orderCountsDegraded) return null;
    if (payload.availableOrdersNow == null || Number.isNaN(Number(payload.availableOrdersNow))) return null;
    return Math.trunc(Number(payload.availableOrdersNow));
  }
  if (key === "completedOrders") {
    if (payload.orderCountsDegraded) return null;
    if (payload.completedOrders == null || Number.isNaN(Number(payload.completedOrders))) return null;
    return Math.trunc(Number(payload.completedOrders));
  }
  return null;
}

/** True only on first load when this metric has no value yet (not during background refresh). */
export function isAnalyticsMetricLoading(payload, key) {
  if (payload != null && payload.error) return false;
  if (payload != null && !metricEnabled(payload, key)) return false;
  return getAnalyticsRawNumber(payload, key) == null;
}

function shouldHideZeroVisitors(payload, key) {
  if (key !== "views") return false;
  const reason = reasonForKey(payload, key);
  if (isBrokenReason(reason)) return true;
  return false;
}

export function resolveAnalyticsHint(payload, key) {
  const reason = reasonForKey(payload, key);
  if (reason === "zero_traffic") {
    return key === "views" ? REASON_HINTS.zero_traffic_views : REASON_HINTS.zero_traffic_active;
  }
  if (reason && REASON_HINTS[reason]) return REASON_HINTS[reason];
  if (payload?.analyticsDegraded) return REASON_HINTS.db_unavailable;
  return null;
}

export function resolveNumber(payload, key) {
  if (payload == null) return "";
  if (payload.error) return "—";

  if (key === "views") {
    if (!payload.showVisitorsCount) return "—";
    if (shouldHideZeroVisitors(payload, key)) return "—";
    const reason = reasonForKey(payload, key);
    if (isBrokenReason(reason)) return "—";
    if (payload.visitors != null && !Number.isNaN(Number(payload.visitors))) {
      return formatHomePublicStat(payload.visitors);
    }
    return "—";
  }
  if (key === "active") {
    if (!payload.showActiveUsersCount) return "—";
    const reason = reasonForKey(payload, key);
    if (isBrokenReason(reason)) return "—";
    if (payload.activeUsers != null && !Number.isNaN(Number(payload.activeUsers))) {
      return formatHomePublicStat(payload.activeUsers);
    }
    return "—";
  }
  if (key === "availableOrders") {
    if (payload.orderCountsDegraded) return "—";
    if (payload.availableOrdersNow != null && !Number.isNaN(Number(payload.availableOrdersNow))) {
      return formatHomePublicStat(payload.availableOrdersNow);
    }
    return "—";
  }
  if (key === "completedOrders") {
    if (payload.orderCountsDegraded) return "—";
    if (payload.completedOrders != null && !Number.isNaN(Number(payload.completedOrders))) {
      return formatHomePublicStat(payload.completedOrders);
    }
    return "—";
  }
  return "—";
}

export function projectCountsFromApi(payload) {
  if (payload == null || payload.error || payload.orderCountsDegraded) return null;
  const o = payload.openProjects;
  const ip = payload.inProgressProjects;
  const c = payload.completedProjects;
  if (o == null || ip == null || c == null) return null;
  if ([o, ip, c].some((n) => Number.isNaN(Number(n)))) return null;
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
  if (payload.error || payload.orderCountsDegraded) return "—";
  return "—";
}

export function showProjectSkeleton(payload) {
  return payload == null;
}

export function showAnalyticsSkeleton(payload, key) {
  if (payload != null && payload.error) return false;
  if (payload != null && (key === "availableOrders" || key === "completedOrders")) {
    return payload.orderCountsDegraded ? false : payload[key === "availableOrders" ? "availableOrdersNow" : "completedOrders"] == null;
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
