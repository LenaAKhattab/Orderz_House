import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useClientCreateOrderModal } from "../../../context/ClientCreateOrderModalContext";
import { useToast } from "../../ui/toastContext";
import { useSuperAdminDashboardHomeBundle } from "../../../hooks/useSuperAdminDashboardHomeBundle";
import {
  getSuperadminHeroHomeStatsSettingRequest,
  patchSuperadminHeroHomeStatsSettingRequest,
} from "../../../services/superAdminAnalytics";
import SuperAdminHomeIntelligenceSections from "./SuperAdminHomeIntelligenceSections";
import SuperAdminCommandCenter from "./SuperAdminCommandCenter";
import SuperAdminAttentionSidePanel from "./SuperAdminAttentionSidePanel";
import { computeAttentionTotalCount } from "./UnifiedAttentionPanel";
import DashboardDateFilterBar from "./DashboardDateFilterBar";
import { adaptBundleForPeriod } from "./adaptBundleForPeriod";
import { buildForecasts } from "./buildForecasts";
import { buildUnifiedAttention } from "./buildUnifiedAttention";
import {
  loadStoredPeriod,
  saveStoredPeriod,
  resolveDashboardPeriod,
} from "./dashboardDateRange";
import {
  StatCardLink,
  CollapsibleBlock,
  KpiComparisonGrid,
  LABEL_UNAVAILABLE,
} from "./superAdminHomeBundleUi";
import { SA_ROUTES, sectionFailed } from "./superAdminHomeDataUtils";
import { chartMetaForKey, executiveKpiScope } from "./dashboardMetricScope";
import DashboardPageHeader from "../../dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../dashboard/dashboardBreadcrumbs";
import DashboardSection from "../../dashboard/DashboardSection";
import DashboardStatCard, { DashboardStatCardSkeleton } from "../../dashboard/DashboardStatCard";
import DashboardChartCard, { DashboardChartCardSkeleton } from "../../dashboard/DashboardChartCard";
import DashboardEmptyState from "../../dashboard/DashboardEmptyState";
import PlatformHomeStatsSettings from "./PlatformHomeStatsSettings";
import "./super-admin-analytics.css";

const ADMIN_TASK_CARDS = [
  { to: "/dashboard/super-admin/plans", icon: "◆", title: "الباقات", description: "إدارة خطط الاشتراك والأسعار." },
  { to: "/dashboard/super-admin/subscriptions", icon: "◎", title: "الاشتراكات", description: "اشتراكات المستقلين الحالية." },
  { to: "/dashboard/super-admin/courses", icon: "▶", title: "الدورات", description: "إدارة الدورات والتسجيلات." },
  { to: "/dashboard/super-admin/ads", icon: "✴", title: "الإعلانات", description: "الإعلانات المعروضة في المنصة." },
  {
    to: "/dashboard/super-admin/training-orders/settings",
    icon: "✦",
    title: "الطلبات التجريبية",
    description: "إعدادات تجربة الطلبات للمستقلين الجدد.",
  },
];

function IconRevenue({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSubscriptions({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClaims({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOrders({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M4 10h16M4 14h10M4 18h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatInt(value) {
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function formatMoneyJod(value) {
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} د.أ`;
}

function isMetricMissing(value) {
  return value === null || value === undefined || Number.isNaN(Number(value));
}

function renderMetricValue(value, formatFn, { loading = false, failed = false } = {}) {
  if (loading) {
    return <span className={`${skelBar} inline-block h-8 w-[5.5rem] max-w-[42%]`} aria-hidden />;
  }
  if (failed) {
    return <span className="font-bold text-slate-400">تعذر تحميل البيانات</span>;
  }
  if (isMetricMissing(value)) {
    return <span className="font-bold text-slate-400">{LABEL_UNAVAILABLE}</span>;
  }
  return formatFn(value);
}

const skelBar = "dash-ui-skeleton-rows__bar block rounded-md bg-slate-200/90";

const ANALYTICS_UNAVAILABLE_MSG = "تعذر تحميل بيانات النشاط حالياً";

function ActionCardSkeleton({ variant = "attention" }) {
  return (
    <div className={`sa-action-card sa-action-card--${variant} sa-action-card--skeleton admin-dash-quick__card`} aria-hidden>
      <span className={`${skelBar} h-8 w-8 rounded-[11px]`} />
      <div className="flex w-full flex-wrap items-center gap-2">
        <span className={`${skelBar} h-4 w-[52%]`} />
        {variant === "attention" ? <span className={`sa-action-card__badge-skel ${skelBar}`} /> : null}
      </div>
      <span className={`${skelBar} h-3 w-[88%]`} />
      <span className={`${skelBar} h-3 w-[36%]`} />
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="sa-charts-layout" aria-hidden>
      <DashboardChartCardSkeleton className="sa-chart--primary" variant="primary" />
      <div className="sa-charts-layout__secondary">
        <DashboardChartCardSkeleton className="sa-chart--secondary" variant="secondary" />
        <DashboardChartCardSkeleton className="sa-chart--secondary sa-chart--events" variant="secondary" />
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--line, rgba(0,0,0,0.08))",
  background: "color-mix(in oklab, var(--background, #fff) 92%, transparent)",
  color: "var(--text-main, #0f172a)",
};

function ChartsBlock({ unified, periodLabel }) {
  if (!unified?.length) {
    return (
      <DashboardEmptyState
        title="لا توجد بيانات كافية"
        description={`لا تتوفر بيانات لعرض الاتجاه خلال ${periodLabel || "الفترة المحددة"}.`}
      />
    );
  }

  return (
    <div className="sa-charts-layout">
      <DashboardChartCard
        title={chartMetaForKey("revenue", periodLabel).title}
        description={`${chartMetaForKey("revenue", periodLabel).unit} — ${chartMetaForKey("revenue", periodLabel).scope}`}
        className="sa-chart--primary"
      >
        <div className="sa-chart__canvas sa-chart__canvas--primary" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={unified} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="saR" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ca8a04" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#ca8a04" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <YAxis width={44} tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatMoneyJod(v)} />
              <Area type="monotone" dataKey="revenueJod" stroke="#ca8a04" fillOpacity={1} fill="url(#saR)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </DashboardChartCard>

      <div className="sa-charts-layout__secondary">
        <DashboardChartCard
          title={chartMetaForKey("visitors", periodLabel).title}
          description={`${chartMetaForKey("visitors", periodLabel).unit} — ${chartMetaForKey("visitors", periodLabel).scope}`}
          className="sa-chart--secondary"
        >
          <div className="sa-chart__canvas sa-chart__canvas--secondary" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={unified} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="saV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#166534" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#166534" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                <YAxis width={32} tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatInt(v)} />
                <Area type="monotone" dataKey="visitors" stroke="#166534" fillOpacity={1} fill="url(#saV)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>

        <DashboardChartCard
          title={chartMetaForKey("ordersChart", periodLabel).title}
          description={`${chartMetaForKey("ordersChart", periodLabel).unit} — ${chartMetaForKey("ordersChart", periodLabel).scope}`}
          className="sa-chart--secondary sa-chart--events"
        >
          <div className="sa-chart__canvas sa-chart__canvas--secondary" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={unified} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="saO" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                <YAxis width={32} tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatInt(v)} />
                <Area type="monotone" dataKey="orders" stroke="#2563eb" fillOpacity={1} fill="url(#saO)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </DashboardChartCard>
      </div>
    </div>
  );
}

function ActionCard({ to, icon, title, description, variant = "attention", badgeCount }) {
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;

  return (
    <NavLink
      to={to}
      className={`sa-action-card sa-action-card--premium admin-dash-quick__card sa-action-card--${variant}`}
    >
      <span className="sa-action-card__icon" aria-hidden>
        {icon}
      </span>
      <h3 className="sa-action-card__title">
        {title}
        {showBadge ? (
          <span className="sa-action-card__badge" aria-label={`${formatInt(badgeCount)} بانتظار المتابعة`}>
            {formatInt(badgeCount)}
          </span>
        ) : null}
      </h3>
      <p className="sa-action-card__desc">{description}</p>
      <span className="sa-action-card__cta">فتح القائمة ←</span>
    </NavLink>
  );
}

function SectionInlineNotice({ children, tone = "warn" }) {
  return (
    <p
      className={`sa-section-notice${tone === "error" ? " sa-section-notice--error" : ""}`}
      role="status"
    >
      {children}
    </p>
  );
}

function CollapsibleSection({ title, description, icon, statusBadge, defaultOpen = false, onOpenChange, children }) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      onOpenChange?.(next);
      return next;
    });
  };

  return (
    <section
      className={`dash-ui-section dash-ui-surface--soft mb-4 w-full min-w-0 sa-collapsible sa-collapsible--compact sa-collapsible--premium ${open ? "" : "sa-collapsible--closed"}`.trim()}
    >
      <button type="button" className="sa-collapsible__trigger" aria-expanded={open} onClick={toggle}>
        {icon ? (
          <span className="sa-collapsible__icon-chip" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="sa-collapsible__head-copy">
          <h2 className="sa-collapsible__title">{title}</h2>
          {description ? <p className="sa-collapsible__desc">{description}</p> : null}
        </div>
        {statusBadge ? <span className="sa-collapsible__status">{statusBadge}</span> : null}
        <span className="sa-collapsible__chevron" aria-hidden>
          {open ? "▾" : "◂"}
        </span>
      </button>
      {open ? <div className="sa-collapsible__body">{children}</div> : null}
    </section>
  );
}

const EXEC_KPI_LINKS = {
  activeSubscriptions: SA_ROUTES.subscriptions,
  pendingClaims: SA_ROUTES.financialClaims,
  ordersThisMonth: SA_ROUTES.orders,
  monthlyRevenue: SA_ROUTES.orders,
  totalOrders: SA_ROUTES.orders,
  claimsSubmitted: SA_ROUTES.financialClaims,
};

function HeroKpiGrid({
  businessData,
  businessPending,
  businessFailed,
  ordersToday,
  ordersTodayPending,
  pendingClaims,
  summaryPending,
  summaryFailed,
}) {
  return (
    <div className="sa-kpi-grid sa-kpi-grid--hero sa-kpi-grid--hero-pulse sa-kpi-grid--pulse-premium" aria-busy={businessPending || ordersTodayPending || summaryPending || undefined}>
      {businessPending ? (
        <DashboardStatCardSkeleton className="sa-stat-card--business sa-stat-card--hero sa-stat-card--hero-primary" />
      ) : (
        <DashboardStatCard
          className="sa-stat-card--business sa-stat-card--hero sa-stat-card--hero-primary"
          label="إيرادات اليوم"
          value={renderMetricValue(businessData?.revenueTodayJod, formatMoneyJod, { failed: businessFailed })}
          icon={<IconRevenue />}
        />
      )}
      {ordersTodayPending ? (
        <DashboardStatCardSkeleton className="sa-stat-card--activity sa-stat-card--hero" />
      ) : (
        <StatCardLink to={SA_ROUTES.orders}>
          <DashboardStatCard
            className="sa-stat-card--activity sa-stat-card--hero sa-stat-card--clickable"
            label="طلبات اليوم"
            value={renderMetricValue(ordersToday, formatInt)}
            icon={<IconOrders />}
          />
        </StatCardLink>
      )}
      {businessPending ? (
        <DashboardStatCardSkeleton className="sa-stat-card--business sa-stat-card--hero" />
      ) : (
        <StatCardLink to={SA_ROUTES.subscriptions}>
          <DashboardStatCard
            className="sa-stat-card--business sa-stat-card--hero sa-stat-card--clickable"
            label="اشتراكات نشطة"
            value={renderMetricValue(businessData?.activeSubscriptions, formatInt, { failed: businessFailed })}
            icon={<IconSubscriptions />}
          />
        </StatCardLink>
      )}
      {summaryPending ? (
        <DashboardStatCardSkeleton className="sa-stat-card--business sa-stat-card--hero" />
      ) : (
        <StatCardLink to={SA_ROUTES.financialClaims}>
          <DashboardStatCard
            className="sa-stat-card--business sa-stat-card--hero sa-stat-card--clickable"
            label="مطالبات معلّقة"
            value={renderMetricValue(pendingClaims, formatInt, { failed: summaryFailed })}
            icon={<IconClaims />}
          />
        </StatCardLink>
      )}
    </div>
  );
}

function SecondaryMetricsBlock({
  intelSummary,
  platformOrders,
  posthogKpis,
  loading,
  failed,
  posthogUnavailable,
  summaryFailed,
}) {
  const s = intelSummary;
  const stripItems = [
    { key: "u", label: "المستخدمون", value: s?.totalUsers },
    { key: "c", label: "العملاء", value: s?.totalClients },
    { key: "f", label: "المستقلين", value: s?.totalFreelancers },
    { key: "o", label: "إجمالي الطلبات", value: s?.totalOrders, to: SA_ROUTES.orders },
    { key: "rev", label: "إيرادات الشهر", value: s?.monthlyRevenueJod, money: true },
    {
      key: "vis",
      label: "زوار اليوم",
      value: posthogUnavailable ? null : posthogKpis?.visitorsToday,
      missing: posthogUnavailable || isMetricMissing(posthogKpis?.visitorsToday),
    },
    {
      key: "act",
      label: "نشطون اليوم",
      value: posthogUnavailable ? null : posthogKpis?.activeUsersToday,
      missing: posthogUnavailable || isMetricMissing(posthogKpis?.activeUsersToday),
    },
  ];

  if (loading && !s) {
    return <div className="sa-kpi-grid sa-kpi-grid--dense" aria-hidden>{stripItems.map((item) => <DashboardStatCardSkeleton key={item.key} className="sa-stat-card--dense" />)}</div>;
  }

  const open = platformOrders?.openProjects;
  const inProgress = platformOrders?.inProgressProjects;
  const completed = platformOrders?.completedProjects;

  return (
    <>
      <div className="sa-kpi-grid sa-kpi-grid--dense sa-kpi-grid--dense-4">
        {stripItems.map((item) => (
          <StatCardLink key={item.key} to={item.to}>
            <DashboardStatCard
              className={`sa-stat-card--platform sa-stat-card--dense${item.to ? " sa-stat-card--clickable" : ""}${failed || item.missing || item.value == null ? " sa-stat-card--unavailable" : ""}`}
              label={item.label}
              value={
                failed
                  ? "تعذر تحميل البيانات"
                  : item.missing
                    ? LABEL_UNAVAILABLE
                    : item.money
                      ? formatMoneyJod(item.value)
                      : formatInt(item.value)
              }
            />
          </StatCardLink>
        ))}
      </div>
      <p className="sa-kpi-group-label sa-kpi-group-label--tight">حالة الطلبات</p>
      <div className="sa-kpi-grid sa-kpi-grid--platform sa-kpi-grid--hero-secondary">
        <StatCardLink to={SA_ROUTES.orders}>
          <DashboardStatCard
            className="sa-stat-card--platform sa-stat-card--hero sa-stat-card--clickable"
            label="مفتوحة"
            value={renderMetricValue(open, formatInt, { failed: summaryFailed })}
          />
        </StatCardLink>
        <StatCardLink to={SA_ROUTES.orders}>
          <DashboardStatCard
            className="sa-stat-card--platform sa-stat-card--hero sa-stat-card--clickable"
            label="قيد التنفيذ"
            value={renderMetricValue(inProgress, formatInt, { failed: summaryFailed })}
          />
        </StatCardLink>
        <StatCardLink to={SA_ROUTES.orders}>
          <DashboardStatCard
            className="sa-stat-card--platform sa-stat-card--hero sa-stat-card--clickable"
            label="مكتملة"
            value={renderMetricValue(completed, formatInt, { failed: summaryFailed })}
          />
        </StatCardLink>
      </div>
    </>
  );
}

export default function SuperAdminProductAnalytics() {
  const { push } = useToast();
  const { openModal: openCreateOrderModal } = useClientCreateOrderModal();

  const [periodInput, setPeriodInput] = useState(() => {
    const stored = loadStoredPeriod();
    return {
      preset: stored?.preset || "7d",
      customFrom: stored?.customFrom,
      customTo: stored?.customTo,
    };
  });

  const period = useMemo(
    () => resolveDashboardPeriod(periodInput),
    [periodInput.preset, periodInput.customFrom, periodInput.customTo],
  );

  const {
    data: bundleRaw,
    fastLoading,
    executiveLoading,
    intelligenceLoading,
    posthogLoading,
    loading: bundleLoading,
    error: bundleError,
    fastError,
    executiveError,
    intelligenceError,
    posthogError,
    requestIntelligence,
    requestPosthog,
    refresh,
  } = useSuperAdminDashboardHomeBundle(period);

  const { bundle, periodMetrics, chartPack, periodLabel } = useMemo(
    () => adaptBundleForPeriod(bundleRaw, period),
    [bundleRaw, period],
  );

  const summaryData = bundle?.summary;
  const businessData = bundle?.businessKpis;
  const data = bundle?.posthog;
  const meta = bundle?.meta;
  const sectionErrors = bundle?.meta?.sectionErrors || {};
  const intelligence = bundle?.intelligence;

  const platformOrders = summaryData?.platformOrders;
  const pendingClaims = summaryData?.attention?.financialClaimsPending;
  const unifiedAttention = intelligence?.attention?.data;

  const handlePeriodChange = useCallback((next) => {
    setPeriodInput((prev) => {
      const merged = { ...prev, ...next };
      const resolved = resolveDashboardPeriod(merged);
      saveStoredPeriod({ preset: resolved.preset, customFrom: resolved.customFrom, customTo: resolved.customTo });
      return merged;
    });
  }, []);

  const [heroBusy, setHeroBusy] = useState(false);
  const [heroSaving, setHeroSaving] = useState(false);
  const [heroVisitors, setHeroVisitors] = useState(false);
  const [heroActiveUsers, setHeroActiveUsers] = useState(false);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadHero = useCallback(async () => {
    setHeroBusy(true);
    try {
      const response = await getSuperadminHeroHomeStatsSettingRequest();
      setHeroVisitors(Boolean(response?.data?.showHomeVisitorsCount));
      setHeroActiveUsers(Boolean(response?.data?.showHomeActiveUsersCount));
      setHeroLoaded(true);
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "تعذر تحميل إعداد الصفحة الرئيسية.";
      push({ type: "error", title: "إعداد الصفحة الرئيسية", message });
    } finally {
      setHeroBusy(false);
    }
  }, [push]);

  useEffect(() => {
    if (!settingsOpen || heroLoaded) return;
    void loadHero();
  }, [settingsOpen, heroLoaded, loadHero]);

  const patchHomeStats = async (patch) => {
    setHeroSaving(true);
    try {
      const res = await patchSuperadminHeroHomeStatsSettingRequest(patch);
      const d = res?.data;
      if (d) {
        setHeroVisitors(Boolean(d.showHomeVisitorsCount));
        setHeroActiveUsers(Boolean(d.showHomeActiveUsersCount));
      }
      push({ type: "success", title: "تم الحفظ", message: "تم تحديث ظهور الإحصاءات في الصفحة الرئيسية." });
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "تعذر حفظ الإعداد.";
      push({ type: "error", title: "تعذر الحفظ", message });
    } finally {
      setHeroSaving(false);
    }
  };

  const posthogKpis = data?.kpis;
  const fastPending = fastLoading && !summaryData && !businessData;
  const analyticsPending = posthogLoading && !data;
  const analyticsFailed = Boolean(posthogError) && !data && !posthogLoading;
  const summaryPending = fastPending;
  const summaryFailed = Boolean(fastError) && !summaryData && !fastLoading;
  const businessPending = fastPending;
  const businessFailed = Boolean(fastError) && !businessData && !fastLoading;
  const intelSummaryFailed = sectionFailed(sectionErrors, "summary");
  const posthogUnavailable = Boolean(meta?.posthogError) || meta?.posthogConfigured === false;
  const isRefreshing =
    (fastLoading || executiveLoading || posthogLoading || intelligenceLoading) && Boolean(bundle);
  const attentionPending = fastLoading && !unifiedAttention;
  const executiveKpis = intelligence?.executiveKpis?.data;
  const executiveKpisFailed = sectionFailed(sectionErrors, "executiveKpis");
  const executiveKpisPending = executiveLoading && !executiveKpis && !executiveKpisFailed;

  const handleHeavySectionOpen = useCallback(
    (open) => {
      if (!open) return;
      requestIntelligence();
      requestPosthog();
    },
    [requestIntelligence, requestPosthog],
  );

  const handleChartsSectionOpen = useCallback(
    (open) => {
      if (open) requestPosthog();
    },
    [requestPosthog],
  );

  const commandCenter = useMemo(
    () => ({
      forecasts: buildForecasts({ intelligence, periodMetrics }),
      attentionItems: buildUnifiedAttention({ intelligence, attention: unifiedAttention }),
    }),
    [periodMetrics, intelligence, unifiedAttention],
  );

  const intelSummary = intelligence?.summary?.data;
  const executiveWithLinks = useMemo(
    () => (Array.isArray(executiveKpis) ? executiveKpis.map((m) => ({ ...m, to: EXEC_KPI_LINKS[m.key] })) : executiveKpis),
    [executiveKpis],
  );

  const ordersToday = useMemo(() => {
    const fromFast = businessData?.ordersToday;
    if (fromFast != null && !Number.isNaN(Number(fromFast))) return fromFast;
    const fromIntel = intelligence?.orders?.data?.totals?.ordersToday;
    if (fromIntel != null && !Number.isNaN(Number(fromIntel))) return fromIntel;
    if (!posthogUnavailable && !isMetricMissing(posthogKpis?.ordersToday)) {
      return posthogKpis.ordersToday;
    }
    return null;
  }, [
    businessData?.ordersToday,
    intelligence?.orders?.data?.totals?.ordersToday,
    posthogUnavailable,
    posthogKpis?.ordersToday,
  ]);

  const ordersTodayPending = fastPending && ordersToday == null;

  const attentionTotal = useMemo(
    () => computeAttentionTotalCount(commandCenter.attentionItems),
    [commandCenter.attentionItems],
  );

  const forecastGrowthPct = useMemo(() => {
    const rev = Array.isArray(executiveKpis) ? executiveKpis.find((m) => m.key === "monthlyRevenue") : null;
    return rev?.comparable !== false ? rev?.changePct : null;
  }, [executiveKpis]);

  const heroStatusChips = useMemo(() => {
    const chips = [];
    if (bundle?.updatedAt) {
      chips.push({
        key: "updated",
        label: "آخر تحديث",
        value: new Date(bundle.updatedAt).toLocaleString("ar-JO-u-nu-latn", {
          dateStyle: "short",
          timeStyle: "short",
        }),
      });
    }
    if (!attentionPending) {
      chips.push({ key: "actions", label: "إجراءات", value: formatInt(attentionTotal) });
      chips.push({
        key: "platform",
        label: "حالة المنصة",
        value: attentionTotal > 0 ? "يتطلب متابعة" : "مستقرة",
        tone: attentionTotal > 0 ? "warn" : "ok",
      });
    }
    return chips;
  }, [bundle?.updatedAt, attentionPending, attentionTotal]);

  const intelLazyBadge =
    intelligenceLoading && !intelSummary ? "تحميل عند الفتح" : intelSummary ? "جاهز" : null;
  const chartsLazyBadge =
    !chartPack?.unified?.length && (analyticsPending || posthogLoading) ? "تحميل عند الفتح" : chartPack?.unified?.length
      ? "جاهز"
      : null;
  const settingsLazyBadge = settingsOpen && heroBusy ? "تحميل عند الفتح" : heroLoaded ? "جاهز" : null;

  const handleRefresh = () => {
    void refresh();
  };

  return (
    <div className="sa-analytics sa-analytics--premium w-full min-w-0" dir="rtl" lang="ar">
      <DashboardPageHeader
        className="sa-control-header sa-control-header--compact sa-control-header--premium"
        eyebrow="لوحة المدير الأعلى"
        title="مركز التحكم"
        description="مركز قيادة تنفيذي — الحالة والمخاطر والفرص في لمحة."
        breadcrumbs={superAdminBreadcrumbs("نظرة عامة")}
        actions={
          <>
            <button type="button" className="btn btn-primary sa-header-cta" onClick={() => openCreateOrderModal()}>
              إنشاء طلب
            </button>
            <button type="button" className="btn btn-secondary sa-header-refresh" onClick={handleRefresh} disabled={isRefreshing}>
              {isRefreshing ? "جارٍ التحديث…" : "تحديث"}
            </button>
          </>
        }
      />

      {heroStatusChips.length ? (
        <ul className="sa-hero-status-chips m-0 list-none p-0" aria-label="مؤشرات سريعة">
          {heroStatusChips.map((chip) => (
            <li
              key={chip.key}
              className={`sa-hero-status-chip${chip.tone === "warn" ? " sa-hero-status-chip--warn" : ""}${chip.tone === "ok" ? " sa-hero-status-chip--ok" : ""}`}
            >
              <span className="sa-hero-status-chip__label">{chip.label}</span>
              <strong className="sa-hero-status-chip__value">{chip.value}</strong>
            </li>
          ))}
        </ul>
      ) : null}

      {(executiveError || posthogError || intelligenceError) && bundle ? (
        <SectionInlineNotice tone="warn">
          تعذر تحديث بعض بيانات اللوحة في الخلفية.{" "}
          <button type="button" className="sa-section-notice__btn" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </SectionInlineNotice>
      ) : null}
      {fastError && !bundle ? (
        <SectionInlineNotice tone="error">
          {fastError}{" "}
          <button type="button" className="sa-section-notice__btn" onClick={() => void refresh()}>
            إعادة المحاولة
          </button>
        </SectionInlineNotice>
      ) : null}

      <DashboardDateFilterBar period={period} onChange={handlePeriodChange} disabled={fastLoading && !bundle} />

      <section className="sa-dashboard-main-grid" aria-label="محتوى لوحة التحكم">
        <main className="sa-dashboard-main-column">
          <div className="sa-pulse-forecast-row">
            <DashboardSection title="نبض اليوم" className="sa-section--compact sa-section--hero-kpis sa-section--pulse-premium sa-pulse-forecast-row__pulse">
              <p className="sa-section-scope-label help m-0 mb-2">اليوم — لا يتأثر بفلتر الفترة</p>
              <HeroKpiGrid
                businessData={businessData}
                businessPending={businessPending}
                businessFailed={businessFailed}
                ordersToday={ordersToday}
                ordersTodayPending={ordersTodayPending}
                pendingClaims={pendingClaims}
                summaryPending={summaryPending}
                summaryFailed={summaryFailed}
              />
            </DashboardSection>

            <SuperAdminCommandCenter forecasts={commandCenter.forecasts} growthPct={forecastGrowthPct} />
          </div>

      <DashboardSection title="مقارنة الشهر" className="sa-section--compact sa-section--exec-compare sa-section--exec-premium">
        <p className="sa-section-scope-label help m-0 mb-2">القيمة الحالية مقابل الفترة السابقة</p>
        {executiveError && !executiveKpis ? (
          <SectionInlineNotice tone="warn">
            {executiveError}{" "}
            <button type="button" className="sa-section-notice__btn" onClick={() => void refresh()}>
              إعادة المحاولة
            </button>
          </SectionInlineNotice>
        ) : null}
        <div className="sa-exec-compare-grid">
          <KpiComparisonGrid
            metrics={executiveWithLinks}
            loading={executiveKpisPending}
            dense
            period={period}
            resolveScope={executiveKpiScope}
            showCardScope={false}
          />
        </div>
      </DashboardSection>

      <CollapsibleBlock
        title="مؤشرات إضافية"
        description="مستخدمون، نشاط، وحالة الطلبات."
        icon="📊"
        statusBadge={intelLazyBadge}
        defaultOpen={false}
        className="sa-section--compact sa-section--muted sa-collapsible--premium mb-0"
        onOpenChange={handleHeavySectionOpen}
      >
        <p className="sa-section-scope-label help m-0 mb-2">الوضع الحالي على المنصة</p>
        {intelligenceLoading && !intelSummary ? (
          <p className="help m-0 mb-2 text-slate-500">جارٍ تحميل البيانات…</p>
        ) : null}
        {intelligenceError && !intelSummary ? (
          <SectionInlineNotice tone="warn">
            {intelligenceError}{" "}
            <button type="button" className="sa-section-notice__btn" onClick={() => void refresh()}>
              إعادة المحاولة
            </button>
          </SectionInlineNotice>
        ) : null}
        <SecondaryMetricsBlock
          intelSummary={intelSummary}
          platformOrders={platformOrders}
          posthogKpis={posthogKpis}
          loading={(intelligenceLoading && !intelSummary) || (posthogLoading && posthogUnavailable && !posthogKpis)}
          failed={intelSummaryFailed}
          posthogUnavailable={posthogUnavailable}
          summaryFailed={summaryFailed}
        />
      </CollapsibleBlock>

      <CollapsibleBlock
        title="اتجاهات الفترة"
        description={periodLabel ? `إيرادات، زيارات، طلبات — ${periodLabel}` : "إيرادات، زيارات، طلبات"}
        icon="📈"
        statusBadge={chartsLazyBadge}
        defaultOpen={false}
        className="sa-section--compact sa-section--charts sa-collapsible--premium mb-0"
        onOpenChange={handleChartsSectionOpen}
      >
        {analyticsFailed && !businessData?.revenueByDay?.length ? (
          <SectionInlineNotice tone="error">
            {ANALYTICS_UNAVAILABLE_MSG}{" "}
            <button type="button" className="sa-section-notice__btn" onClick={() => void refresh()}>
              إعادة المحاولة
            </button>
          </SectionInlineNotice>
        ) : !chartPack?.unified?.length && businessPending ? (
          <ChartsSkeleton />
        ) : !chartPack?.unified?.length && analyticsPending ? (
          <ChartsSkeleton />
        ) : (
          <ChartsBlock unified={chartPack?.unified} periodLabel={periodLabel} />
        )}
      </CollapsibleBlock>

      <SuperAdminHomeIntelligenceSections
        intelligence={intelligence}
        posthog={data}
        meta={meta}
        period={period}
        periodLabel={periodLabel}
        loading={intelligenceLoading}
        posthogLoading={posthogLoading}
        sectionErrors={sectionErrors}
        onRetry={handleRefresh}
        onRequestIntelligence={requestIntelligence}
        onRequestPosthog={requestPosthog}
        intelligenceError={intelligenceError}
      />

      <CollapsibleBlock
        title="مهام الإدارة"
        description="اختصارات لإدارة المنصة."
        icon="🗂️"
        statusBadge="جاهز"
        defaultOpen={false}
        className="sa-section--compact sa-section--muted sa-section--tasks sa-collapsible--premium mb-0"
      >
        <div className="sa-action-cards sa-action-cards--tasks sa-action-cards--premium">
          {ADMIN_TASK_CARDS.map((card) => (
            <ActionCard key={card.to} {...card} variant="task" />
          ))}
        </div>
      </CollapsibleBlock>

          <CollapsibleSection
            title="إعدادات المنصة"
            description="إظهار أو إخفاء أرقام الصفحة الرئيسية."
            icon="⚙️"
            statusBadge={settingsLazyBadge}
            defaultOpen={false}
            onOpenChange={setSettingsOpen}
          >
            <PlatformHomeStatsSettings
              open={settingsOpen}
              showVisitors={heroVisitors}
              showActiveUsers={heroActiveUsers}
              busy={heroBusy}
              saving={heroSaving}
              onToggleVisitors={(checked) => void patchHomeStats({ showHomeVisitorsCount: checked })}
              onToggleActiveUsers={(checked) => void patchHomeStats({ showHomeActiveUsersCount: checked })}
            />
          </CollapsibleSection>

        </main>

        <aside className="sa-dashboard-side-column">
          <SuperAdminAttentionSidePanel
            items={commandCenter.attentionItems}
            loading={attentionPending}
          />
        </aside>
      </section>
    </div>
  );
}
