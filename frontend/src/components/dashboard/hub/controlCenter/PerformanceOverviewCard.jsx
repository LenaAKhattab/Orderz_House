import { useTranslation } from "../../../../i18n/LanguageProvider";
import { formatMoneyJod } from "../../../../utils/freelancerDashboardData";
import WidgetLoadError from "./WidgetLoadError";

function pctLabel(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${value}%`;
}

export default function PerformanceOverviewCard({ performance, loadState = "ok", loadError = "", onRetry, loading }) {
  const { t } = useTranslation();

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
          <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.performance.title")}</h3>
        </header>
        <WidgetLoadError
          message={loadError || t("freelancerDashboard.controlCenter.performance.loadError")}
          onRetry={onRetry}
        />
      </article>
    );
  }

  const p = performance || {};
  const hasHistory = Boolean(p.hasOrderHistory);
  const emDash = t("freelancerDashboard.common.emDash");

  return (
    <article className="fdash-cc-card fdash-cc-card--growth">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.performance.title")}</h3>
      </header>
      {!hasHistory ? (
        <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.performance.noHistory")}</p>
      ) : (
        <div className="fdash-cc-metrics fdash-cc-metrics--3">
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.performance.completed")}</span>
            <strong className="fdash-cc-metric__value">{p.completedOrders ?? 0}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">
              {t("freelancerDashboard.controlCenter.performance.completionRate")}
            </span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.completionRate)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.performance.onTime")}</span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.onTimeDeliveryPercent)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.performance.revisions")}</span>
            <strong className="fdash-cc-metric__value">{pctLabel(p.revisionRate)}</strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">
              {t("freelancerDashboard.controlCenter.performance.avgDelivery")}
            </span>
            <strong className="fdash-cc-metric__value">
              {p.averageDeliveryDays != null
                ? t("freelancerDashboard.controlCenter.performance.daysUnit", { count: p.averageDeliveryDays })
                : emDash}
            </strong>
          </div>
          <div className="fdash-cc-metric">
            <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.performance.paidClaims")}</span>
            <strong className="fdash-cc-metric__value">
              {p.totalEarnedJod != null ? `${formatMoneyJod(p.totalEarnedJod)} JOD` : emDash}
            </strong>
          </div>
        </div>
      )}
      {p.completedLast30Days > 0 ? (
        <p className="fdash-cc-card__line">
          {t("freelancerDashboard.controlCenter.performance.completedLast30Days", {
            count: p.completedLast30Days,
          })}
        </p>
      ) : null}
    </article>
  );
}
