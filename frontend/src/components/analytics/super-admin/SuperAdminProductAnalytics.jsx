import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useToast } from "../../ui/toastContext";
import { useSuperAdminAnalyticsOverview } from "../../../hooks/useSuperAdminAnalyticsOverview";
import {
  getSuperadminHeroHomeStatsSettingRequest,
  patchSuperadminHeroHomeStatsSettingRequest,
} from "../../../services/superAdminAnalytics";
import DashboardPageHeader from "../../dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../dashboard/dashboardBreadcrumbs";
import DashboardSection from "../../dashboard/DashboardSection";
import DashboardToolbar from "../../dashboard/DashboardToolbar";
import DashboardStatsGrid from "../../dashboard/DashboardStatsGrid";
import DashboardStatCard from "../../dashboard/DashboardStatCard";
import DashboardChartCard from "../../dashboard/DashboardChartCard";
import DashboardLoadingState from "../../dashboard/DashboardLoadingState";
import DashboardEmptyState from "../../dashboard/DashboardEmptyState";
import DashboardErrorState from "../../dashboard/DashboardErrorState";
import StatusBadge from "../../dashboard/StatusBadge";
import SuperAdminAnalyticsHealthPanel from "./SuperAdminAnalyticsHealthPanel";
import HomeMetricsAdminExplainer from "./HomeMetricsAdminExplainer";
import "./super-admin-analytics.css";

const EVENT_LABELS_AR = {
  signup_completed: "تسجيل مكتمل",
  user_logged_in: "تسجيل دخول",
  client_order_created: "طلب عميل جديد",
  fixed_order_taken: "طلب ثابت مأخوذ",
  bid_submitted: "عرض سعر مقدّم",
  order_completed: "طلب مكتمل",
  subscription_purchased: "اشتراك مشترى",
  financial_claim_submitted: "مطالبة مالية",
};

const dashChartShell =
  "flex min-h-[280px] min-w-0 flex-col rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white p-5 shadow-[var(--dash-card-shadow)] sm:p-6";

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

function IconOrders({ className = "" }) {
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

function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

function formatMoneyJod(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} د.أ`;
}

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { maximumFractionDigits: 1 }).format(Number(value) * 100)}٪`;
}

function DashboardSkeleton() {
  return (
    <>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4 md:gap-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="sa-skeleton sa-skeleton-bar min-h-[7.25rem] rounded-[length:var(--dash-surface-radius,18px)]" />
        ))}
      </div>
      <div className="mt-5 grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={dashChartShell}>
            <div className="sa-skeleton sa-skeleton-chart min-h-[220px] flex-1 rounded-xl" />
          </div>
        ))}
      </div>
    </>
  );
}

const CHART_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid var(--line, rgba(0,0,0,0.08))",
  background: "color-mix(in oklab, var(--background, #fff) 92%, transparent)",
  color: "var(--text-main, #0f172a)",
};

function ChartsBlock({ unified }) {
  const chartGridClass =
    "grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3";

  if (!unified?.length) {
    return (
      <div className={chartGridClass}>
        <div className="col-span-full min-w-0">
          <DashboardEmptyState title="لا توجد بيانات اتجاه" description="لا توجد بيانات اتجاه للفترة المحددة." />
        </div>
      </div>
    );
  }

  return (
    <div className={chartGridClass}>
      <DashboardChartCard title="اتجاه الزوار (7 أيام)" className="min-h-[280px]">
        <div className="h-[220px] w-full min-h-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={unified} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="saV" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#166534" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#166534" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <YAxis width={36} tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatInt(v)} labelStyle={{ fontWeight: 800 }} />
              <Area type="monotone" dataKey="visitors" stroke="#166534" fillOpacity={1} fill="url(#saV)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </DashboardChartCard>

      <DashboardChartCard title="اتجاه الطلبات (7 أيام)" className="min-h-[280px]">
        <div className="h-[220px] w-full min-h-0" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={unified} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="saO" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563eb" stopOpacity={0.32} />
                  <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <YAxis width={36} tick={{ fontSize: 11 }} stroke="var(--text-muted, #64748b)" />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v) => formatInt(v)} />
              <Area type="monotone" dataKey="orders" stroke="#2563eb" fillOpacity={1} fill="url(#saO)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </DashboardChartCard>

      <DashboardChartCard title="اتجاه الإيرادات (7 أيام)" className="min-h-[280px]">
        <div className="h-[220px] w-full min-h-0" dir="ltr">
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
    </div>
  );
}

const subpanelClass =
  "rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5 dark:border-slate-700/60 dark:bg-slate-900/25";

export default function SuperAdminProductAnalytics() {
  const { push } = useToast();
  const [range, setRange] = useState("7d");
  const { data, loading, error, errorCode, refresh, chartPack } = useSuperAdminAnalyticsOverview({ range, topLimit: 10 });

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
  const events = data?.events || {};
  const conversion = data?.conversion || {};
  const topPages = Array.isArray(data?.topPages) ? data.topPages : [];

  const eventEntries = useMemo(() => Object.keys(EVENT_LABELS_AR).map((key) => ({ key, label: EVENT_LABELS_AR[key], value: events[key] ?? 0 })), [events]);

  const showFailState = Boolean(error) && !data && !loading;

  const fieldLabelClass = "m-0 text-sm font-bold leading-snug text-slate-900";
  const fieldHelpClass = "m-0 mt-1.5 text-xs leading-relaxed text-slate-500";

  return (
    <div className="sa-analytics w-full min-w-0 text-start">
      <DashboardPageHeader
        eyebrow="لوحة المدير الأعلى"
        title="تحليلات المنتج"
        description="PostHog + بيانات المنصة — مؤشرات النمو والتحويل في لوحة واحدة."
        breadcrumbs={superAdminBreadcrumbs("نظرة عامة")}
      />

      <DashboardSection
        title="الصفحة الرئيسية — بطاقات الإحصاءات العامة"
        description="التحكم بظهور مؤشرَي زوار الموقع والمستخدمين المتفاعلين (آخر 7 أيام — ليس متصل الآن)."
      >
        <HomeMetricsAdminExplainer />
        <div className="flex flex-col divide-y divide-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0">
            <div className="min-w-0">
              <p className={fieldLabelClass}>إظهار زوار الموقع في الصفحة الرئيسية</p>
              <p className={fieldHelpClass}>
                عدد زيارات الصفحات ($pageview) خلال آخر 7 أيام — ليس عدّاً لحظياً للمتصلين الآن.
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
                أي نشاط يُتتبَّع في المنصة خلال آخر 7 أيام (دخول، طلبات، أحداث) — قد يكون أعلى من الزوار.
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
      </DashboardSection>

      <DashboardSection
        title="صحة التحليلات وتشخيص الزوار"
        description="حالة PostHog، التتبع، وآخر $pageview — لمعرفة سبب ظهور صفر في الصفحة الرئيسية."
      >
        <SuperAdminAnalyticsHealthPanel />
      </DashboardSection>

      <DashboardToolbar>
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <label className="m-0 text-sm font-bold text-slate-800">نطاق الأحداث</label>
          <select
            className="input max-w-[200px] rounded-lg border-slate-200/90 text-sm"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="today">اليوم</option>
            <option value="7d">آخر 7 أيام</option>
            <option value="30d">آخر 30 يوماً</option>
          </select>
          <button type="button" className="btn btn-secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? "جارٍ التحديث…" : "تحديث"}
          </button>
        </div>
        <StatusBadge tone="neutral">تحديث تلقائي كل 60 ثانية</StatusBadge>
      </DashboardToolbar>

      {meta?.posthogError ? (
        <div
          className="mb-5 rounded-[length:var(--dash-surface-radius,18px)] border border-amber-200/70 bg-amber-50/90 px-4 py-3 text-sm leading-relaxed text-slate-800 dark:border-amber-500/35 dark:bg-amber-950/35 dark:text-amber-50/95"
          role="status"
        >
          <strong className="mb-1.5 block font-bold text-slate-900 dark:text-amber-50">تنبيه PostHog</strong>
          {meta.posthogError}
        </div>
      ) : null}

      {error && data ? (
        <DashboardErrorState
          message={`تعذر تحديث البيانات في الخلفية: ${error}${errorCode ? ` (${errorCode})` : ""}`}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
              تحديث
            </button>
          }
        />
      ) : null}

      {showFailState ? (
        <DashboardErrorState
          message={error || "تعذر تحميل التحليلات."}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => void refresh()}>
              إعادة المحاولة
            </button>
          }
        />
      ) : loading && !data ? (
        <DashboardLoadingState label="جارٍ تحميل التحليلات…">
          <DashboardSkeleton />
        </DashboardLoadingState>
      ) : (
        <>
          <DashboardSection title="مؤشرات الأداء" description="أرقام مختصرة للفترة المحددة.">
            <DashboardStatsGrid>
              <DashboardStatCard
                label="زوار اليوم"
                value={formatInt(kpis?.visitorsToday)}
                hint="مستخدمون مميزون — مشاهدات صفحة ($pageview)"
                icon={<IconVisitors />}
              />
              <DashboardStatCard
                label="مستخدمون نشطون اليوم"
                value={formatInt(kpis?.activeUsersToday)}
                hint="تسجيلات دخول فريدة (user_logged_in)"
                icon={<IconActive />}
              />
              <DashboardStatCard
                label="طلبات اليوم"
                value={formatInt(kpis?.ordersToday)}
                hint="أحداث client_order_created"
                icon={<IconOrders />}
              />
              <DashboardStatCard
                label="إيرادات اليوم"
                value={formatMoneyJod(kpis?.revenueTodayJod)}
                hint="مدفوعات طلبات + اشتراكات (قاعدة البيانات)"
                icon={<IconRevenue />}
              />
              <DashboardStatCard
                label="اشتراكات فعّالة"
                value={formatInt(kpis?.activeSubscriptions)}
                hint="اشتراكات مدفوعة وسارية"
                icon={<IconSubscriptions />}
              />
            </DashboardStatsGrid>
          </DashboardSection>

          <DashboardSection title="اتجاهات الزوار والطلبات والإيرادات" description="سلاسل زمنية لآخر 7 أيام (حسب بيانات الرسم).">
            <ChartsBlock unified={chartPack?.unified} />
          </DashboardSection>

          <DashboardSection title="تفاعل المنتج والتحويل" description="أحداث رئيسية وملخص نسب التحويل.">
            <div className="grid w-full min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
              <div className={subpanelClass}>
                <h3 className="m-0 mb-3 text-sm font-bold tracking-tight text-slate-900">أحداث المنتج</h3>
                <div className="sa-event-grid">
                  {eventEntries.map((row) => (
                    <div key={row.key} className="sa-event-pill">
                      <p className="sa-event-pill__name">{row.label}</p>
                      <p className="sa-event-pill__val">{formatInt(row.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className={subpanelClass}>
                <h3 className="m-0 mb-3 text-sm font-bold tracking-tight text-slate-900">ملخص التحويل</h3>
                <div className="sa-conv-grid">
                  <div className="sa-conv-item">
                    <span>تسجيلات</span>
                    <strong>{formatInt(conversion.signups)}</strong>
                  </div>
                  <div className="sa-conv-item">
                    <span>دخول</span>
                    <strong>{formatInt(conversion.logins)}</strong>
                  </div>
                  <div className="sa-conv-item">
                    <span>اشتراكات مشتراة</span>
                    <strong>{formatInt(conversion.subscriptionsPurchased)}</strong>
                  </div>
                  <div className="sa-conv-item">
                    <span>طلبات مكتملة</span>
                    <strong>{formatInt(conversion.ordersCompleted)}</strong>
                  </div>
                  <div className="sa-conv-item">
                    <span>نسبة دخول / تسجيل</span>
                    <strong>{conversion.signupToLoginRatio == null ? "—" : formatPct(conversion.signupToLoginRatio)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </DashboardSection>

          <DashboardSection title="أكثر الصفحات مشاهدة" description="من PostHog ضمن النطاق الحالي.">
            <div className={subpanelClass}>
              {topPages.length === 0 ? (
                <DashboardEmptyState title="لا توجد مشاهدات" description="لا توجد مشاهدات صفحات ضمن النطاق أو PostHog غير متصل." />
              ) : (
                <ul className="sa-pages-list">
                  {topPages.map((row) => (
                    <li key={`${row.pagePath}-${row.pageViews}`}>
                      <span dir="ltr">{row.pagePath || "/"}</span>
                      <strong>{formatInt(row.pageViews)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DashboardSection>

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
