import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { formatInt, formatMoneyJod } from "../../components/analytics/super-admin/superAdminHomeBundleUi";
import { isUnknownCountryRow } from "../../components/analytics/super-admin/registerAnalysisLocale";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getSuperadminDashboardAnalysisRequest } from "../../services/api";
import { withResolvedCountryNames } from "../../utils/countryDisplayAr";
import "../../styles/adminOverviewSoft.css";
import "../../styles/adminAnalysisSoft.css";

const RANGE_OPTION_KEYS = [
  { value: "all", labelKey: "analysis.range.all" },
  { value: "today", labelKey: "analysis.range.today" },
  { value: "7d", labelKey: "analysis.range.7d" },
  { value: "30d", labelKey: "analysis.range.30d" },
  { value: "this_month", labelKey: "analysis.range.this_month" },
  { value: "last_month", labelKey: "analysis.range.last_month" },
];

function SoftHBars({ rows, valueKey = "value", labelKey = "label", emptyMessage }) {
  const list = rows || [];
  if (!list.length) {
    return <p className="aos-chart__empty">{emptyMessage}</p>;
  }
  const max = Math.max(1, ...list.map((r) => Number(r[valueKey]) || 0));
  return (
    <div className="aos-hbars">
      {list.map((row) => {
        const value = Number(row[valueKey]) || 0;
        const pct = Math.max(6, Math.round((value / max) * 100));
        const id = row.countryCode || row.planId || row[labelKey];
        return (
          <div key={id} className="aos-hbar">
            <div className="aos-hbar__top">
              <span className="aos-hbar__name">{row[labelKey]}</span>
              <span className="aos-hbar__meta">{formatInt(value)}</span>
            </div>
            <div className="aos-hbar__track" aria-hidden>
              <span className="aos-hbar__fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SoftKpi({ label, value, hint, money, textValue }) {
  const display = textValue
    ? value || "—"
    : money
      ? formatMoneyJod(value)
      : formatInt(value);
  return (
    <div className="aos-kpi">
      <p className="aos-kpi__label">{label}</p>
      <div className="aos-kpi__row">
        <strong className="aos-kpi__value">{display}</strong>
        {hint ? <span className="aos-kpi__delta aos-kpi__delta--neutral">{hint}</span> : null}
      </div>
    </div>
  );
}

function SoftMetricGrid({ items, columns = 4 }) {
  return (
    <div className={`aan-metric-grid aan-metric-grid--${columns}`}>
      {items.map((item) => (
        <div key={item.key || item.label} className="aan-metric">
          <span className="aan-metric__label">{item.label}</span>
          <strong className="aan-metric__value">
            {item.money ? formatMoneyJod(item.value) : formatInt(item.value)}
          </strong>
          {item.hint ? <span className="aan-metric__hint">{item.hint}</span> : null}
        </div>
      ))}
    </div>
  );
}

function PlanGroupCard({ group, t }) {
  const topPlan = group.topPlans?.[0];
  const metrics = [
    { label: t("analysis.kpi.totalSubscriptions"), value: group.totalSubscriptions },
    { label: t("analysis.kpi.paid"), value: group.paidSubscriptions },
    { label: t("analysis.kpi.adminAssignedShort"), value: group.adminAssignedSubscriptions },
    { label: t("analysis.kpi.free"), value: group.freeNotRequiredSubscriptions },
    { label: t("analysis.kpi.active"), value: group.activeSubscriptions },
    { label: t("analysis.kpi.paidValue"), value: group.paidRevenueJod, money: true },
  ];

  return (
    <article className="aos-card">
      <header className="aos-card__head">
        <div>
          <h3 className="aos-card__title">{group.groupLabel}</h3>
          {group.planPages?.length ? (
            <p className="aos-card__desc">
              {group.planPages.map((p) => p.title || p.slug).filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
      </header>
      <SoftMetricGrid items={metrics.map((m, i) => ({ ...m, key: `${group.groupKey}-${i}` }))} columns={3} />
      {topPlan ? (
        <footer className="aan-group-footer">
          <span className="aan-group-footer__label">{t("analysis.planGroup.topPlan")}</span>
          <span className="aan-group-footer__value">
            {topPlan.planTitle}
            <em className="aan-group-footer__count">
              {t("analysis.planGroup.subscribers", { count: formatInt(topPlan.totalSubscribers) })}
            </em>
          </span>
        </footer>
      ) : null}
    </article>
  );
}

function SoftPill({ tone = "muted", children }) {
  return <span className={`aos-pill aos-pill--${tone}`}>{children}</span>;
}

export default function SuperAdminAnalysisPage() {
  const { t } = useTranslation();
  const [range, setRange] = useState("all");
  const [currentOnly, setCurrentOnly] = useState(true);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async ({ isRefresh = false } = {}) => {
      if (!isRefresh) setError("");
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const res = await getSuperadminDashboardAnalysisRequest({
          params: { range, currentOnly },
          timeout: 20000,
        });
        setData(res?.data || null);
        setError("");
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || t("analysis.errors.loadAnalysis"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, currentOnly, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const usersByCountry = data?.usersByCountry;
  const subOverview = data?.subscriptionOverview;
  const byPlan = data?.subscriptionsByPlan || [];
  const byPlanGroup = data?.subscriptionsByPlanGroup || [];

  const userCountries = useMemo(
    () => withResolvedCountryNames(usersByCountry?.countries || []),
    [usersByCountry?.countries],
  );

  const subCountries = useMemo(
    () => withResolvedCountryNames(data?.subscriptionsByCountry || []),
    [data?.subscriptionsByCountry],
  );

  const topUserCountry = userCountries.find((r) => !isUnknownCountryRow(r)) || userCountries[0];

  const topUserBars = useMemo(
    () =>
      userCountries
        .filter((r) => !isUnknownCountryRow(r))
        .slice(0, 8)
        .map((r) => ({
          countryCode: r.countryCode,
          label: r.countryName,
          value: r.totalUsers,
        })),
    [userCountries],
  );

  const topSubBars = useMemo(
    () =>
      subCountries
        .filter((r) => !isUnknownCountryRow(r))
        .slice(0, 8)
        .map((r) => ({
          countryCode: r.countryCode,
          label: r.countryName,
          value: r.totalSubscriptions,
        })),
    [subCountries],
  );

  const heroCards = useMemo(
    () => [
      {
        key: "users",
        label: t("analysis.kpi.totalUsers"),
        value: usersByCountry?.totalUsers,
        hint: t("analysis.kpi.clientsAndFreelancers"),
      },
      {
        key: "topCountry",
        label: t("analysis.kpi.topCountry"),
        value: topUserCountry?.countryName || "—",
        hint: topUserCountry
          ? t("analysis.kpi.usersCount", { count: formatInt(topUserCountry.totalUsers) })
          : null,
        textValue: true,
      },
      {
        key: "subs",
        label: t("analysis.kpi.totalCurrentSubscriptions"),
        value: subOverview?.totalCurrent,
      },
      {
        key: "paid",
        label: t("analysis.kpi.paidSubscriptions"),
        value: subOverview?.paid,
      },
      {
        key: "admin",
        label: t("analysis.kpi.adminAssigned"),
        value: subOverview?.adminAssigned,
      },
      {
        key: "revenue",
        label: t("analysis.kpi.paidRevenueTotal"),
        value: subOverview?.paidRevenueJod,
        money: true,
      },
    ],
    [usersByCountry?.totalUsers, topUserCountry, subOverview, t],
  );

  const subscriptionCards = useMemo(
    () => [
      {
        key: "total",
        label: t("analysis.kpi.totalCurrentSubscriptions"),
        value: subOverview?.totalCurrent,
      },
      { key: "paid", label: t("analysis.kpi.paid"), value: subOverview?.paid },
      {
        key: "admin",
        label: t("analysis.kpi.adminAssignedShort"),
        value: subOverview?.adminAssigned,
        hint: t("analysis.kpi.adminAssignedHint"),
      },
      {
        key: "free",
        label: t("analysis.kpi.freeNotRequired"),
        value: subOverview?.freeNotRequired,
      },
      {
        key: "pendingAct",
        label: t("analysis.kpi.pendingCompanyActivation"),
        value: subOverview?.pendingCompanyActivation,
      },
      {
        key: "notStarted",
        label: t("analysis.kpi.assignedNotStarted"),
        value: subOverview?.assignedNotStarted,
      },
      { key: "active", label: t("analysis.kpi.active"), value: subOverview?.active },
      {
        key: "inactive",
        label: t("analysis.kpi.inactiveCancelled"),
        value: subOverview?.inactiveCancelled,
      },
    ],
    [subOverview, t],
  );

  const handleRefresh = () => void load({ isRefresh: true });
  const isInitialLoad = loading && !data;
  const hasData = Boolean(data);
  const rangeLabel =
    t(RANGE_OPTION_KEYS.find((o) => o.value === range)?.labelKey || "analysis.range.7d") || range;

  const chartEmpty = t("analysis.chart.emptyInsufficient");
  const loadingGeneric = t("analysis.loading.generic");

  return (
    <DashboardShell>
      <div className={`aos-page aan-page${refreshing ? " aan-page--refreshing" : ""}`}>
        <header className="aos-dash-head">
          <div className="aos-dash-head__titles">
            <h1 className="aos-dash-head__title">{t("analysis.page.title")}</h1>
            <p className="aos-dash-head__desc">{t("analysis.page.subtitle")}</p>
          </div>
          <div className="aos-dash-head__tools">
            <label className="aos-tool aan-tool-select" htmlFor="aan-range">
              <CalendarRange size={14} strokeWidth={2} aria-hidden />
              <select
                id="aan-range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                aria-label={t("analysis.range.ariaLabel")}
              >
                {RANGE_OPTION_KEYS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="aos-tool aos-tool--btn aan-check">
              <input
                type="checkbox"
                checked={currentOnly}
                onChange={(e) => setCurrentOnly(e.target.checked)}
              />
              {t("analysis.filter.currentSubscriptionsOnly")}
            </label>
            <button
              type="button"
              className="aos-tool aos-tool--btn"
              onClick={handleRefresh}
              disabled={refreshing || isInitialLoad}
            >
              <RefreshCw size={14} strokeWidth={2} className={refreshing ? "aos-spin" : undefined} aria-hidden />
              {refreshing ? t("analysis.actions.refreshing") : t("analysis.actions.refresh")}
            </button>
          </div>
        </header>

        {error && !hasData ? (
          <p className="aos-notice aos-notice--error" role="alert">
            {error}{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              {t("analysis.actions.retry")}
            </button>
          </p>
        ) : null}

        {error && hasData ? (
          <p className="aos-notice" role="status">
            {error}{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              {t("analysis.actions.retry")}
            </button>
          </p>
        ) : null}

        <section className="aos-card" aria-labelledby="aan-summary-title">
          <header className="aos-card__head">
            <div>
              <h2 id="aan-summary-title" className="aos-card__title">
                {t("analysis.summary.title")}
              </h2>
              <p className="aos-card__desc">{t("analysis.summary.desc", { range: rangeLabel })}</p>
            </div>
          </header>
          {isInitialLoad ? (
            <p className="aos-chart__empty">{t("analysis.loading.stats")}</p>
          ) : (
            <div className="aos-kpi-grid aan-kpi-grid--6">
              {heroCards.map((card) => (
                <SoftKpi
                  key={card.key}
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  money={card.money}
                  textValue={card.textValue}
                />
              ))}
            </div>
          )}
        </section>

        <section className="aos-bot-grid" aria-label={t("analysis.usersByCountry.sectionAria")}>
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">{t("analysis.usersByCountry.topCountriesTitle")}</h2>
                <p className="aos-card__desc">{t("analysis.usersByCountry.topCountriesDesc")}</p>
              </div>
              <span className="aos-chip">{t("analysis.usersByCountry.topEight")}</span>
            </header>
            {isInitialLoad ? (
              <p className="aos-chart__empty">{loadingGeneric}</p>
            ) : (
              <SoftHBars rows={topUserBars} emptyMessage={chartEmpty} />
            )}
          </article>

          <article className="aos-list-panel">
            <header className="aos-list-head">
              <div className="aos-list-head__top">
                <div>
                  <h2 className="aos-list-head__title">{t("analysis.usersByCountry.tableTitle")}</h2>
                  <p className="aos-list-head__desc">{t("analysis.usersByCountry.tableDesc")}</p>
                </div>
              </div>
              {!isInitialLoad ? (
                <SoftMetricGrid
                  columns={3}
                  items={[
                    {
                      key: "known",
                      label: t("analysis.usersByCountry.knownCountry"),
                      value: usersByCountry?.totalKnown,
                    },
                    {
                      key: "unknown",
                      label: t("analysis.usersByCountry.unknownCountry"),
                      value: usersByCountry?.totalUnknown,
                    },
                    {
                      key: "total",
                      label: t("analysis.usersByCountry.totalClientsFreelancers"),
                      value: usersByCountry?.totalUsers,
                    },
                  ]}
                />
              ) : null}
            </header>

            {isInitialLoad ? (
              <p className="aos-empty">{loadingGeneric}</p>
            ) : userCountries.length ? (
              <div className="aos-table-wrap">
                <table className="aos-table">
                  <thead>
                    <tr>
                      <th>{t("analysis.usersByCountry.colCountry")}</th>
                      <th>{t("analysis.usersByCountry.colTotalUsers")}</th>
                      <th className="aan-col--clients">{t("analysis.usersByCountry.colClients")}</th>
                      <th className="aan-col--freelancers">{t("analysis.usersByCountry.colFreelancers")}</th>
                      <th className="aan-col--share">{t("analysis.usersByCountry.colShare")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userCountries.map((row) => (
                      <tr key={row.countryCode || row.countryName}>
                        <td>
                          <strong className="aos-stack__primary">{row.countryName}</strong>
                        </td>
                        <td>
                          <span className="aos-stack__primary">{formatInt(row.totalUsers)}</span>
                        </td>
                        <td className="aan-col--clients">
                          <span className="aos-stack__sub">{formatInt(row.clients)}</span>
                        </td>
                        <td className="aan-col--freelancers">
                          <span className="aos-stack__sub">{formatInt(row.freelancers)}</span>
                        </td>
                        <td className="aan-col--share">
                          <span className="aos-stack__sub">
                            {row.sharePct != null
                              ? t("analysis.sharePercent", { value: row.sharePct })
                              : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aos-empty">{t("analysis.usersByCountry.empty")}</p>
            )}
          </article>
        </section>

        <section className="aos-card" aria-labelledby="aan-subs-overview-title">
          <header className="aos-card__head">
            <div>
              <h2 id="aan-subs-overview-title" className="aos-card__title">
                {t("analysis.freelancerSubscriptions.title")}
              </h2>
              <p className="aos-card__desc">{t("analysis.freelancerSubscriptions.desc")}</p>
            </div>
          </header>
          {isInitialLoad ? (
            <p className="aos-chart__empty">{loadingGeneric}</p>
          ) : (
            <SoftMetricGrid items={subscriptionCards} columns={4} />
          )}
        </section>

        <section className="aos-list-panel" aria-labelledby="aan-by-plan-title">
          <header className="aos-list-head">
            <div className="aos-list-head__top">
              <div>
                <h2 id="aan-by-plan-title" className="aos-list-head__title">
                  {t("analysis.byPlan.title")}
                </h2>
                <p className="aos-list-head__desc">{t("analysis.byPlan.desc")}</p>
              </div>
            </div>
          </header>

          {isInitialLoad ? (
            <p className="aos-empty">{loadingGeneric}</p>
          ) : byPlan.length ? (
            <div className="aos-table-wrap aan-table-scroll">
              <table className="aos-table aan-table--plans">
                <thead>
                  <tr>
                    <th>{t("analysis.byPlan.colPlan")}</th>
                    <th>{t("analysis.byPlan.colPrice")}</th>
                    <th className="aan-col--duration">{t("analysis.byPlan.colDuration")}</th>
                    <th>{t("analysis.byPlan.colTotal")}</th>
                    <th className="aan-col--paid">{t("analysis.byPlan.colPaid")}</th>
                    <th className="aan-col--admin">{t("analysis.byPlan.colAdmin")}</th>
                    <th className="aan-col--free">{t("analysis.byPlan.colFree")}</th>
                    <th className="aan-col--active">{t("analysis.byPlan.colActive")}</th>
                    <th className="aan-col--pending">{t("analysis.byPlan.colPendingActivation")}</th>
                    <th className="aan-col--notstarted">{t("analysis.byPlan.colNotStarted")}</th>
                    <th>{t("analysis.byPlan.colPaidValue")}</th>
                  </tr>
                </thead>
                <tbody>
                  {byPlan.map((plan) => (
                    <tr key={plan.planId}>
                      <td>
                        <div className="aos-stack">
                          <strong className="aos-stack__primary">{plan.planTitle}</strong>
                          <span className="aos-stack__sub">#{plan.planId}</span>
                          <div className="aan-plan-badges">
                            {plan.paidSubscribers > 0 ? (
                              <SoftPill tone="ok">
                                {t("analysis.byPlan.pillPaid", { count: formatInt(plan.paidSubscribers) })}
                              </SoftPill>
                            ) : null}
                            {plan.adminAssignedSubscribers > 0 ? (
                              <SoftPill tone="info">
                                {t("analysis.byPlan.pillAdmin", {
                                  count: formatInt(plan.adminAssignedSubscribers),
                                })}
                              </SoftPill>
                            ) : null}
                            {plan.freeNotRequiredSubscribers > 0 ? (
                              <SoftPill tone="muted">
                                {t("analysis.byPlan.pillFree", {
                                  count: formatInt(plan.freeNotRequiredSubscribers),
                                })}
                              </SoftPill>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="aos-stack">
                          <span className="aos-stack__primary">
                            {plan.priceJod != null ? formatMoneyJod(plan.priceJod) : "—"}
                          </span>
                          {plan.paidSubscribers > 0 ? (
                            <span className="aos-stack__sub">{t("analysis.byPlan.activationFeesNote")}</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="aan-col--duration">
                        <span className="aos-stack__sub">
                          {plan.durationDays != null
                            ? t("analysis.byPlan.durationDays", { count: formatInt(plan.durationDays) })
                            : "—"}
                        </span>
                      </td>
                      <td>
                        <span className="aos-stack__primary">{formatInt(plan.totalSubscribers)}</span>
                      </td>
                      <td className="aan-col--paid">
                        <span className="aos-stack__sub">{formatInt(plan.paidSubscribers)}</span>
                      </td>
                      <td className="aan-col--admin">
                        <span className="aos-stack__sub">{formatInt(plan.adminAssignedSubscribers)}</span>
                      </td>
                      <td className="aan-col--free">
                        <span className="aos-stack__sub">{formatInt(plan.freeNotRequiredSubscribers)}</span>
                      </td>
                      <td className="aan-col--active">
                        <span className="aos-stack__sub">{formatInt(plan.activeSubscribers)}</span>
                      </td>
                      <td className="aan-col--pending">
                        <span className="aos-stack__sub">{formatInt(plan.pendingActivation)}</span>
                      </td>
                      <td className="aan-col--notstarted">
                        <span className="aos-stack__sub">{formatInt(plan.assignedNotStarted)}</span>
                      </td>
                      <td>
                        <div className="aos-stack">
                          <span className="aos-stack__primary">{formatMoneyJod(plan.paidRevenueJod)}</span>
                          {plan.paidRevenueJod > 0 ? (
                            <span className="aos-stack__sub">
                              {[
                                plan.paidPlanRevenueJod > 0
                                  ? t("analysis.byPlan.revenuePlan", {
                                      amount: formatMoneyJod(plan.paidPlanRevenueJod),
                                    })
                                  : null,
                                plan.paidActivationFeeRevenueJod > 0
                                  ? t("analysis.byPlan.revenueActivation", {
                                      amount: formatMoneyJod(plan.paidActivationFeeRevenueJod),
                                    })
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" + ")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="aos-empty">{t("analysis.byPlan.empty")}</p>
          )}
        </section>

        <section className="aos-extra-grid" aria-label={t("analysis.planGroup.sectionAria")}>
          {isInitialLoad ? (
            <article className="aos-card">
              <p className="aos-chart__empty">{loadingGeneric}</p>
            </article>
          ) : byPlanGroup.length ? (
            byPlanGroup.map((group) => <PlanGroupCard key={group.groupKey} group={group} t={t} />)
          ) : (
            <article className="aos-card">
              <p className="aos-chart__empty">{t("analysis.planGroup.empty")}</p>
            </article>
          )}
        </section>

        <section className="aos-bot-grid" aria-label={t("analysis.subsByCountry.sectionAria")}>
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">{t("analysis.subsByCountry.topCountriesTitle")}</h2>
                <p className="aos-card__desc">{t("analysis.subsByCountry.topCountriesDesc")}</p>
              </div>
              <span className="aos-chip">{t("analysis.usersByCountry.topEight")}</span>
            </header>
            {isInitialLoad ? (
              <p className="aos-chart__empty">{loadingGeneric}</p>
            ) : (
              <SoftHBars rows={topSubBars} emptyMessage={chartEmpty} />
            )}
          </article>

          <article className="aos-list-panel">
            <header className="aos-list-head">
              <div className="aos-list-head__top">
                <div>
                  <h2 className="aos-list-head__title">{t("analysis.subsByCountry.tableTitle")}</h2>
                  <p className="aos-list-head__desc">{t("analysis.subsByCountry.tableDesc")}</p>
                </div>
              </div>
            </header>

            {isInitialLoad ? (
              <p className="aos-empty">{loadingGeneric}</p>
            ) : subCountries.length ? (
              <div className="aos-table-wrap">
                <table className="aos-table">
                  <thead>
                    <tr>
                      <th>{t("analysis.subsByCountry.colCountry")}</th>
                      <th>{t("analysis.subsByCountry.colSubscriptions")}</th>
                      <th className="aan-col--paid">{t("analysis.subsByCountry.colPaid")}</th>
                      <th className="aan-col--admin">{t("analysis.subsByCountry.colAdmin")}</th>
                      <th className="aan-col--plan">{t("analysis.subsByCountry.colTopPlan")}</th>
                      <th>{t("analysis.subsByCountry.colPaidValue")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subCountries.map((row) => (
                      <tr key={row.countryCode || row.countryName}>
                        <td>
                          <strong className="aos-stack__primary">{row.countryName}</strong>
                        </td>
                        <td>
                          <span className="aos-stack__primary">{formatInt(row.totalSubscriptions)}</span>
                        </td>
                        <td className="aan-col--paid">
                          <span className="aos-stack__sub">{formatInt(row.paidSubscriptions)}</span>
                        </td>
                        <td className="aan-col--admin">
                          <span className="aos-stack__sub">{formatInt(row.adminAssignedSubscriptions)}</span>
                        </td>
                        <td className="aan-col--plan">
                          <span className="aos-stack__sub">{row.topPlan?.planTitle || "—"}</span>
                        </td>
                        <td>
                          <span className="aos-stack__primary">{formatMoneyJod(row.paidRevenueJod)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aos-empty">{t("analysis.subsByCountry.empty")}</p>
            )}
          </article>
        </section>
      </div>
    </DashboardShell>
  );
}
