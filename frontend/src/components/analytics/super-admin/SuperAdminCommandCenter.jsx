import { formatInt, formatMoneyJod, formatPctChange } from "./superAdminHomeBundleUi";
import { useTranslation } from "../../../i18n/LanguageProvider";
import "./registerAnalysisLocale";

const FORECAST_LABEL_KEYS = {
  orders: "analysis.commandCenter.forecastOrders",
  subscriptions: "analysis.commandCenter.forecastSubscriptions",
  revenue: "analysis.commandCenter.forecastRevenue",
};

function ForecastPremiumBlock({ forecasts, growthPct }) {
  const { t } = useTranslation();
  const revenue = forecasts.find((f) => f.id === "revenue");
  const orders = forecasts.find((f) => f.id === "orders");
  const subs = forecasts.find((f) => f.id === "subscriptions");
  const headline = revenue || orders || subs || forecasts[0];
  const hasGrowth = growthPct != null && !Number.isNaN(Number(growthPct));
  const headlineLabel = t(FORECAST_LABEL_KEYS[headline.id] || headline.labelKey || headline.label);

  return (
    <div className="sa-forecast-premium">
      <div className="sa-forecast-premium__glow" aria-hidden />
      <div className="sa-forecast-premium__top">
        <div className="sa-forecast-premium__icon-wrap" aria-hidden>
          <span className="sa-forecast-premium__icon">📅</span>
        </div>
        <div className="sa-forecast-premium__copy">
          <p className="sa-forecast-premium__eyebrow m-0">{t("analysis.commandCenter.eyebrow")}</p>
          <p className="sa-forecast-premium__value m-0">
            {headline.unit === "money" ? formatMoneyJod(headline.estimate) : formatInt(headline.estimate)}
            {headline.unit !== "money" ? <span className="sa-forecast-premium__unit"> {headlineLabel}</span> : null}
          </p>
          <p className="sa-forecast-premium__basis m-0">{t("analysis.commandCenter.basis")}</p>
        </div>
      </div>
      {hasGrowth ? (
        <p className="sa-forecast-premium__growth m-0">
          <span className="sa-forecast-premium__growth-label">{t("analysis.commandCenter.growthLabel")}</span>
          <strong className="sa-forecast-premium__growth-value">{formatPctChange(growthPct)}</strong>
        </p>
      ) : null}
      <ul className="sa-forecast-premium__metrics m-0 p-0 list-none">
        {forecasts.map((f) => (
          <li key={f.id} className="sa-forecast-premium__metric">
            <span className="sa-forecast-premium__metric-label">
              {t(FORECAST_LABEL_KEYS[f.id] || f.labelKey || f.label)}
            </span>
            <strong className="sa-forecast-premium__metric-value">
              {f.unit === "money" ? formatMoneyJod(f.estimate) : formatInt(f.estimate)}
            </strong>
          </li>
        ))}
      </ul>
      <p className="sa-forecast-premium__disclaimer m-0">
        {t("analysis.commandCenter.disclaimer")}
        <strong>{t("analysis.commandCenter.disclaimerBold")}</strong>
      </p>
    </div>
  );
}

/** Month-end forecast card (main column); hidden when there is no forecast data. */
export default function SuperAdminCommandCenter({ forecasts, growthPct }) {
  const { t } = useTranslation();
  if (!forecasts?.length) return null;

  return (
    <section className="sa-forecast-visible mb-3" aria-labelledby="sa-forecast-visible-title">
      <h2 id="sa-forecast-visible-title" className="sr-only">
        {t("analysis.commandCenter.srTitle")}
      </h2>
      <ForecastPremiumBlock forecasts={forecasts} growthPct={growthPct} />
    </section>
  );
}
