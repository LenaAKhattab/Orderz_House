import { useState } from "react";
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
import DashboardStatCard, { DashboardStatCardSkeleton } from "../../dashboard/DashboardStatCard";
import DashboardChartCard from "../../dashboard/DashboardChartCard";
import DashboardEmptyState from "../../dashboard/DashboardEmptyState";

export const LABEL_UNAVAILABLE = "غير متاح";
export const LABEL_LOAD_FAILED = "تعذر تحميل البيانات";

const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
};

export function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

export function formatMoneyJod(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${new Intl.NumberFormat("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))} د.أ`;
}

export function formatPctChange(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("ar-JO-u-nu-latn", { maximumFractionDigits: 1 }).format(n)}٪`;
}

export function isMetricMissing(value) {
  return value === null || value === undefined || Number.isNaN(Number(value));
}

function formatChartDay(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("ar-JO-u-nu-latn", { month: "short", day: "numeric" });
  } catch {
    return String(isoDate || "");
  }
}

function formatChartMonth(isoDate) {
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString("ar-JO-u-nu-latn", { month: "short", year: "2-digit" });
  } catch {
    return String(isoDate || "");
  }
}

export function trendBadge(trend, changePct) {
  if (changePct === null || changePct === undefined || trend == null) return null;
  const cls =
    trend === "up" ? "text-emerald-700" : trend === "down" ? "text-rose-700" : "text-slate-500";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  return (
    <span className={cls}>
      {arrow} {formatPctChange(changePct)} <span className="font-normal text-slate-400">عن الفترة السابقة</span>
    </span>
  );
}

export function StatCardLink({ to, children, className = "" }) {
  if (!to) return children;
  return (
    <NavLink to={to} className={`sa-stat-card-link block no-underline ${className}`.trim()}>
      {children}
    </NavLink>
  );
}

function formatStatValue(item) {
  if (item.missing) return item.failed ? LABEL_LOAD_FAILED : LABEL_UNAVAILABLE;
  if (item.money) return formatMoneyJod(item.value);
  if (item.percent) return `${formatInt(item.value)}٪`;
  return formatInt(item.value);
}

export function SectionFailedBlock({ message, onRetry }) {
  return (
    <div className="sa-section-failed" role="alert">
      <p className="sa-section-failed__text m-0">{message || LABEL_LOAD_FAILED}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm sa-section-failed__retry" onClick={onRetry}>
          إعادة المحاولة
        </button>
      ) : null}
    </div>
  );
}

export function SectionHighlights({ items }) {
  const visible = (items || []).filter(Boolean);
  if (!visible.length) return null;
  return (
    <ul className="sa-section-highlights">
      {visible.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

export function CollapsibleBlock({
  title,
  description,
  icon,
  statusBadge,
  defaultOpen = false,
  className = "",
  onOpenChange,
  children,
}) {
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
      className={`dash-ui-section dash-ui-surface--soft w-full min-w-0 sa-collapsible sa-collapsible--compact sa-collapsible--premium ${open ? "" : "sa-collapsible--closed"} ${className}`.trim()}
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

export function MetricScopeLabel({ children, className = "" }) {
  if (!children) return null;
  return (
    <span className={`sa-metric-scope ${className}`.trim()} aria-label={`نطاق البيانات: ${children}`}>
      {children}
    </span>
  );
}

export function PeriodAwarenessBanner({ period }) {
  if (!period?.label) return null;
  return (
    <p className="sa-period-banner m-0" role="status">
      يتم عرض البيانات بناءً على: <strong>{period.label}</strong>
      {period.posthogLimited ? (
        <span className="sa-period-banner__note"> — بعض اتجاهات النشاط محدودة بـ 30 يوماً.</span>
      ) : null}
    </p>
  );
}

export function PlatformInsightsList({ insights }) {
  if (!insights?.length) {
    return <p className="help m-0">لا توجد رؤى كافية من البيانات الحالية — حدّث اللوحة لاحقاً.</p>;
  }
  return (
    <ul className="sa-insights-list">
      {insights.map((item) => (
        <li key={item.id} className="sa-insights-list__item">
          <p className="sa-insights-list__text m-0">{item.text}</p>
          {item.source ? <MetricScopeLabel className="sa-insights-list__source">{item.source}</MetricScopeLabel> : null}
        </li>
      ))}
    </ul>
  );
}

export function MiniStatGrid({ items, loading = false, dense = false, showCardScope = true }) {
  const gridClass = dense ? "sa-kpi-grid sa-kpi-grid--dense" : "sa-kpi-grid sa-kpi-grid--platform";
  return (
    <div className={gridClass}>
      {items.map((item) =>
        loading ? (
          <DashboardStatCardSkeleton key={item.key} className="sa-stat-card--platform sa-stat-card--dense" />
        ) : (
          <StatCardLink key={item.key} to={item.to}>
            <DashboardStatCard
              className={`sa-stat-card--platform sa-stat-card--dense${item.to ? " sa-stat-card--clickable" : ""}${item.missing ? " sa-stat-card--unavailable" : ""}`}
              label={item.label}
              scopeLabel={showCardScope ? item.scopeLabel : undefined}
              value={formatStatValue(item)}
              hint={item.hint}
              trend={item.comparable !== false && item.trend != null ? trendBadge(item.trend, item.changePct) : undefined}
            />
          </StatCardLink>
        ),
      )}
    </div>
  );
}

export function KpiComparisonGrid({ metrics, loading = false, dense = false, period, resolveScope, showCardScope = true }) {
  if (loading) {
    return <MiniStatGrid loading dense={dense} items={(metrics || []).map((m) => ({ key: m.key, label: m.label }))} />;
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return <p className="help m-0">لا تتوفر مؤشرات مقارنة.</p>;
  }
  return (
    <MiniStatGrid
      dense={dense}
      showCardScope={showCardScope}
      items={metrics.map((m) => ({
        key: m.key,
        label: m.label,
        scopeLabel: showCardScope ? m.scopeLabel || (resolveScope ? resolveScope(m.key, period) : undefined) : undefined,
        value: m.current,
        money: m.money,
        comparable: m.comparable,
        hint:
          m.comparable === false
            ? m.hint || "بدون مقارنة زمنية"
            : m.hint || `السابق: ${m.money ? formatMoneyJod(m.previous) : formatInt(m.previous)}`,
        trend: m.comparable !== false ? m.trend : null,
        changePct: m.comparable !== false ? m.changePct : null,
        to: m.to,
      }))}
    />
  );
}

export function TopList({
  rows,
  valueLabel,
  valueKey,
  labelKey = "name",
  money = false,
  emptyLabel = "لا توجد بيانات",
  scopeLabel,
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="help m-0">{emptyLabel}</p>;
  }
  const formatVal = money ? formatMoneyJod : formatInt;
  const rowLabel = (row) => {
    if (labelKey && row[labelKey]) return row[labelKey];
    return row.name || row.title || row.fullName || row.countryCode || "—";
  };
  return (
    <div className="grid gap-2">
      {scopeLabel ? <MetricScopeLabel className="mb-1 block">{scopeLabel}</MetricScopeLabel> : null}
      {rows.slice(0, 5).map((row, idx) => (
        <div key={`${rowLabel(row)}-${idx}`} className="sa-section-summary__chip">
          <strong className="sa-section-summary__val">{rowLabel(row)}</strong>
          <span className="sa-section-summary__lbl">
            {valueLabel}: {formatVal(row[valueKey])}
          </span>
        </div>
      ))}
    </div>
  );
}

export function normalizeTrendRows(rows, { dateKey, valueKeys }) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const dateVal = row[dateKey] ?? row.day ?? row.monthStart ?? row.weekStart;
    const value =
      valueKeys.reduce((acc, key) => (acc != null ? acc : row[key]), null) ?? 0;
    const label = dateKey === "monthStart" || dateKey === "month_start" ? formatChartMonth(dateVal) : formatChartDay(dateVal);
    return { label, value: Number(value) || 0, rawDate: dateVal };
  });
}

export function IntelligenceTrendCharts({ charts, loading, periodLabel }) {
  if (loading) {
    return (
      <div className="sa-charts-layout sa-charts-layout--intel">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="sa-chart--intel min-h-[12rem] animate-pulse rounded-xl bg-slate-100/80" />
        ))}
      </div>
    );
  }

  const hasAny = charts.some((c) => c.data?.length > 0);
  if (!hasAny) {
    return (
      <DashboardEmptyState
        title="لا توجد اتجاهات كافية"
        description="ستظهر الرسوم عند توفر بيانات تاريخية كافية."
      />
    );
  }

  return (
    <div className="sa-charts-layout sa-charts-layout--intel">
      {charts.map((chart) => (
        <DashboardChartCard
          key={chart.key}
          title={chart.title}
          description={chart.subtitle || (periodLabel ? `${chart.unit || ""} — ${chart.scopeLabel || periodLabel}` : chart.unit)}
          className="sa-chart--intel"
        >
          <div className="sa-chart__canvas sa-chart__canvas--secondary" dir="ltr">
            {chart.data?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`intel-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chart.color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={chart.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 6" stroke="var(--line, rgba(0,0,0,0.08))" opacity={0.6} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                  <YAxis width={36} tick={{ fontSize: 10 }} stroke="var(--text-muted, #64748b)" />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(v) => (chart.money ? formatMoneyJod(v) : formatInt(v))}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={chart.color}
                    fillOpacity={1}
                    fill={`url(#intel-${chart.key})`}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="help m-0 p-4 text-center">لا توجد نقاط لهذه الفترة.</p>
            )}
          </div>
        </DashboardChartCard>
      ))}
    </div>
  );
}

export function buildOperationalCharts(intelligence, periodLabel) {
  const orders = intelligence?.orders?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const financial = intelligence?.financial?.data;
  const courses = intelligence?.courses?.data;

  return [
    {
      key: "orders",
      title: "عدد الطلبات",
      subtitle: `طلب — آخر 30 يوماً (يومي)`,
      unit: "طلب",
      scopeLabel: "آخر 30 يوماً",
      color: "#2563eb",
      money: false,
      data: normalizeTrendRows(orders?.timing?.trendByDay, {
        dateKey: "day",
        valueKeys: ["ordersCount", "orders_count"],
      }),
    },
    {
      key: "subscriptions",
      title: "عدد الاشتراكات",
      subtitle: "اشتراك — شهري (تاريخي)",
      unit: "اشتراك",
      scopeLabel: "شهري — تاريخي",
      color: "#7c3aed",
      money: false,
      data: normalizeTrendRows(subscriptions?.trendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["subscriptionsCount", "subscriptions_count"],
      }),
    },
    {
      key: "financial",
      title: "المطالبات المالية",
      subtitle: "د.أ — شهري (تاريخي)",
      unit: "د.أ",
      scopeLabel: "شهري — تاريخي",
      color: "#ca8a04",
      money: true,
      data: normalizeTrendRows(financial?.paymentTrendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["amountJod", "amount_jod"],
      }),
    },
    {
      key: "courses",
      title: "تسجيلات الدورات",
      subtitle: "تسجيل — شهري (تاريخي)",
      unit: "تسجيل",
      scopeLabel: "شهري — تاريخي",
      color: "#166534",
      money: false,
      data: normalizeTrendRows(courses?.enrollmentTrendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["enrollments"],
      }),
    },
  ];
}
