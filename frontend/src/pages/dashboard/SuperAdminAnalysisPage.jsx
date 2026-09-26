import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, RefreshCw } from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { formatInt, formatMoneyJod } from "../../components/analytics/super-admin/superAdminHomeBundleUi";
import { getSuperadminDashboardAnalysisRequest } from "../../services/api";
import { withResolvedCountryNames } from "../../utils/countryDisplayAr";
import "../../styles/adminOverviewSoft.css";
import "../../styles/adminAnalysisSoft.css";

const RANGE_OPTIONS = [
  { value: "all", label: "كل الفترات" },
  { value: "today", label: "اليوم" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يوماً" },
  { value: "this_month", label: "هذا الشهر" },
  { value: "last_month", label: "الشهر الماضي" },
];

function SoftHBars({ rows, valueKey = "value", labelKey = "label" }) {
  const list = rows || [];
  if (!list.length) {
    return <p className="aos-chart__empty">لا توجد بيانات كافية لعرض المخطط.</p>;
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

function PlanGroupCard({ group }) {
  const topPlan = group.topPlans?.[0];
  const metrics = [
    { label: "إجمالي الاشتراكات", value: group.totalSubscriptions },
    { label: "مدفوعة", value: group.paidSubscriptions },
    { label: "إسناد إداري", value: group.adminAssignedSubscriptions },
    { label: "مجانية", value: group.freeNotRequiredSubscriptions },
    { label: "نشطة", value: group.activeSubscriptions },
    { label: "قيمة مدفوعة", value: group.paidRevenueJod, money: true },
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
          <span className="aan-group-footer__label">أشهر باقة</span>
          <span className="aan-group-footer__value">
            {topPlan.planTitle}
            <em className="aan-group-footer__count">{formatInt(topPlan.totalSubscribers)} مشترك</em>
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
        setError(e?.response?.data?.message || e?.message || "تعذر تحميل بيانات التحليل.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, currentOnly],
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

  const topUserCountry = userCountries.find((r) => r.countryName !== "غير معروف") || userCountries[0];

  const topUserBars = useMemo(
    () =>
      userCountries
        .filter((r) => r.countryName !== "غير معروف")
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
        .filter((r) => r.countryName !== "غير معروف")
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
        label: "إجمالي المستخدمين",
        value: usersByCountry?.totalUsers,
        hint: "عملاء ومستقلون",
      },
      {
        key: "topCountry",
        label: "أكثر دولة",
        value: topUserCountry?.countryName || "—",
        hint: topUserCountry ? `${formatInt(topUserCountry.totalUsers)} مستخدم` : null,
        textValue: true,
      },
      {
        key: "subs",
        label: "إجمالي الاشتراكات الحالية",
        value: subOverview?.totalCurrent,
      },
      {
        key: "paid",
        label: "الاشتراكات المدفوعة",
        value: subOverview?.paid,
      },
      {
        key: "admin",
        label: "الإسناد الإداري",
        value: subOverview?.adminAssigned,
      },
      {
        key: "revenue",
        label: "إجمالي قيمة الاشتراكات المدفوعة",
        value: subOverview?.paidRevenueJod,
        money: true,
      },
    ],
    [usersByCountry?.totalUsers, topUserCountry, subOverview],
  );

  const subscriptionCards = useMemo(
    () => [
      { key: "total", label: "إجمالي الاشتراكات الحالية", value: subOverview?.totalCurrent },
      { key: "paid", label: "مدفوعة", value: subOverview?.paid },
      {
        key: "admin",
        label: "إسناد إداري",
        value: subOverview?.adminAssigned,
        hint: "اشتراكات تم إسنادها من الإدارة",
      },
      { key: "free", label: "مجانية / لا تتطلب دفعاً", value: subOverview?.freeNotRequired },
      { key: "pendingAct", label: "بانتظار تفعيل الشركة", value: subOverview?.pendingCompanyActivation },
      { key: "notStarted", label: "لم تبدأ بعد", value: subOverview?.assignedNotStarted },
      { key: "active", label: "نشطة", value: subOverview?.active },
      { key: "inactive", label: "منتهية / ملغاة", value: subOverview?.inactiveCancelled },
    ],
    [subOverview],
  );

  const handleRefresh = () => void load({ isRefresh: true });
  const isInitialLoad = loading && !data;
  const hasData = Boolean(data);
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label || range;

  return (
    <DashboardShell>
      <div className={`aos-page aan-page${refreshing ? " aan-page--refreshing" : ""}`}>
        <header className="aos-dash-head">
          <div className="aos-dash-head__titles">
            <h1 className="aos-dash-head__title">التحليلات</h1>
            <p className="aos-dash-head__desc">
              نظرة تحليلية على توزيع المستخدمين والاشتراكات حسب الدولة والباقة
            </p>
          </div>
          <div className="aos-dash-head__tools">
            <label className="aos-tool aan-tool-select" htmlFor="aan-range">
              <CalendarRange size={14} strokeWidth={2} aria-hidden />
              <select
                id="aan-range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                aria-label="الفترة"
              >
                {RANGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
              الاشتراكات الحالية فقط
            </label>
            <button
              type="button"
              className="aos-tool aos-tool--btn"
              onClick={handleRefresh}
              disabled={refreshing || isInitialLoad}
            >
              <RefreshCw size={14} strokeWidth={2} className={refreshing ? "aos-spin" : undefined} aria-hidden />
              {refreshing ? "تحديث…" : "تحديث"}
            </button>
          </div>
        </header>

        {error && !hasData ? (
          <p className="aos-notice aos-notice--error" role="alert">
            {error}{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          </p>
        ) : null}

        {error && hasData ? (
          <p className="aos-notice" role="status">
            {error}{" "}
            <button type="button" className="aos-notice__btn" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          </p>
        ) : null}

        <section className="aos-card" aria-labelledby="aan-summary-title">
          <header className="aos-card__head">
            <div>
              <h2 id="aan-summary-title" className="aos-card__title">
                ملخص سريع
              </h2>
              <p className="aos-card__desc">أهم المؤشرات في لمحة — {rangeLabel}</p>
            </div>
          </header>
          {isInitialLoad ? (
            <p className="aos-chart__empty">جارٍ تحميل الإحصائيات…</p>
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

        <section className="aos-bot-grid" aria-label="تحليل المستخدمين حسب الدولة">
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">أعلى الدول (مستخدمون)</h2>
                <p className="aos-card__desc">توزيع العملاء والمستقلين</p>
              </div>
              <span className="aos-chip">أعلى 8</span>
            </header>
            {isInitialLoad ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftHBars rows={topUserBars} />
            )}
          </article>

          <article className="aos-list-panel">
            <header className="aos-list-head">
              <div className="aos-list-head__top">
                <div>
                  <h2 className="aos-list-head__title">تحليل المستخدمين حسب الدولة</h2>
                  <p className="aos-list-head__desc">حسب الدولة المسجّلة في الحساب</p>
                </div>
              </div>
              {!isInitialLoad ? (
                <SoftMetricGrid
                  columns={3}
                  items={[
                    { key: "known", label: "بدولة معروفة", value: usersByCountry?.totalKnown },
                    { key: "unknown", label: "دولة غير معروفة", value: usersByCountry?.totalUnknown },
                    { key: "total", label: "إجمالي العملاء والمستقلين", value: usersByCountry?.totalUsers },
                  ]}
                />
              ) : null}
            </header>

            {isInitialLoad ? (
              <p className="aos-empty">جارٍ التحميل…</p>
            ) : userCountries.length ? (
              <div className="aos-table-wrap">
                <table className="aos-table">
                  <thead>
                    <tr>
                      <th>الدولة</th>
                      <th>إجمالي المستخدمين</th>
                      <th className="aan-col--clients">العملاء</th>
                      <th className="aan-col--freelancers">المستقلون</th>
                      <th className="aan-col--share">النسبة</th>
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
                            {row.sharePct != null ? `${row.sharePct}٪` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="aos-empty">لا توجد بيانات مستخدمين</p>
            )}
          </article>
        </section>

        <section className="aos-card" aria-labelledby="aan-subs-overview-title">
          <header className="aos-card__head">
            <div>
              <h2 id="aan-subs-overview-title" className="aos-card__title">
                تحليل اشتراكات المستقلين
              </h2>
              <p className="aos-card__desc">حسب حالة الدفع والتفعيل</p>
            </div>
          </header>
          {isInitialLoad ? (
            <p className="aos-chart__empty">جارٍ التحميل…</p>
          ) : (
            <SoftMetricGrid items={subscriptionCards} columns={4} />
          )}
        </section>

        <section className="aos-list-panel" aria-labelledby="aan-by-plan-title">
          <header className="aos-list-head">
            <div className="aos-list-head__top">
              <div>
                <h2 id="aan-by-plan-title" className="aos-list-head__title">
                  الاشتراكات حسب الباقة
                </h2>
                <p className="aos-list-head__desc">مرتبة حسب عدد المشتركين الحاليين</p>
              </div>
            </div>
          </header>

          {isInitialLoad ? (
            <p className="aos-empty">جارٍ التحميل…</p>
          ) : byPlan.length ? (
            <div className="aos-table-wrap aan-table-scroll">
              <table className="aos-table aan-table--plans">
                <thead>
                  <tr>
                    <th>الباقة</th>
                    <th>السعر</th>
                    <th className="aan-col--duration">المدة</th>
                    <th>الإجمالي</th>
                    <th className="aan-col--paid">مدفوعة</th>
                    <th className="aan-col--admin">إسناد</th>
                    <th className="aan-col--free">مجانية</th>
                    <th className="aan-col--active">نشطة</th>
                    <th className="aan-col--pending">بانتظار التفعيل</th>
                    <th className="aan-col--notstarted">لم تبدأ</th>
                    <th>قيمة مدفوعة</th>
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
                              <SoftPill tone="ok">{formatInt(plan.paidSubscribers)} مدفوع</SoftPill>
                            ) : null}
                            {plan.adminAssignedSubscribers > 0 ? (
                              <SoftPill tone="info">{formatInt(plan.adminAssignedSubscribers)} إسناد</SoftPill>
                            ) : null}
                            {plan.freeNotRequiredSubscribers > 0 ? (
                              <SoftPill tone="muted">{formatInt(plan.freeNotRequiredSubscribers)} مجاني</SoftPill>
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
                            <span className="aos-stack__sub">يشمل رسوم التفعيل التاريخية عند وجودها</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="aan-col--duration">
                        <span className="aos-stack__sub">
                          {plan.durationDays != null ? `${formatInt(plan.durationDays)} يوم` : "—"}
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
                                  ? `${formatMoneyJod(plan.paidPlanRevenueJod)} باقة`
                                  : null,
                                plan.paidActivationFeeRevenueJod > 0
                                  ? `${formatMoneyJod(plan.paidActivationFeeRevenueJod)} تفعيل`
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
            <p className="aos-empty">لا توجد اشتراكات على الباقات</p>
          )}
        </section>

        <section className="aos-extra-grid" aria-label="تحليل الاشتراكات حسب نوع الباقة">
          {isInitialLoad ? (
            <article className="aos-card">
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            </article>
          ) : byPlanGroup.length ? (
            byPlanGroup.map((group) => <PlanGroupCard key={group.groupKey} group={group} />)
          ) : (
            <article className="aos-card">
              <p className="aos-chart__empty">لا توجد بيانات مجموعات باقات</p>
            </article>
          )}
        </section>

        <section className="aos-bot-grid" aria-label="الدول الأكثر اشتراكاً">
          <article className="aos-card">
            <header className="aos-card__head">
              <div>
                <h2 className="aos-card__title">أعلى الدول (اشتراكات)</h2>
                <p className="aos-card__desc">توزيع الاشتراكات حسب دولة المستقل</p>
              </div>
              <span className="aos-chip">أعلى 8</span>
            </header>
            {isInitialLoad ? (
              <p className="aos-chart__empty">جارٍ التحميل…</p>
            ) : (
              <SoftHBars rows={topSubBars} />
            )}
          </article>

          <article className="aos-list-panel">
            <header className="aos-list-head">
              <div className="aos-list-head__top">
                <div>
                  <h2 className="aos-list-head__title">الدول الأكثر اشتراكاً</h2>
                  <p className="aos-list-head__desc">مدفوع، إسناد، وأشهر باقة لكل دولة</p>
                </div>
              </div>
            </header>

            {isInitialLoad ? (
              <p className="aos-empty">جارٍ التحميل…</p>
            ) : subCountries.length ? (
              <div className="aos-table-wrap">
                <table className="aos-table">
                  <thead>
                    <tr>
                      <th>الدولة</th>
                      <th>الاشتراكات</th>
                      <th className="aan-col--paid">مدفوعة</th>
                      <th className="aan-col--admin">إسناد إداري</th>
                      <th className="aan-col--plan">أشهر باقة</th>
                      <th>قيمة مدفوعة</th>
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
              <p className="aos-empty">لا توجد بيانات اشتراكات حسب الدولة</p>
            )}
          </article>
        </section>
      </div>
    </DashboardShell>
  );
}
