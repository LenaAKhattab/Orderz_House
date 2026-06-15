import { useTranslation } from "../../../../i18n/LanguageProvider";

export default function WidgetLoadError({ message, onRetry }) {
  const { t } = useTranslation();

  return (
    <div className="fdash-cc-load-error" role="alert">
      <p className="fdash-cc-load-error__text">{message || t("freelancerDashboard.errors.widgetLoad")}</p>
      {onRetry ? (
        <button type="button" className="fdash-cc-btn fdash-cc-btn--sm" onClick={onRetry}>
          {t("freelancerDashboard.common.retry")}
        </button>
      ) : null}
    </div>
  );
}
