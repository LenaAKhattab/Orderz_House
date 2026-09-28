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
import { useTranslation } from "../../../i18n/LanguageProvider";
import { resolveSuperAdminDashboardHomeLink } from "./superAdminHomeDataUtils";
import { resolveAnalysisScopeLabel } from "./dashboardMetricScope";
import { formatJodMoney } from "../../../utils/formatJodMoney";
import "./registerAnalysisLocale";

/** @deprecated Prefer t("analysis.labels.unavailable") at render sites */
export const LABEL_UNAVAILABLE = "analysis.labels.unavailable";
/** @deprecated Prefer t("analysis.labels.loadFailed") at render sites */
export const LABEL_LOAD_FAILED = "analysis.labels.loadFailed";

const CHART_TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.08)",
  fontSize: 12,
};

export function formatInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ar-JO-u-nu-latn").format(Math.trunc(Number(value)));
}

export function formatMoneyJod(value, locale = "ar") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return formatJodMoney(value, { locale });
}

export function formatPctChange(value, locale = "ar") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0 ? "+" : "";
  const suffix = locale === "en" ? "%" : "٪";
  return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n)}${suffix}`;
}

export function isMetricMissing(value) {
  return value === null || value === undefined || Number.isNaN(Number(value));
}

function formatChartDay(isoDate, locale = "ar") {
  try {
    const d = new Date(isoDate);
    const tag = locale === "en" ? "en-US" : "en-GB";
    return d.toLocaleDateString(tag, locale === "en" ? { month: "short", day: "numeric" } : { day: "2-digit", month: "2-digit" });
  } catch {
    return String(isoDate || "");
  }
}

function formatChartMonth(isoDate, locale = "ar") {
  try {
    const d = new Date(isoDate);
    const tag = locale === "en" ? "en-US" : "en-GB";
    return d.toLocaleDateString(tag, locale === "en" ? { month: "short", year: "2-digit" } : { month: "2-digit", year: "2-digit" });
  } catch {
    return String(isoDate || "");
  }
}

export function trendBadge(trend, changePct, t, locale = "ar") {
  if (changePct === null || changePct === undefined || trend == null) return null;
  const cls =
    trend === "up" ? "text-emerald-700" : trend === "down" ? "text-rose-700" : "text-slate-500";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const vsPrevious = t ? t("analysis.labels.vsPrevious") : "";
  return (
    <span className={cls}>
      {arrow} {formatPctChange(changePct, locale)}{" "}
      {vsPrevious ? <span className="font-normal text-slate-400">{vsPrevious}</span> : null}
    </span>
  );
}

export function StatCardLink({ to, children, className = "" }) {
  const safeTo = resolveSuperAdminDashboardHomeLink(to);
  if (!safeTo) return children;
  return (
    <NavLink to={safeTo} className={`sa-stat-card-link block no-underline ${className}`.trim()}>
      {children}
    </NavLink>
  );
}

function formatStatValue(item, t, locale = "ar") {
  if (item.missing) return item.failed ? t(LABEL_LOAD_FAILED) : t(LABEL_UNAVAILABLE);
  if (item.money) return formatMoneyJod(item.value, locale);
  if (item.percent) return `${formatInt(item.value)}${locale === "en" ? "%" : "٪"}`;
  return formatInt(item.value);
}

export function SectionFailedBlock({ message, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="sa-section-failed" role="alert">
      <p className="sa-section-failed__text m-0">{message || t(LABEL_LOAD_FAILED)}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm sa-section-failed__retry" onClick={onRetry}>
          {t("analysis.labels.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function SectionHighlights({ items }) {
  const { t } = useTranslation();
  const visible = (items || []).filter(Boolean);
  if (!visible.length) return null;
  return (
    <ul className="sa-section-highlights">
      {visible.map((entry) => {
        const text =
          typeof entry === "string"
            ? entry
            : entry?.key
              ? t(entry.key, entry.params)
              : "";
        return text ? <li key={text}>{text}</li> : null;
      })}
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
  const { t } = useTranslation();
  if (!children) return null;
  const label = resolveAnalysisScopeLabel(t, children);
  return (
    <span className={`sa-metric-scope ${className}`.trim()} aria-label={t("analysis.labels.dataScope", { scope: label })}>
      {label}
    </span>
  );
}

export function PeriodAwarenessBanner({ period }) {
  const { t } = useTranslation();
  if (!period?.labelKey) return null;
  return (
    <p className="sa-period-banner m-0" role="status">
      {t("analysis.periodBanner.basedOn")} <strong>{t(period.labelKey)}</strong>
      {period.posthogLimited ? (
        <span className="sa-period-banner__note">{t("analysis.periodBanner.activityLimited")}</span>
      ) : null}
    </p>
  );
}

function resolvePlatformInsightText(t, item, locale = "ar") {
  if (item.textKey) {
    const params = { ...(item.textParams || {}) };
    if (params.labelKey) {
      params.label = t(params.labelKey);
      delete params.labelKey;
    }
    if (params.pct != null) params.pct = formatPctChange(params.pct, locale);
    if (params.count != null) params.count = formatInt(params.count);
    return t(item.textKey, params);
  }
  return item.text || "";
}

export function PlatformInsightsList({ insights }) {
  const { t, locale } = useTranslation();
  if (!insights?.length) {
    return <p className="help m-0">{t("analysis.bundle.insightsEmpty")}</p>;
  }
  return (
    <ul className="sa-insights-list">
      {insights.map((item) => (
        <li key={item.id} className="sa-insights-list__item">
          <p className="sa-insights-list__text m-0">{resolvePlatformInsightText(t, item, locale)}</p>
          {item.sourceKey || item.source ? (
            <MetricScopeLabel className="sa-insights-list__source">{item.sourceKey || item.source}</MetricScopeLabel>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MiniStatGrid({ items, loading = false, dense = false, showCardScope = true }) {
  const { t, locale } = useTranslation();
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
              scopeLabel={showCardScope ? resolveAnalysisScopeLabel(t, item.scopeLabel) : undefined}
              value={formatStatValue(item, t, locale)}
              hint={item.hint}
              trend={
                item.comparable !== false && item.trend != null ? trendBadge(item.trend, item.changePct, t, locale) : undefined
              }
            />
          </StatCardLink>
        ),
      )}
    </div>
  );
}

export function KpiComparisonGrid({ metrics, loading = false, dense = false, period, resolveScope, showCardScope = true }) {
  const { t } = useTranslation();
  if (loading) {
    return <MiniStatGrid loading dense={dense} items={(metrics || []).map((m) => ({ key: m.key, label: m.label }))} />;
  }
  if (!Array.isArray(metrics) || metrics.length === 0) {
    return <p className="help m-0">{t("analysis.bundle.noCompareMetrics")}</p>;
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
            ? m.hint || t("analysis.labels.noComparison")
            : m.hint ||
              t("analysis.labels.previous", {
                value: m.money ? formatMoneyJod(m.previous) : formatInt(m.previous),
              }),
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
  emptyLabel,
  scopeLabel,
}) {
  const { t, locale } = useTranslation();
  const resolvedEmpty = emptyLabel || t("analysis.labels.noData");
  if (!Array.isArray(rows) || rows.length === 0) {
    return <p className="help m-0">{resolvedEmpty}</p>;
  }
  const formatVal = money ? (value) => formatMoneyJod(value, locale) : formatInt;
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

export function normalizeTrendRows(rows, { dateKey, valueKeys, locale = "ar" }) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const dateVal = row[dateKey] ?? row.day ?? row.monthStart ?? row.weekStart;
    const value =
      valueKeys.reduce((acc, key) => (acc != null ? acc : row[key]), null) ?? 0;
    const label = dateKey === "monthStart" || dateKey === "month_start" ? formatChartMonth(dateVal, locale) : formatChartDay(dateVal, locale);
    return { label, value: Number(value) || 0, rawDate: dateVal };
  });
}

export function IntelligenceTrendCharts({ charts, loading, periodLabel }) {
  const { t, locale } = useTranslation();
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
        title={t("analysis.charts.noTrendsTitle")}
        description={t("analysis.charts.noTrendsDesc")}
      />
    );
  }

  return (
    <div className="sa-charts-layout sa-charts-layout--intel">
      {charts.map((chart) => {
        const title = chart.titleKey ? t(chart.titleKey) : chart.title;
        const unit = chart.unitKey ? t(chart.unitKey) : chart.unit;
        const scope = chart.scopeLabelKey
          ? t(chart.scopeLabelKey)
          : resolveAnalysisScopeLabel(t, chart.scopeLabel);
        const subtitle = chart.subtitleKey ? t(chart.subtitleKey) : chart.subtitle;
        const description =
          subtitle || (periodLabel ? `${unit || ""} — ${scope || periodLabel}` : unit);
        return (
        <DashboardChartCard
          key={chart.key}
          title={title}
          description={description}
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
                    formatter={(v) => (chart.money ? formatMoneyJod(v, locale) : formatInt(v))}
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
              <p className="help m-0 p-4 text-center">{t("analysis.charts.noPointsForPeriod")}</p>
            )}
          </div>
        </DashboardChartCard>
        );
      })}
    </div>
  );
}

export function buildOperationalCharts(intelligence, _periodLabel, locale = "ar") {
  const orders = intelligence?.orders?.data;
  const subscriptions = intelligence?.subscriptions?.data;
  const financial = intelligence?.financial?.data;
  const courses = intelligence?.courses?.data;

  return [
    {
      key: "orders",
      titleKey: "analysis.charts.ordersCount",
      subtitleKey: "analysis.charts.ordersTrendSubtitle",
      unitKey: "analysis.charts.unitOrder",
      scopeLabelKey: "analysis.scope.last30Days",
      color: "#2563eb",
      money: false,
      data: normalizeTrendRows(orders?.timing?.trendByDay, {
        dateKey: "day",
        valueKeys: ["ordersCount", "orders_count"],
        locale,
      }),
    },
    {
      key: "subscriptions",
      titleKey: "analysis.charts.subscriptionsCount",
      subtitleKey: "analysis.charts.subscriptionsTrendSubtitle",
      unitKey: "analysis.charts.unitSubscription",
      scopeLabelKey: "analysis.charts.scopeMonthlyHistorical",
      color: "#7c3aed",
      money: false,
      data: normalizeTrendRows(subscriptions?.trendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["subscriptionsCount", "subscriptions_count"],
        locale,
      }),
    },
    {
      key: "financial",
      titleKey: "analysis.charts.financialClaims",
      subtitleKey: "analysis.charts.financialTrendSubtitle",
      unitKey: "analysis.charts.unitJod",
      scopeLabelKey: "analysis.charts.scopeMonthlyHistorical",
      color: "#ca8a04",
      money: true,
      data: normalizeTrendRows(financial?.paymentTrendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["amountJod", "amount_jod"],
        locale,
      }),
    },
    {
      key: "courses",
      titleKey: "analysis.charts.courseEnrollments",
      subtitleKey: "analysis.charts.coursesTrendSubtitle",
      unitKey: "analysis.charts.unitEnrollment",
      scopeLabelKey: "analysis.charts.scopeMonthlyHistorical",
      color: "#166534",
      money: false,
      data: normalizeTrendRows(courses?.enrollmentTrendByMonth, {
        dateKey: "monthStart",
        valueKeys: ["enrollments"],
        locale,
      }),
    },
  ];
}
