import { formatInt, formatMoneyJod } from "./superAdminHomeBundleUi";
import { LEADERBOARD_CRITERIA, LEADERBOARD_SCOPES } from "./dashboardMetricScope";

export function buildExecutiveLeaderboards({ intelligence }) {
  const freelancers = (intelligence?.freelancers?.data?.topPerformers || []).slice(0, 5).map((r) => ({
    id: r.freelancerId || r.id || r.fullName,
    name: r.fullName || "—",
    value: formatInt(r.completedOrders),
    sub: "طلب مكتمل",
  }));

  const clients = (intelligence?.clients?.data?.topClients || []).slice(0, 5).map((r) => ({
    id: r.clientId || r.id || r.fullName,
    name: r.fullName || "—",
    value: formatMoneyJod(r.spendJod),
    sub: "إنفاق",
  }));

  const courses = (intelligence?.courses?.data?.topCourses || []).slice(0, 5).map((r) => ({
    id: r.courseId || r.id || r.title,
    name: r.title || "—",
    value: formatInt(r.enrolled),
    sub: "مسجل",
  }));

  const categories = (intelligence?.categories?.data?.mostRequested || []).slice(0, 5).map((r) => ({
    id: r.categoryId || r.id || r.name,
    name: r.name || "—",
    value: formatInt(r.totalOrders),
    sub: "طلب",
  }));

  return [
    {
      key: "freelancers",
      title: "أفضل المستقلين",
      criteria: LEADERBOARD_CRITERIA.freelancers,
      scopeLabel: LEADERBOARD_SCOPES.freelancers,
      rows: freelancers,
    },
    {
      key: "clients",
      title: "أفضل العملاء",
      criteria: LEADERBOARD_CRITERIA.clients,
      scopeLabel: LEADERBOARD_SCOPES.clients,
      rows: clients,
    },
    {
      key: "courses",
      title: "أفضل الدورات",
      criteria: LEADERBOARD_CRITERIA.courses,
      scopeLabel: LEADERBOARD_SCOPES.courses,
      rows: courses,
    },
    {
      key: "categories",
      title: "أفضل الفئات",
      criteria: LEADERBOARD_CRITERIA.categories,
      scopeLabel: LEADERBOARD_SCOPES.categories,
      rows: categories,
    },
  ];
}
