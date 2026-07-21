import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BarChart3,
  CreditCard,
  Globe,
  MapPin,
  RefreshCw,
  Users,
} from "lucide-react";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardStatCard, { DashboardStatCardSkeleton } from "../../components/dashboard/DashboardStatCard";
import DashboardTable from "../../components/dashboard/DashboardTable";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { formatInt, formatMoneyJod } from "../../components/analytics/super-admin/superAdminHomeBundleUi";
import { getSuperadminDashboardAnalysisRequest } from "../../services/api";
import { withResolvedCountryNames } from "../../utils/countryDisplayAr";
import "../../styles/adminControlCenter.css";

const RANGE_OPTIONS = [
  { value: "all", label: "كل الفترات" },
  { value: "today", label: "اليوم" },
  { value: "7d", label: "آخر 7 أيام" },
  { value: "30d", label: "آخر 30 يوماً" },
  { value: "this_month", label: "هذا الشهر" },
  { value: "last_month", label: "الشهر الماضي" },
];

const SUBSCRIPTION_ACTIVATION_FEE_JOD = 25;

function CountryBarChart({ rows, maxBars = 8 }) {
  const top = (rows || []).filter((r) => r.countryName !== "غير معروف").slice(0, maxBars);
  if (!top.length) {
    return (
      <p className="sa-analysis-muted m-0 text-sm">لا توجد بيانات كافية لعرض المخطط.</p>
    );
  }
  const max = Math.max(...top.map((r) => r.totalUsers || r.totalSubscriptions || 0), 1);

  return (
    <div className="sa-analysis-bars" role="img" aria-label="أعلى الدول">
      {top.map((row) => {
        const value = row.totalUsers ?? row.totalSubscriptions ?? 0;
        const pct = Math.max(4, Math.round((100 * value) / max));
        return (
          <div key={row.countryCode || row.countryName} className="sa-analysis-bars__row">
            <span className="sa-analysis-bars__label">{row.countryName}</span>
            <span className="sa-analysis-bars__track" aria-hidden>
              <span className="sa-analysis-bars__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="sa-analysis-bars__value">{formatInt(value)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CompactKpiGrid({ items, loading, columns = 4 }) {
  if (loading) {
    return (
      <div className={`sa-analysis-kpi-grid sa-analysis-kpi-grid--${columns}`}>
        {Array.from({ length: items?.length || 6 }).map((_, i) => (
          <div key={i} className="sa-analysis-kpi sa-analysis-kpi--skeleton" aria-hidden />
        ))}
      </div>
    );
  }
  return (
    <div className={`sa-analysis-kpi-grid sa-analysis-kpi-grid--${columns}`}>
      {items.map((item) => (
        <div key={item.key} className="sa-analysis-kpi">
          <span className="sa-analysis-kpi__label">{item.label}</span>
          <strong className="sa-analysis-kpi__value">{item.money ? formatMoneyJod(item.value) : formatInt(item.value)}</strong>
          {item.hint ? <span className="sa-analysis-kpi__hint">{item.hint}</span> : null}
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
    <article className="sa-analysis-group-card">
      <header className="sa-analysis-group-card__head">
        <h3 className="sa-analysis-group-card__title">{group.groupLabel}</h3>
        {group.planPages?.length ? (
          <p className="sa-analysis-group-card__sub">
            {group.planPages.map((p) => p.title || p.slug).filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </header>
      <div className="sa-analysis-group-card__grid">
        {metrics.map((m) => (
          <div key={m.label} className="sa-analysis-group-card__metric">
            <span className="sa-analysis-group-card__metric-label">{m.label}</span>
            <strong className="sa-analysis-group-card__metric-value">
              {m.money ? formatMoneyJod(m.value) : formatInt(m.value)}
            </strong>
          </div>
        ))}
      </div>
      {topPlan ? (
        <footer className="sa-analysis-group-card__footer">
          <span className="sa-analysis-group-card__footer-label">أشهر باقة</span>
          <span className="sa-analysis-group-card__footer-value">
            {topPlan.planTitle}
            <em className="sa-analysis-group-card__footer-count">{formatInt(topPlan.totalSubscribers)} مشترك</em>
          </span>
        </footer>
      ) : null}
    </article>
  );
}

function SectionSkeleton({ rows = 4 }) {
  return (
    <div className="sa-analysis-section-skel" aria-busy="true" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }).map((_, i) => (
        <span key={i} className="sa-analysis-section-skel__line" />
      ))}
    </div>
  );
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

  const heroCards = useMemo(
    () => [
      {
        key: "users",
        label: "إجمالي المستخدمين",
        value: usersByCountry?.totalUsers,
        icon: <Users size={18} />,
        hint: "عملاء ومستقلون",
      },
      {
        key: "topCountry",
        label: "أكثر دولة",
        value: topUserCountry?.countryName || "—",
        icon: <MapPin size={18} />,
        hint: topUserCountry ? `${formatInt(topUserCountry.totalUsers)} مستخدم` : null,
        textValue: true,
      },
      {
        key: "subs",
        label: "إجمالي الاشتراكات الحالية",
        value: subOverview?.totalCurrent,
        icon: <CreditCard size={18} />,
      },
      {
        key: "paid",
        label: "الاشتراكات المدفوعة",
        value: subOverview?.paid,
        icon: <CreditCard size={18} />,
      },
      {
        key: "admin",
        label: "الإسناد الإداري",
        value: subOverview?.adminAssigned,
        icon: <Users size={18} />,
      },
      {
        key: "revenue",
        label: "إجمالي قيمة الاشتراكات المدفوعة",
        value: subOverview?.paidRevenueJod,
        money: true,
        icon: <Banknote size={18} />,
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

  const filterToolbar = (
    <div className="sa-analysis-toolbar" role="toolbar" aria-label="أدوات التحليلات">
      <div className="sa-analysis-toolbar__filters">
        <div className="sa-analysis-toolbar__group sa-analysis-toolbar__group--period">
          <label className="sa-analysis-toolbar__range" htmlFor="sa-analysis-range">
            <span className="sa-analysis-toolbar__range-label">الفترة</span>
            <select
              id="sa-analysis-range"
              className="input sa-analysis-toolbar__select"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="sa-analysis-toolbar__group sa-analysis-toolbar__group--scope">
          <label className="sa-analysis-toolbar__checkbox">
            <input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} />
            <span>الاشتراكات الحالية فقط</span>
          </label>
        </div>
      </div>

      <div className="sa-analysis-toolbar__divider" aria-hidden="true" />

      <button
        type="button"
        className={`btn btn-secondary sa-analysis-toolbar__refresh${refreshing ? " acc-btn--refreshing" : ""}`}
        onClick={handleRefresh}
        disabled={refreshing}
      >
        <RefreshCw size={16} className={refreshing ? "acc-spin" : undefined} aria-hidden />
        <span>{refreshing ? "جارٍ التحديث…" : "تحديث"}</span>
      </button>
    </div>
  );

  if (isInitialLoad) {
    return (
      <DashboardShell>
        <DashboardPageHeader eyebrow="لوحة الإدارة" title="التحليلات" description="جارٍ تحميل الإحصائيات…" />
        <DashboardSection title="ملخص سريع">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <DashboardStatCardSkeleton key={i} />
            ))}
          </div>
        </DashboardSection>
        <DashboardSection title="تحليل المستخدمين حسب الدولة">
          <SectionSkeleton />
        </DashboardSection>
      </DashboardShell>
    );
  }

  if (error && !hasData) {
    return (
      <DashboardShell>
        <DashboardPageHeader eyebrow="لوحة الإدارة" title="التحليلات" />
        <DashboardErrorState
          message={error}
          actions={
            <button type="button" className="btn btn-secondary" onClick={handleRefresh}>
              إعادة المحاولة
            </button>
          }
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className={`sa-analysis-page${refreshing ? " sa-analysis-page--refreshing" : ""}`}>
        <DashboardPageHeader
          eyebrow="لوحة الإدارة"
          title="التحليلات"
          description="نظرة تحليلية على توزيع المستخدمين والاشتراكات حسب الدولة والباقة."
          actions={filterToolbar}
        />

        {error ? (
          <DashboardErrorState
            message={error}
            className="mb-4"
            actions={
              <button type="button" className="btn btn-secondary btn-sm" onClick={handleRefresh}>
                إعادة المحاولة
              </button>
            }
          />
        ) : null}

        <DashboardSection title="ملخص سريع" description="أهم المؤشرات في لمحة واحدة.">
          <div className="sa-analysis-hero-grid">
            {heroCards.map((card) => (
              <DashboardStatCard
                key={card.key}
                label={card.label}
                value={card.textValue ? card.value : card.money ? formatMoneyJod(card.value) : formatInt(card.value)}
                hint={card.hint}
                icon={card.icon}
                className="sa-analysis-hero-card"
              />
            ))}
          </div>
        </DashboardSection>

        <DashboardSection
          title="تحليل المستخدمين حسب الدولة"
          description="توزيع العملاء والمستقلين حسب الدولة المسجّلة في الحساب."
          actions={<Globe size={18} className="text-slate-400" aria-hidden />}
        >
          {hasData ? (
            <>
              <CompactKpiGrid
                columns={3}
                items={[
                  { key: "known", label: "بدولة معروفة", value: usersByCountry?.totalKnown },
                  { key: "unknown", label: "دولة غير معروفة", value: usersByCountry?.totalUnknown },
                  { key: "total", label: "إجمالي العملاء والمستقلين", value: usersByCountry?.totalUsers },
                ]}
                loading={false}
              />
              <div className="sa-analysis-split mt-5">
                <div className="sa-analysis-split__chart">
                  <p className="sa-analysis-split__chart-title">أعلى 8 دول</p>
                  <CountryBarChart rows={userCountries} maxBars={8} />
                </div>
                <div className="sa-analysis-split__table">
                  <DashboardTable caption="المستخدمون حسب الدولة" className="sa-analysis-table-wrap">
                    <thead>
                      <tr>
                        <th>الدولة</th>
                        <th>إجمالي المستخدمين</th>
                        <th>العملاء</th>
                        <th>المستقلون</th>
                        <th>النسبة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userCountries.map((row) => (
                        <tr key={row.countryCode || row.countryName}>
                          <td className="sa-analysis-table__country">{row.countryName}</td>
                          <td className="tabular-nums">{formatInt(row.totalUsers)}</td>
                          <td className="tabular-nums">{formatInt(row.clients)}</td>
                          <td className="tabular-nums">{formatInt(row.freelancers)}</td>
                          <td className="tabular-nums">{row.sharePct != null ? `${row.sharePct}٪` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DashboardTable>
                </div>
              </div>
              {!userCountries.length ? <DashboardEmptyState title="لا توجد بيانات مستخدمين" /> : null}
            </>
          ) : (
            <SectionSkeleton />
          )}
        </DashboardSection>

        <DashboardSection
          title="تحليل اشتراكات المستقلين"
          description="إحصائيات الاشتراكات الحالية حسب حالة الدفع والتفعيل."
          actions={<CreditCard size={18} className="text-slate-400" aria-hidden />}
        >
          <CompactKpiGrid items={subscriptionCards} loading={!hasData} columns={4} />
        </DashboardSection>

        <DashboardSection title="الاشتراكات حسب الباقة" description="مرتبة حسب عدد المشتركين الحاليين.">
          {byPlan.length ? (
            <DashboardTable caption="الاشتراكات حسب الباقة" className="sa-analysis-table-wrap sa-analysis-table-wrap--wide">
              <thead>
                <tr>
                  <th className="sa-analysis-table__sticky-col">الباقة</th>
                  <th>السعر</th>
                  <th>المدة</th>
                  <th>الإجمالي</th>
                  <th>مدفوعة</th>
                  <th>إسناد</th>
                  <th>مجانية</th>
                  <th>نشطة</th>
                  <th>بانتظار التفعيل</th>
                  <th>لم تبدأ</th>
                  <th>قيمة مدفوعة</th>
                </tr>
              </thead>
              <tbody>
                {byPlan.map((plan) => (
                  <tr key={plan.planId}>
                    <td className="sa-analysis-table__sticky-col">
                      <strong className="sa-analysis-plan-name">{plan.planTitle}</strong>
                      <span className="sa-analysis-plan-id">#{plan.planId}</span>
                      <div className="sa-analysis-plan-badges">
                        {plan.paidSubscribers > 0 ? (
                          <StatusBadge tone="success">{formatInt(plan.paidSubscribers)} مدفوع</StatusBadge>
                        ) : null}
                        {plan.adminAssignedSubscribers > 0 ? (
                          <StatusBadge tone="admin_assigned">{formatInt(plan.adminAssignedSubscribers)} إسناد</StatusBadge>
                        ) : null}
                        {plan.freeNotRequiredSubscribers > 0 ? (
                          <StatusBadge tone="neutral">{formatInt(plan.freeNotRequiredSubscribers)} مجاني</StatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="tabular-nums whitespace-nowrap">
                      {plan.priceJod != null ? formatMoneyJod(plan.priceJod) : "—"}
                      {plan.paidSubscribers > 0 ? (
                        <span className="sa-analysis-cell-note">
                          + رسوم تفعيل {formatMoneyJod(SUBSCRIPTION_ACTIVATION_FEE_JOD)}
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular-nums">{plan.durationDays != null ? `${formatInt(plan.durationDays)} يوم` : "—"}</td>
                    <td className="tabular-nums font-semibold">{formatInt(plan.totalSubscribers)}</td>
                    <td className="tabular-nums">{formatInt(plan.paidSubscribers)}</td>
                    <td className="tabular-nums">{formatInt(plan.adminAssignedSubscribers)}</td>
                    <td className="tabular-nums">{formatInt(plan.freeNotRequiredSubscribers)}</td>
                    <td className="tabular-nums">{formatInt(plan.activeSubscribers)}</td>
                    <td className="tabular-nums">{formatInt(plan.pendingActivation)}</td>
                    <td className="tabular-nums">{formatInt(plan.assignedNotStarted)}</td>
                    <td className="tabular-nums whitespace-nowrap">
                      {formatMoneyJod(plan.paidRevenueJod)}
                      {plan.paidRevenueJod > 0 ? (
                        <span className="sa-analysis-cell-note">
                          {[
                            plan.paidPlanRevenueJod > 0 ? `${formatMoneyJod(plan.paidPlanRevenueJod)} باقة` : null,
                            plan.paidActivationFeeRevenueJod > 0
                              ? `${formatMoneyJod(plan.paidActivationFeeRevenueJod)} تفعيل`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" + ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
          ) : (
            <DashboardEmptyState title="لا توجد اشتراكات على الباقات" />
          )}
        </DashboardSection>

        <DashboardSection
          title="تحليل الاشتراكات حسب نوع الباقة"
          description="الباقات الأساسية (صفحة /plans) مقابل باقات الصفحات المباشرة."
        >
          {byPlanGroup.length ? (
            <div className="sa-analysis-group-grid">
              {byPlanGroup.map((group) => (
                <PlanGroupCard key={group.groupKey} group={group} />
              ))}
            </div>
          ) : (
            <DashboardEmptyState title="لا توجد بيانات مجموعات باقات" />
          )}
        </DashboardSection>

        <DashboardSection
          title="الدول الأكثر اشتراكاً"
          description="توزيع الاشتراكات حسب دولة المستقل."
          actions={<BarChart3 size={18} className="text-slate-400" aria-hidden />}
        >
          {subCountries.length ? (
            <div className="sa-analysis-split">
              <div className="sa-analysis-split__chart">
                <p className="sa-analysis-split__chart-title">أعلى 8 دول</p>
                <CountryBarChart rows={subCountries} maxBars={8} />
              </div>
              <div className="sa-analysis-split__table">
                <DashboardTable caption="الاشتراكات حسب الدولة" className="sa-analysis-table-wrap">
                  <thead>
                    <tr>
                      <th>الدولة</th>
                      <th>الاشتراكات</th>
                      <th>مدفوعة</th>
                      <th>إسناد إداري</th>
                      <th>أشهر باقة</th>
                      <th>قيمة مدفوعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subCountries.map((row) => (
                      <tr key={row.countryCode || row.countryName}>
                        <td className="sa-analysis-table__country">{row.countryName}</td>
                        <td className="tabular-nums font-semibold">{formatInt(row.totalSubscriptions)}</td>
                        <td className="tabular-nums">{formatInt(row.paidSubscriptions)}</td>
                        <td className="tabular-nums">{formatInt(row.adminAssignedSubscriptions)}</td>
                        <td>{row.topPlan?.planTitle || "—"}</td>
                        <td className="tabular-nums whitespace-nowrap">{formatMoneyJod(row.paidRevenueJod)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DashboardTable>
              </div>
            </div>
          ) : (
            <DashboardEmptyState title="لا توجد بيانات اشتراكات حسب الدولة" />
          )}
        </DashboardSection>
      </div>
    </DashboardShell>
  );
}
