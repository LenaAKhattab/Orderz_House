import { formatInt, formatMoneyJod } from "./superAdminHomeBundleUi";
import { LEADERBOARD_CRITERIA, LEADERBOARD_SCOPES } from "./dashboardMetricScope";
import { pt } from "../../../i18n/activeLocale";
import { legacyArabicUiLocale } from "../../../admin/adminLocale";

export function buildExecutiveLeaderboards({ intelligence }) {
  // Historically Arabic copy in both AR and EN UIs (kept); German / Dutch / Romanian get their own.
  const loc = legacyArabicUiLocale();
  const L = (key) => pt(`platformAdmin.analytics.leaderboards.${key}`, undefined, loc);
  const freelancers = (intelligence?.freelancers?.data?.topPerformers || []).slice(0, 5).map((r) => ({
    id: r.freelancerId || r.id || r.fullName,
    name: r.fullName || "—",
    value: formatInt(r.completedOrders, loc),
    sub: L("sub.freelancers"),
  }));

  const clients = (intelligence?.clients?.data?.topClients || []).slice(0, 5).map((r) => ({
    id: r.clientId || r.id || r.fullName,
    name: r.fullName || "—",
    value: formatMoneyJod(r.spendJod, loc),
    sub: L("sub.clients"),
  }));

  const courses = (intelligence?.courses?.data?.topCourses || []).slice(0, 5).map((r) => ({
    id: r.courseId || r.id || r.title,
    name: r.title || "—",
    value: formatInt(r.enrolled, loc),
    sub: L("sub.courses"),
  }));

  const categories = (intelligence?.categories?.data?.mostRequested || []).slice(0, 5).map((r) => ({
    id: r.categoryId || r.id || r.name,
    name: r.name || "—",
    value: formatInt(r.totalOrders, loc),
    sub: L("sub.categories"),
  }));

  return [
    {
      key: "freelancers",
      title: L("titles.freelancers"),
      criteria: LEADERBOARD_CRITERIA.freelancers,
      scopeLabel: LEADERBOARD_SCOPES.freelancers,
      rows: freelancers,
    },
    {
      key: "clients",
      title: L("titles.clients"),
      criteria: LEADERBOARD_CRITERIA.clients,
      scopeLabel: LEADERBOARD_SCOPES.clients,
      rows: clients,
    },
    {
      key: "courses",
      title: L("titles.courses"),
      criteria: LEADERBOARD_CRITERIA.courses,
      scopeLabel: LEADERBOARD_SCOPES.courses,
      rows: courses,
    },
    {
      key: "categories",
      title: L("titles.categories"),
      criteria: LEADERBOARD_CRITERIA.categories,
      scopeLabel: LEADERBOARD_SCOPES.categories,
      rows: categories,
    },
  ];
}
