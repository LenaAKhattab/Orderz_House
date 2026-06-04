import PlanStatusBadge from "./PlanStatusBadge";
import PlanToggle from "./PlanToggle";
import { formatOrderValueRange, formatPriceJod, buildPlanBenefits } from "./planDisplayUtils";
import { KPI_LABELS } from "./planMetricTerminology";
import { computePlanHealth, LABEL_LOAD_FAILED, LABEL_UNAVAILABLE } from "./planPerformanceUtils";

/**
 * @param {{
 *   plan: Record<string, unknown>;
 *   badge?: { key: string; label: string } | null;
 *   platformContext?: { maxActive: number; strongActiveFloor: number };
 *   submitting: boolean;
 *   onActiveChange: (plan: Record<string, unknown>, nextActive: boolean) => void;
 *   onEdit: () => void;
 *   onManageDetails: () => void;
 *   onDelete: () => void;
 * }} p
 */
export default function AdminPlanCard({
  plan,
  badge = null,
  platformContext = null,
  submitting,
  onActiveChange,
  onEdit,
  onManageDetails,
  onDelete,
}) {
  const priceLabel = formatPriceJod(plan.priceJod);
  const orderRange = formatOrderValueRange(plan.orderValueMinJod, plan.orderValueMaxJod);
  const benefits = buildPlanBenefits(plan);
  const health = plan.portfolioHealth ?? computePlanHealth(plan, platformContext);
  const perf = plan.performance;
  const kpiFallback = perf?.state === "failed" ? LABEL_LOAD_FAILED : LABEL_UNAVAILABLE;
  const alerts = perf?.comparisonAlerts ?? [];
  const portfolioActions = plan.portfolioActions;
  const actionSignals = portfolioActions?.signals ?? [];
  const priority = portfolioActions?.priority;
  const recs = (perf?.recommendations ?? []).filter((r) => {
    if (r.key === "promote" && actionSignals.some((s) => s.key === "promote")) return false;
    if (
      (r.key === "review" || r.key === "fix_activation" || r.key === "rethink") &&
      actionSignals.some((s) => s.key === "review")
    ) {
      return false;
    }
    return true;
  });

  return (
    <article
      className={`oh-sapl-card${plan.isActive ? "" : " oh-sapl-card--inactive"}${badge ? ` oh-sapl-card--badge-${badge.key}` : ""}${priority ? ` oh-sapl-card--priority-${priority.key}` : ""}`}
    >
      <header className="oh-sapl-card__header">
        <div className="oh-sapl-card__header-main">
          <div className="oh-sapl-card__title-row">
            <h3 className="oh-sapl-card__title">{plan.title}</h3>
            {priority ? (
              <span
                className={`oh-sapl-action-priority oh-sapl-action-priority--${priority.key}`}
                title={`درجة الانتباه: ${priority.score ?? 0}`}
              >
                <span className="oh-sapl-action-priority__emoji" aria-hidden>
                  {priority.emoji}
                </span>
                {priority.label}
              </span>
            ) : null}
            {badge ? <span className={`oh-sapl-plan-badge oh-sapl-plan-badge--${badge.key}`}>{badge.label}</span> : null}
          </div>
          {actionSignals.length > 0 ? (
            <div className="oh-sapl-card__action-signals" role="list" aria-label="إجراءات مقترحة">
              {actionSignals.map((s) => (
                <span
                  key={s.key}
                  role="listitem"
                  className={`oh-sapl-action-signal oh-sapl-action-signal--${s.key}${s.severity ? ` oh-sapl-action-signal--${s.severity}` : ""}`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          ) : null}
          <div className="oh-sapl-card__status-row">
            <PlanStatusBadge variant={plan.isActive ? "active" : "inactive"} />
            {plan.isVisible ? <PlanStatusBadge variant="visible" /> : <PlanStatusBadge variant="hidden" />}
            {health ? (
              <span className={`oh-sapl-health oh-sapl-health--${health.key}`} title={health.title}>
                {health.label}
              </span>
            ) : null}
          </div>
          {recs.length > 0 ? (
            <div className="oh-sapl-card__recs">
              {recs.map((r) => (
                <span key={r.key} className={`oh-sapl-rec oh-sapl-rec--${r.key}`}>
                  {r.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="oh-sapl-card__header-toggle">
          <span className="oh-sapl-card__active-label">تشغيل</span>
          <PlanToggle
            compact
            ariaLabel={`${plan.isActive ? "تعطيل" : "تفعيل"} الباقة «${plan.title}»`}
            checked={Boolean(plan.isActive)}
            disabled={submitting}
            onChange={(next) => onActiveChange(plan, next)}
          />
        </div>
      </header>

      <div className="oh-sapl-card__body">
        <p className="oh-sapl-card__price">{priceLabel ?? "مجانية"}</p>

        <div className="oh-sapl-card__meta-row">
          <span>{plan.durationDays} يوم</span>
          <span className="oh-sapl-card__meta-sep" aria-hidden>
            ·
          </span>
          <span>ترتيب #{plan.sortOrder ?? 0}</span>
        </div>

        <div className="oh-sapl-card__kpi-row" aria-label="مؤشرات الاشتراك">
          <div className="oh-sapl-card__kpi">
            <span className="oh-sapl-card__kpi-label" title={KPI_LABELS.currentSubscriptions.title}>
              {KPI_LABELS.currentSubscriptions.label}
            </span>
            <strong className="oh-sapl-card__kpi-value">{perf?.subscribers?.display ?? kpiFallback}</strong>
            {perf?.subscriberTrendDisplay ? (
              <span
                className={`oh-sapl-card__trend oh-sapl-card__trend--${perf.subscriberTrendDisplay.trend}`}
                title={KPI_LABELS.monthTrendSubs.title}
              >
                {perf.subscriberTrendDisplay.display}
                <span className="oh-sapl-card__trend-hint"> شهري</span>
              </span>
            ) : null}
          </div>
          <div className="oh-sapl-card__kpi">
            <span className="oh-sapl-card__kpi-label" title={KPI_LABELS.activeSubscriptions.title}>
              {KPI_LABELS.activeSubscriptions.label}
            </span>
            <strong className="oh-sapl-card__kpi-value">{perf?.activeSubscribers?.display ?? kpiFallback}</strong>
          </div>
          <div className="oh-sapl-card__kpi oh-sapl-card__kpi--wide">
            <span className="oh-sapl-card__kpi-label" title={KPI_LABELS.paidSubscriptionValue.title}>
              {KPI_LABELS.paidSubscriptionValue.label}
            </span>
            <strong className="oh-sapl-card__kpi-value">{perf?.revenueJod?.display ?? kpiFallback}</strong>
            {perf?.revenueTrendDisplay ? (
              <span
                className={`oh-sapl-card__trend oh-sapl-card__trend--${perf.revenueTrendDisplay.trend}`}
                title={KPI_LABELS.monthTrendRevenue.title}
              >
                {perf.revenueTrendDisplay.display}
                <span className="oh-sapl-card__trend-hint"> شهري</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className="oh-sapl-card__derived-row">
          {perf?.revenuePerSubscriber?.display ? (
            <span className="oh-sapl-card__derived">
              <span className="oh-sapl-card__derived-label" title={KPI_LABELS.paidPerCurrentSub.title}>
                {KPI_LABELS.paidPerCurrentSub.label}
              </span>
              <strong>{perf.revenuePerSubscriber.display}</strong>
            </span>
          ) : null}
          {perf?.activeShare?.display ? (
            <span className="oh-sapl-card__derived">
              <span className="oh-sapl-card__derived-label" title={KPI_LABELS.activeShare.title}>
                {KPI_LABELS.activeShare.label}
              </span>
              <strong>{perf.activeShare.display}</strong>
            </span>
          ) : null}
        </div>

        {perf?.revenueContribution?.display ? (
          <p className="oh-sapl-card__revenue-share">{perf.revenueContribution.display}</p>
        ) : null}

        {alerts.length > 0 ? (
          <ul className="oh-sapl-card__alerts">
            {alerts.map((a) => (
              <li key={a.key} className="oh-sapl-card__alert">
                {a.label}
              </li>
            ))}
          </ul>
        ) : null}

        {orderRange ? (
          <div className="oh-sapl-card__order-range">
            <span className="oh-sapl-card__order-range-label">نطاق الطلبات</span>
            <strong className="oh-sapl-card__order-range-value">{orderRange}</strong>
          </div>
        ) : null}

        {benefits.length > 0 ? (
          <ul className="oh-sapl-card__benefits" aria-label="مزايا الباقة">
            {benefits.map((row) => (
              <li key={row.id} className={`oh-sapl-card__benefit oh-sapl-card__benefit--${row.kind}`}>
                <span className="oh-sapl-card__benefit-icon" aria-hidden>
                  {row.icon}
                </span>
                <span className="oh-sapl-card__benefit-text">{row.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="oh-sapl-card__features-empty">لا توجد مزايا مسجّلة لهذه الباقة</p>
        )}
      </div>

      <footer className="oh-sapl-card__footer">
        <button type="button" className="oh-sapl-card__action oh-sapl-card__action--primary" disabled={submitting} onClick={onEdit}>
          تعديل
        </button>
        <button type="button" className="oh-sapl-card__action" disabled={submitting} onClick={onManageDetails}>
          التفاصيل
        </button>
        <button type="button" className="oh-sapl-card__action oh-sapl-card__action--danger" disabled={submitting} onClick={onDelete}>
          حذف
        </button>
      </footer>
    </article>
  );
}
