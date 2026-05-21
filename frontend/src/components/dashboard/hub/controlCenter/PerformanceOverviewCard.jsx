import { formatMoneyJod } from "../../../../utils/freelancerDashboardData";
import WidgetLoadError from "./WidgetLoadError";

function pctLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${value}%`;
}

export default function PerformanceOverviewCard({ performance, loadState = "ok", loadError = "", onRetry, loading }) {
  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 160 }} />
      </article>
    );
  }

  if (loadState === "error") {
    return (
      <article className="fdash-cc-card fdash-cc-card--growth">
        <header className="fdash-cc-card__head">
          <h3 className="fdash-cc-card__title">الأداء</h3>
        </header>
        <WidgetLoadError message={loadError || "تعذر تحميل مؤشرات الأداء."} onRetry={onRetry} />
      </article>
    );
  }

  const p = performance || {};
  const hasHistory = Boolean(p.hasOrderHistory);

  return (
    <article className="fdash-cc-card fdash-cc-card--growth">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">الأداء</h3>
      </header>
      {!hasHistory ? (
        <p className="fdash-cc-card__muted">لا يوجد سجل طلبات بعد — ابدأ مشروعك الأول لرؤية المؤشرات.</p>
      ) : (
        <div className="fdash-cc-metrics fdash-cc-metrics--3">
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">مكتملة</span>
            <strong className="fdash-cc-metric__value">{p.completedOrders ?? 0}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">معدل الإكمال</span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.completionRate)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">في الموعد</span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.onTimeDeliveryPercent)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">تعديلات</span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.revisionRate)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">متوسط التسليم</span>
            <strong className="fdash-cc-metric__value">
              {p.averageDeliveryDays != null ? `${p.averageDeliveryDays} يوم` : "—"}
            </strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">مدفوع (مطالبات)</span>
            <strong className="fdash-cc-metric__value">
              {p.totalEarnedJod != null ? `${formatMoneyJod(p.totalEarnedJod)} JOD` : "—"}
            </strong>
          </div>
        </div>
      )}
      {p.completedLast30Days > 0 ? (
        <p className="fdash-cc-card__line">{p.completedLast30Days} طلباً مكتملاً خلال آخر 30 يوماً.</p>
      ) : null}
    </article>
  );
}
