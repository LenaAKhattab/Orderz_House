import { useCallback, useEffect, useState } from "react";
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
import { useSuperAdminAnalyticsOverview } from "../../../hooks/useSuperAdminAnalyticsOverview";
import { useSuperAdminDashboardSummary } from "../../../hooks/useSuperAdminDashboardSummary";
import {
  getSuperadminHeroHomeStatsSettingRequest,
  patchSuperadminHeroHomeStatsSettingRequest,
} from "../../../services/superAdminAnalytics";
import DashboardPageHeader from "../../dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../dashboard/dashboardBreadcrumbs";
import DashboardSection from "../../dashboard/DashboardSection";
import DashboardStatCard, { DashboardStatCardSkeleton } from "../../dashboard/DashboardStatCard";
import DashboardChartCard, { DashboardChartCardSkeleton } from "../../dashboard/DashboardChartCard";
import DashboardEmptyState from "../../dashboard/DashboardEmptyState";
import DashboardErrorState from "../../dashboard/DashboardErrorState";
import StatusBadge from "../../dashboard/StatusBadge";
import HomeMetricsAdminExplainer from "./HomeMetricsAdminExplainer";
import "./super-admin-analytics.css";

const ATTENTION_CARDS = [
  {
    to: "/dashboard/super-admin/subscriptions/activation",
    icon: "✓",
    title: "تفعيل الاشتراكات",
    description: "متابعة الاشتراكات التي تحتاج تفعيلًا أو مراجعة.",
    badgeKey: "subscriptionsAwaitingActivation",
  },
  {
    to: "/dashboard/super-admin/financial-claims",
    icon: "◍",
    title: "المطالبات المالية",
    description: "مراجعة المطالبات المعلقة وتحديث حالة الدفع.",
    badgeKey: "financialClaimsPending",
  },
  {
    to: "/dashboard/super-admin/orders",
    icon: "▣",
    title: "الطلبات",
    description: "متابعة الطلبات الداخلية وحالة التنفيذ.",
    badgeKey: "internalOrdersPendingClaims",
  },
  {
    to: "/dashboard/super-admin/notifications",
    icon: "◉",
    title: "الإشعارات",
    description: "مراجعة التنبيهات والرسائل الجديدة.",
    badgeKey: "unreadNotifications",
  },
];

const ADMIN_TASK_CARDS = [
  { to: "/dashboard/super-admin/plans", icon: "◆", title: "الباقات", description: "خطط الاشتراك والأسعار." },
  { to: "/dashboard/super-admin/subscriptions", icon: "◎", title: "الاشتراكات", description: "اشتراكات المستقلين." },
  { to: "/dashboard/super-admin/courses", icon: "▶", title: "الدورات", description: "الدورات والتسجيلات." },
  { to: "/dashboard/super-admin/ads", icon: "✴", title: "الإعلانات", description: "الإعلانات الظاهرة." },
  {
    to: "/dashboard/super-admin/training-orders/settings",
    icon: "✦",
    title: "الطلبات التجريبية",
    description: "إعدادات الطلبات التدريبية.",
  },
];

function IconVisitors({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconActive({ className = "" }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function renderMetricValue(value, formatFn, { loading = false } = {}) {
  if (loading) {
    return <span className={`${skelBar} inline-block h-8 w-[5.5rem] max-w-[42%]`} aria-hidden />;
  }
  if (isMetricMissing(value)) {
    return <span className="font-bold text-slate-400">غير متاح</span>;
  }
  return formatFn(value);
}

const skelBar = "dash-ui-skeleton-rows__bar block rounded-md bg-slate-200/90";

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

function ChartsBlock({ unified }) {
  if (!unified?.length) {
    return (
      <DashboardEmptyState title="لا توجد بيانات اتجاه" description="لا توجد بيانات اتجاه لآخر 7 أيام." />
    );
  }

  return (
    <div className="sa-charts-layout">
      <DashboardChartCard title="الإيرادات — آخر 7 أيام" className="sa-chart--primary">
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
        <DashboardChartCard title="الزيارات — آخر 7 أيام" className="sa-chart--secondary">
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

        <DashboardChartCard title="نشاط الطلبات — آخر 7 أيام" className="sa-chart--secondary sa-chart--events">
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
      className={`sa-action-card admin-dash-quick__card sa-action-card--${variant}`}
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

function CollapsibleSection({ title, description, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className={`dash-ui-section dash-ui-surface--soft mb-5 w-full min-w-0 text-start sa-collapsible sa-collapsible--compact ${defaultOpen ? "" : "sa-collapsible--closed"}`.trim()}
    >
      <button
        type="button"
        className="sa-collapsible__trigger"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="sa-collapsible__head-copy">
          <h2 className="sa-collapsible__title">{title}</h2>
          {description ? <p className="sa-collapsible__desc">{description}</p> : null}
        </div>
        <span className="sa-collapsible__chevron" aria-hidden>
          {open ? "▾" : "◂"}
        </span>
      </button>
      {open ? <div className="sa-collapsible__body">{children}</div> : null}
    </section>
  );
}

function PlatformSummaryGrid({ platformOrders }) {
  const open = platformOrders?.openProjects;
  const inProgress = platformOrders?.inProgressProjects;
  const completed = platformOrders?.completedProjects;

  return (
    <div className="sa-kpi-grid sa-kpi-grid--platform">
      <DashboardStatCard
        className="sa-stat-card--platform"
        label="طلبات مفتوحة"
        value={renderMetricValue(open, formatInt)}
        hint="بانتظار التعيين أو العروض"
        icon={<IconOrders />}
      />
      <DashboardStatCard
        className="sa-stat-card--platform"
        label="طلبات قيد التنفيذ"
        value={renderMetricValue(inProgress, formatInt)}
        hint="مُسندة أو قيد العمل"
        icon={<IconOrders />}
      />
      <DashboardStatCard
        className="sa-stat-card--platform"
        label="طلبات مكتملة"
        value={renderMetricValue(completed, formatInt)}
        hint="منجزة على المنصة"
        icon={<IconOrders />}
      />
    </div>
  );
}

function PlatformSummarySkeleton() {
  return (
    <div className="sa-kpi-grid sa-kpi-grid--platform" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <DashboardStatCardSkeleton key={`platform-${i}`} className="sa-stat-card--platform min-h-[6.75rem]" />
      ))}
    </div>
  );
}

export default function SuperAdminProductAnalytics() {
  const { push } = useToast();
  const { openModal: openCreateOrderModal } = useClientCreateOrderModal();
  const { data, loading, error, errorCode, refresh, chartPack } = useSuperAdminAnalyticsOverview({
    range: "7d",
    topLimit: 10,
  });
  const {
    data: summaryData,
    loading: summaryLoading,
    error: summaryError,
    refresh: refreshSummary,
  } = useSuperAdminDashboardSummary();

  const attentionCounts = summaryError ? null : summaryData?.attention;
  const platformOrders = summaryError ? null : summaryData?.platformOrders;
  const pendingClaims =
    summaryLoading || summaryError ? null : summaryData?.attention?.financialClaimsPending;

  const [heroBusy, setHeroBusy] = useState(true);
  const [heroSaving, setHeroSaving] = useState(false);
  const [heroVisitors, setHeroVisitors] = useState(false);
  const [heroActiveUsers, setHeroActiveUsers] = useState(false);

  const loadHero = useCallback(async () => {
    setHeroBusy(true);
    try {
      const response = await getSuperadminHeroHomeStatsSettingRequest();
      setHeroVisitors(Boolean(response?.data?.showHomeVisitorsCount));
      setHeroActiveUsers(Boolean(response?.data?.showHomeActiveUsersCount));
    } catch (e) {
      const message = e?.response?.data?.message || e?.message || "تعذر تحميل إعداد الصفحة الرئيسية.";
      push({ type: "error", title: "إعداد الصفحة الرئيسية", message });
    } finally {
      setHeroBusy(false);
    }
  }, [push]);

  useEffect(() => {
    void loadHero();
  }, [loadHero]);

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

  const kpis = data?.kpis;
  const meta = data?.meta;
  const showFailState = Boolean(error) && !data && !loading;
  const analyticsPending = loading || (!data && !error);
  const summaryPending = summaryLoading || (!summaryData && !summaryError);

  const fieldLabelClass = "m-0 text-sm font-bold leading-snug text-slate-900";
  const fieldHelpClass = "m-0 mt-1.5 text-xs leading-relaxed text-slate-500";

  const handleRefresh = () => {
    void refresh();
    void refreshSummary();
  };

  return (
    <div className="sa-analytics w-full min-w-0 text-start">
      <DashboardPageHeader
        className="sa-control-header"
        eyebrow="لوحة المدير الأعلى"
        title="مركز تحكم المدير الأعلى"
        description="متابعة الأعمال، المهام العاجلة، وصحة المنصة من مكان واحد."
        breadcrumbs={superAdminBreadcrumbs("نظرة عامة")}
        actions={
          <>
            <button type="button" className="btn btn-primary sa-header-cta" onClick={() => openCreateOrderModal()}>
              إنشاء طلب
            </button>
            <button type="button" className="btn btn-secondary sa-header-refresh" onClick={handleRefresh} disabled={loading}>
              {loading ? "جارٍ التحديث…" : "تحديث"}
            </button>
          </>
        }
      />

      {meta?.posthogError ? (
        <div
          className="mb-5 rounded-[length:var(--dash-surface-radius,18px)] border border-amber-200/70 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-slate-800 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50/95"
          role="status"
        >
          <strong className="mb-1.5 block font-bold text-slate-900 dark:text-amber-50">تنبيه</strong>
          تعذر تحميل بعض بيانات النشاط حاليًا. تم عرض المؤشرات المتاحة.
        </div>
      ) : null}

      {error && data ? (
        <DashboardErrorState
          message={`تعذر تحديث البيانات في الخلفية: ${error}${errorCode ? ` (${errorCode})` : ""}`}
          actions={
            <button type="button" className="btn btn-primary" onClick={handleRefresh}>
              تحديث
            </button>
          }
        />
      ) : null}

      {showFailState ? (
        <DashboardErrorState
          message={error || "تعذر تحميل لوحة التحكم."}
          actions={
            <button type="button" className="btn btn-primary" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          }
        />
      ) : (
        <>
          <DashboardSection
            title="أداء الأعمال اليوم"
            description="مؤشرات مالية وتشغيلية لليوم."
            className="sa-section--compact sa-section--business"
          >
            <div className="sa-kpi-grid sa-kpi-grid--business sa-kpi-grid--business-wide" aria-busy={analyticsPending || summaryPending || undefined}>
              {analyticsPending ? (
                <DashboardStatCardSkeleton className="sa-stat-card--business min-h-[7.5rem]" />
              ) : (
                <DashboardStatCard
                  className="sa-stat-card--business"
                  label="إيرادات اليوم"
                  value={renderMetricValue(kpis?.revenueTodayJod, formatMoneyJod)}
                  hint="مدفوعات الطلبات والاشتراكات"
                  icon={<IconRevenue />}
                />
              )}
              {analyticsPending ? (
                <DashboardStatCardSkeleton className="sa-stat-card--business min-h-[7.5rem]" />
              ) : (
                <DashboardStatCard
                  className="sa-stat-card--business"
                  label="اشتراكات فعّالة"
                  value={renderMetricValue(kpis?.activeSubscriptions, formatInt)}
                  hint="اشتراكات مدفوعة وسارية الآن"
                  icon={<IconSubscriptions />}
                />
              )}
              {summaryPending ? (
                <DashboardStatCardSkeleton className="sa-stat-card--business min-h-[7.5rem]" />
              ) : (
                <DashboardStatCard
                  className="sa-stat-card--business"
                  label="مطالبات معلّقة"
                  value={renderMetricValue(pendingClaims, formatInt)}
                  hint="بانتظار مراجعة المدير الأعلى"
                  icon={<IconClaims />}
                />
              )}
            </div>
          </DashboardSection>

          <DashboardSection
            title="نشاط المنصة اليوم"
            description="زيارات ومستخدمون وطلبات مسجّلة اليوم."
            className="sa-section--compact sa-section--analytics"
          >
            <div className="sa-kpi-grid sa-kpi-grid--activity" aria-busy={analyticsPending || undefined}>
              {analyticsPending ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <DashboardStatCardSkeleton key={`activity-${i}`} className="sa-stat-card--activity min-h-[6.75rem]" />
                ))
              ) : (
                <>
                  <DashboardStatCard
                    className={`sa-stat-card--activity${isMetricMissing(kpis?.visitorsToday) ? " sa-stat-card--unavailable" : ""}`}
                    label="زوار اليوم"
                    value={renderMetricValue(kpis?.visitorsToday, formatInt)}
                    hint="مشاهدات صفحة ($pageview)"
                    icon={<IconVisitors />}
                  />
                  <DashboardStatCard
                    className={`sa-stat-card--activity${isMetricMissing(kpis?.activeUsersToday) ? " sa-stat-card--unavailable" : ""}`}
                    label="نشطون اليوم"
                    value={renderMetricValue(kpis?.activeUsersToday, formatInt)}
                    hint="تسجيلات دخول فريدة"
                    icon={<IconActive />}
                  />
                  <DashboardStatCard
                    className={`sa-stat-card--activity${isMetricMissing(kpis?.ordersToday) ? " sa-stat-card--unavailable" : ""}`}
                    label="نشاط الطلبات"
                    value={renderMetricValue(kpis?.ordersToday, formatInt)}
                    hint="أحداث إنشاء الطلبات اليوم"
                    icon={<IconOrders />}
                  />
                </>
              )}
            </div>
          </DashboardSection>

          <DashboardSection
            title="ما يحتاج انتباهك"
            description="انتقال سريع إلى قوائم العمل."
            className="sa-section--compact sa-section--attention"
          >
            <div className="sa-action-cards sa-action-cards--attention" aria-busy={summaryPending || undefined}>
              {summaryPending
                ? ATTENTION_CARDS.map((card) => <ActionCardSkeleton key={card.to} variant="attention" />)
                : ATTENTION_CARDS.map((card) => (
                    <ActionCard
                      key={card.to}
                      {...card}
                      variant="attention"
                      badgeCount={summaryError ? undefined : attentionCounts?.[card.badgeKey]}
                    />
                  ))}
            </div>
          </DashboardSection>

          <DashboardSection title="مهام الإدارة" className="sa-section--compact sa-section--tasks">
            <div className="sa-action-cards sa-action-cards--tasks">
              {ADMIN_TASK_CARDS.map((card) => (
                <ActionCard key={card.to} {...card} variant="task" />
              ))}
            </div>
          </DashboardSection>

          {!summaryError ? (
            <DashboardSection
              title="ملخص المنصة"
              description="نظرة عامة على حالة الطلبات في المنصة."
              className="sa-section--compact sa-section--platform"
            >
              {summaryPending ? (
                <PlatformSummarySkeleton />
              ) : (
                <PlatformSummaryGrid platformOrders={platformOrders} />
              )}
            </DashboardSection>
          ) : null}

          <DashboardSection
            title="اتجاهات آخر 7 أيام"
            description="الإيرادات والزيارات ونشاط الطلبات."
            className="sa-section--compact sa-section--charts"
            aria-busy={analyticsPending || undefined}
          >
            {analyticsPending ? <ChartsSkeleton /> : <ChartsBlock unified={chartPack?.unified} />}
          </DashboardSection>

          <CollapsibleSection
            title="إعدادات المنصة"
            description="التحكم بما يظهر للزوار في الصفحة الرئيسية."
            defaultOpen={false}
          >
            <div className="sa-platform-settings">
              <h3 className="sa-platform-settings__subtitle">إعدادات أرقام الصفحة الرئيسية</h3>
              <div className="sa-platform-settings__explainer">
                <HomeMetricsAdminExplainer />
              </div>
              <div className="flex flex-col divide-y divide-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
                  <div className="min-w-0">
                    <p className={fieldLabelClass}>إظهار زوار الموقع في الصفحة الرئيسية</p>
                    <p className={fieldHelpClass}>
                      عدد زيارات الصفحات خلال آخر 7 أيام — وليس عدّاً لحظياً للمتصلين الآن.
                    </p>
                  </div>
                  <label
                    className={`inline-flex shrink-0 items-center gap-2.5 ${heroBusy || heroSaving ? "cursor-wait" : "cursor-pointer"}`}
                  >
                    <StatusBadge tone={heroBusy ? "neutral" : heroVisitors ? "active" : "inactive"}>
                      {heroBusy ? "…" : heroVisitors ? "مفعّل" : "متوقف"}
                    </StatusBadge>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[color:var(--primary,#2f3b65)] focus:ring-2 focus:ring-[color:var(--primary,#2f3b65)]/25"
                      checked={heroVisitors}
                      disabled={heroBusy || heroSaving}
                      onChange={(e) => void patchHomeStats({ showHomeVisitorsCount: e.target.checked })}
                      aria-label="إظهار عدد الزوار في الصفحة الرئيسية"
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 py-4 last:pb-0">
                  <div className="min-w-0">
                    <p className={fieldLabelClass}>إظهار المستخدمين المتفاعلين في الصفحة الرئيسية</p>
                    <p className={fieldHelpClass}>
                      أي نشاط يُتتبَّع في المنصة خلال آخر 7 أيام — قد يكون أعلى من الزوار.
                    </p>
                  </div>
                  <label
                    className={`inline-flex shrink-0 items-center gap-2.5 ${heroBusy || heroSaving ? "cursor-wait" : "cursor-pointer"}`}
                  >
                    <StatusBadge tone={heroBusy ? "neutral" : heroActiveUsers ? "active" : "inactive"}>
                      {heroBusy ? "…" : heroActiveUsers ? "مفعّل" : "متوقف"}
                    </StatusBadge>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[color:var(--primary,#2f3b65)] focus:ring-2 focus:ring-[color:var(--primary,#2f3b65)]/25"
                      checked={heroActiveUsers}
                      disabled={heroBusy || heroSaving}
                      onChange={(e) => void patchHomeStats({ showHomeActiveUsersCount: e.target.checked })}
                      aria-label="إظهار المستخدمين المتفاعلين في الصفحة الرئيسية"
                    />
                  </label>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {data?.updatedAt ? (
            <p className="help m-0 mt-2 text-end text-xs text-slate-500">
              آخر تحديث: {new Date(data.updatedAt).toLocaleString("ar-JO-u-nu-latn")}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
