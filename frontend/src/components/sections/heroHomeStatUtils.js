import { formatHomePublicStat } from "../../hooks/usePublicHomeStats";
import { isDevTrackingDisabled } from "../../services/analytics";

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
  waiting_first_pageview: "بانتظار أول زيارة ($pageview)",
  posthog_unavailable: "التحليلات غير متاحة مؤقتاً",
  posthog_misconfigured: "إعداد PostHog على الخادم غير مكتمل",
  dev_tracking_disabled: "التتبع معطّل في بيئة التطوير",
};

function reasonForKey(payload, key) {
  if (key === "views") return payload?.visitorsReason || null;
  if (key === "active") return payload?.activeUsersReason || null;
  return null;
}

function isBrokenReason(reason) {
  return reason === "posthog_unavailable" || reason === "posthog_misconfigured";
}

function shouldHideZeroVisitors(payload, key) {
  if (key !== "views") return false;
  if (isDevTrackingDisabled() && payload?.showVisitorsCount) return true;
  const reason = reasonForKey(payload, key);
  if (reason === "waiting_first_pageview" || reason === "posthog_unavailable" || reason === "posthog_misconfigured") {
    return true;
  }
  if (payload?.analyticsMisconfigured) return true;
  return false;
}

export function resolveAnalyticsHint(payload, key) {
  if (key === "views" && isDevTrackingDisabled() && payload?.showVisitorsCount) {
    return REASON_HINTS.dev_tracking_disabled;
  }
  const reason = reasonForKey(payload, key);
  if (reason === "zero_traffic") {
    return key === "views" ? REASON_HINTS.zero_traffic_views : REASON_HINTS.zero_traffic_active;
  }
  if (reason && REASON_HINTS[reason]) return REASON_HINTS[reason];
  if (payload?.analyticsDegraded && key === "views") return REASON_HINTS.posthog_unavailable;
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
  if (payload != null) return false;
  return key === "views" || key === "active";
}

export function statDisplayValueProjects(row, statsPayload) {
  if (statsPayload == null) return "";
  return resolveProjectNumber(statsPayload, row.key);
}

export function statDisplayValueAnalytics(row, statsPayload) {
  if (statsPayload == null) return "…";
  return resolveNumber(statsPayload, row.key);
}
