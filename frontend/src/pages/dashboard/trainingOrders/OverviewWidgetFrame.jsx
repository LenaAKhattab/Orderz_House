import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";

/**
 * Per-widget loading boundary for Training Orders Overview.
 * @param {'loading'|'success'|'error'} status
 */
export default function OverviewWidgetFrame({
  status,
  error = "",
  onRetry,
  loadingLabel = "جاري التحميل…",
  children,
  compact = false,
}) {
  if (status === "loading") {
    return <DashboardLoadingState label={loadingLabel} rows={compact ? 2 : 3} />;
  }

  if (status === "error") {
    return (
      <div className="oh-training-widget-error" role="alert">
        <p className="oh-training-widget-error__title">تعذر تحميل هذه البيانات حالياً</p>
        {error ? <p className="oh-training-widget-error__detail help">{error}</p> : null}
        {onRetry ? (
          <button type="button" className="btn btn-secondary oh-training-widget-error__retry" onClick={onRetry}>
            إعادة المحاولة
          </button>
        ) : null}
      </div>
    );
  }

  return children;
}
