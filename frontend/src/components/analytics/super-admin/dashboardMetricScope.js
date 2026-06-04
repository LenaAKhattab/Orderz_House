/**
 * Data scope labels for Super Admin dashboard trust/clarity.
 * Classifications: platform_total | selected_period | this_month | month_compare |
 * realtime | current_status | estimate | lifetime_ranking
 */

export const SCOPE_LABELS = {
  platform_total: "إجمالي المنصة",
  current_status: "الوضع الحالي",
  this_month: "هذا الشهر",
  month_compare: "مقارنة شهرية",
  realtime: "تحديث مباشر",
  today: "اليوم",
  last_7_days: "آخر 7 أيام",
  last_30_days: "آخر 30 يوماً",
  estimate_month: "تقدير لهذا الشهر",
  lifetime_ranking: "ترتيب تاريخي",
  activity_analytics: "من بيانات النشاط",
};

export const INSIGHT_SOURCES = {
  orders: "من بيانات الطلبات",
  subscriptions: "من بيانات الاشتراكات",
  financial: "من بيانات المطالبات",
  freelancers: "من بيانات المستقلين",
  categories: "من بيانات الفئات",
  courses: "من بيانات الدورات",
  growth: "من مؤشرات النمو",
  quality: "من بيانات الطلبات",
  supply: "من بيانات العرض والطلب",
  ops: "من بيانات التشغيل",
  risk: "من بيانات المخاطر",
  meta: "من بيانات النشاط",
};

export function periodScopeLabel(period) {
  if (!period?.label) return SCOPE_LABELS.last_7_days;
  return period.label;
}

export function periodBannerText(period) {
  return `يتم عرض البيانات بناءً على: ${periodScopeLabel(period)}`;
}

/** Hero strip KPI scopes (fixed, not filtered by period picker). */
export const HERO_KPI_SCOPES = {
  revenueToday: SCOPE_LABELS.today,
  activeSubscriptions: SCOPE_LABELS.current_status,
  pendingClaims: SCOPE_LABELS.current_status,
  visitorsToday: SCOPE_LABELS.realtime,
  activeUsersToday: SCOPE_LABELS.realtime,
  ordersToday: SCOPE_LABELS.today,
};

/** Executive dense strip */
export const EXEC_STRIP_SCOPES = {
  u: SCOPE_LABELS.platform_total,
  c: SCOPE_LABELS.platform_total,
  f: SCOPE_LABELS.platform_total,
  o: SCOPE_LABELS.platform_total,
  sub: SCOPE_LABELS.current_status,
  rev: SCOPE_LABELS.this_month,
  cl: SCOPE_LABELS.current_status,
};

/** Executive comparison KPI keys */
export const EXECUTIVE_KPI_SCOPES = {
  totalUsers: SCOPE_LABELS.platform_total,
  totalOrders: SCOPE_LABELS.platform_total,
  totalClients: SCOPE_LABELS.platform_total,
  activeFreelancers: SCOPE_LABELS.current_status,
  activeSubscriptions: SCOPE_LABELS.current_status,
  ordersThisMonth: SCOPE_LABELS.month_compare,
  monthlyRevenue: SCOPE_LABELS.month_compare,
  pendingClaims: SCOPE_LABELS.current_status,
  claimsSubmitted: SCOPE_LABELS.month_compare,
};

export function executiveKpiScope(key, period) {
  if (EXECUTIVE_KPI_SCOPES[key]) return EXECUTIVE_KPI_SCOPES[key];
  return periodScopeLabel(period);
}

export function summaryIntelligenceScope(key, period) {
  const map = {
    users: SCOPE_LABELS.platform_total,
    clients: SCOPE_LABELS.platform_total,
    freelancers: SCOPE_LABELS.platform_total,
    activeFree: SCOPE_LABELS.current_status,
    orders: SCOPE_LABELS.platform_total,
    open: SCOPE_LABELS.current_status,
    done: SCOPE_LABELS.platform_total,
    cancel: SCOPE_LABELS.platform_total,
    activeSub: SCOPE_LABELS.current_status,
    pendingSub: SCOPE_LABELS.current_status,
    revenue: SCOPE_LABELS.platform_total,
    monthRev: SCOPE_LABELS.this_month,
    courses: SCOPE_LABELS.platform_total,
    students: SCOPE_LABELS.platform_total,
    claims: SCOPE_LABELS.current_status,
  };
  return map[key] || periodScopeLabel(period);
}

export function ordersMetricScope(key, period) {
  const periodKeys = ["o2", "o3", "o4"];
  if (periodKeys.includes(key)) {
    if (key === "o2") return SCOPE_LABELS.today;
    if (key === "o3") return SCOPE_LABELS.last_7_days;
    if (key === "o4") return SCOPE_LABELS.this_month;
  }
  if (key === "o1" || key === "o5" || key === "o6" || key === "o7") return SCOPE_LABELS.platform_total;
  if (key === "o13") return SCOPE_LABELS.current_status;
  if (["o10", "o11", "o12"].includes(key)) return SCOPE_LABELS.platform_total;
  return periodScopeLabel(period);
}

export function chartMetaForKey(key, periodLabel) {
  const meta = {
    orders: { title: "عدد الطلبات", unit: "طلب", scope: "آخر 30 يوماً (يومي)" },
    subscriptions: { title: "عدد الاشتراكات", unit: "اشتراك", scope: "شهري — تاريخي" },
    financial: { title: "المطالبات المالية", unit: "د.أ", scope: "شهري — تاريخي" },
    courses: { title: "تسجيلات الدورات", unit: "تسجيل", scope: "شهري — تاريخي" },
    revenue: { title: "الإيرادات", unit: "د.أ", scope: periodLabel },
    visitors: { title: "الزيارات", unit: "زيارة", scope: periodLabel },
    ordersChart: { title: "الطلبات الجديدة", unit: "طلب", scope: periodLabel },
  };
  return meta[key] || { title: key, unit: "", scope: periodLabel };
}

export const LEADERBOARD_CRITERIA = {
  freelancers: "بحسب عدد الطلبات المكتملة",
  clients: "بحسب إجمالي الإنفاق",
  courses: "بحسب عدد المسجلين",
  categories: "بحسب إجمالي الطلبات",
};

export const LEADERBOARD_SCOPES = {
  freelancers: SCOPE_LABELS.lifetime_ranking,
  clients: SCOPE_LABELS.lifetime_ranking,
  courses: SCOPE_LABELS.lifetime_ranking,
  categories: SCOPE_LABELS.lifetime_ranking,
};

export const RISK_SCOPES = SCOPE_LABELS.current_status;

export const SNAPSHOT_SCOPES = {
  subs: (period) => periodScopeLabel(period),
  orders: (period) => periodScopeLabel(period),
  claims: (period) => periodScopeLabel(period),
  revenue: (period, preset) => (preset === "today" ? SCOPE_LABELS.today : periodScopeLabel(period)),
  category: SCOPE_LABELS.platform_total,
};

export const ATTENTION_SCOPE = SCOPE_LABELS.current_status;

export const HEALTH_SCORE_SCOPE = SCOPE_LABELS.current_status;
