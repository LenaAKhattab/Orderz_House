import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import { useTranslation } from "../../../i18n/LanguageProvider";

/**
 * Per-widget loading boundary for Training Orders Overview.
 * @param {'loading'|'success'|'error'} status
 */
export default function OverviewWidgetFrame({
  status,
  error = "",
  onRetry,
  loadingLabel,
  children,
  compact = false,
  suppressLoading = false,
}) {
  const { t } = useTranslation();
  const loadingText = loadingLabel || t("trainingOrders.widgetFrame.loading");

  if (status === "loading" && !suppressLoading) {
    return <DashboardLoadingState label={loadingText} rows={compact ? 2 : 3} />;
  }

  if (status === "loading" && suppressLoading) {
    return children ?? null;
  }

  if (status === "error") {
    return (
      <div className="oh-training-widget-error" role="alert">
        <p className="oh-training-widget-error__title">{t("trainingOrders.widgetFrame.errorTitle")}</p>
        {error ? <p className="oh-training-widget-error__detail help">{error}</p> : null}
        {onRetry ? (
          <button type="button" className="btn btn-secondary oh-training-widget-error__retry" onClick={onRetry}>
            {t("trainingOrders.widgetFrame.retry")}
          </button>
        ) : null}
      </div>
    );
  }

  return children;
}
