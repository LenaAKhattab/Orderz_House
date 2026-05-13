import { formatHomePublicStat } from "../../hooks/usePublicHomeStats";

/** Fallback demo numbers — used only when the API fails or order aggregates are unavailable. */
export const FALLBACK_DEMO = {
  views: 24365,
  activeUsers: 1248,
  completed: 324,
  inProgress: 85,
  open: 62,
};

export function resolveNumber(payload, key, demoVal) {
  const ready = payload != null && !payload.error;
  if (key === "views") {
    if (!ready || !payload.showVisitorsCount) {
      return formatHomePublicStat(demoVal);
    }
    if (payload.visitors != null && !Number.isNaN(Number(payload.visitors))) {
      return formatHomePublicStat(payload.visitors);
    }
    return "—";
  }
  if (key === "active") {
    if (!ready || !payload.showActiveUsersCount) {
      return formatHomePublicStat(demoVal);
    }
    if (payload.activeUsers != null && !Number.isNaN(Number(payload.activeUsers))) {
      return formatHomePublicStat(payload.activeUsers);
    }
    return "—";
  }
  return formatHomePublicStat(demoVal);
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

export function resolveProjectNumber(payload, key, demoVal) {
  const fromApi = projectCountsFromApi(payload);
  if (fromApi) {
    if (key === "open") return formatHomePublicStat(fromApi.open);
    if (key === "inProgress") return formatHomePublicStat(fromApi.inProgress);
    if (key === "completed") return formatHomePublicStat(fromApi.completed);
  }
  return formatHomePublicStat(demoVal);
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
  if (showProjectSkeleton(statsPayload)) return "…";
  return resolveProjectNumber(statsPayload, row.key, row.demo);
}

export function statDisplayValueAnalytics(row, statsPayload) {
  if (showAnalyticsSkeleton(statsPayload, row.key)) return "…";
  return resolveNumber(statsPayload, row.key, row.demo);
}
