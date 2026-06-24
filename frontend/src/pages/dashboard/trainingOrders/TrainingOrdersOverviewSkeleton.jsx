import { useTranslation } from "../../../i18n/LanguageProvider";

/**
 * Unified initial-load skeleton for Status & rounds dashboard (KPIs + ops + table).
 */
export default function TrainingOrdersOverviewSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="oh-training-overview-skeleton" aria-busy="true" aria-live="polite">
      <p className="oh-training-overview-skeleton__label">{t("trainingOrders.overview.dashboardLoading")}</p>
      <div className="oh-training-overview-skeleton__kpis" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="oh-training-overview-skeleton__kpi" />
        ))}
      </div>
      <div className="oh-training-overview-skeleton__ops" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="oh-training-overview-skeleton__ops-card" />
        ))}
      </div>
      <div className="oh-training-overview-skeleton__table" aria-hidden="true" />
    </div>
  );
}
