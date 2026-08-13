import { Briefcase, CalendarDays, Check, Infinity as InfinityIcon, MinusCircle, Target } from "lucide-react";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";

/**
 * Presentational membership metrics + secondary rows for public /plans cards.
 * Commercial numbers must already be on `plan` from Marketplace Membership mapping.
 */
export default function MembershipPlanCardBody({ plan, locale = "ar", t }) {
  const metrics = plan?.primaryMetrics || {};
  const durationDays = Number(plan?.durationDays);
  const withdrawalEnabled = plan?.withdrawalEnabled;
  const tagline =
    locale === "en"
      ? plan?.taglineEn || plan?.taglineAr || ""
      : plan?.taglineAr || plan?.taglineEn || "";
  const unlimited = Boolean(metrics.unlimitedProjects || plan?.unlimitedRealOrderValue);
  const projectValue =
    unlimited
      ? null
      : metrics.projectMaxJod != null
        ? metrics.projectMaxJod
        : plan?.maxRealOrderValueJod != null
          ? Number(plan.maxRealOrderValueJod)
          : null;

  const bids = metrics.bids != null ? metrics.bids : plan?.monthlyBidAllowance;
  const daily =
    metrics.dailyLimit != null ? metrics.dailyLimit : plan?.dailyBidSpendLimit;

  const priceJod = Number(plan?.priceJod);
  const isFree = Number.isFinite(priceJod) && priceJod === 0;
  const priceAmount = Number.isFinite(priceJod)
    ? priceJod.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "—";

  const sale = plan?.sale;
  const saleActive = Boolean(sale?.enabled && sale?.effectivePriceJod != null);

  return (
    <>
      {tagline ? <p className="pricing-card__tagline">{tagline}</p> : null}

      <div className="pricing-card__price pricing-card__price--membership">
        {saleActive ? (
          <div className="pricing-card__price-sale">
            <div className="pricing-card__price-stack">
              <span className="pricing-card__price-amount">
                {Number(sale.effectivePriceJod).toLocaleString("en-US", {
                  maximumFractionDigits: 2,
                })}
              </span>
              <span className="pricing-card__price-unit">{t("plans.currency.jod")}</span>
            </div>
            {sale.originalPriceJod != null ? (
              <p className="pricing-card__price-sale-meta">
                <s className="pricing-card__price-original">
                  {Number(sale.originalPriceJod).toLocaleString("en-US", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  {t("plans.currency.jod")}
                </s>
              </p>
            ) : null}
          </div>
        ) : isFree ? (
          <div className="pricing-card__price-stack pricing-card__price-stack--free">
            <span className="pricing-card__price-amount pricing-card__price-amount--free">
              {t("plans.membership.free")}
            </span>
          </div>
        ) : (
          <div className="pricing-card__price-stack">
            <span className="pricing-card__price-amount">{priceAmount}</span>
            <span className="pricing-card__price-unit">{t("plans.currency.jod")}</span>
          </div>
        )}
        {Number.isFinite(durationDays) && durationDays > 0 ? (
          <p className="pricing-card__price-period">{t("plans.days", { count: durationDays })}</p>
        ) : null}
      </div>

      <div className="pricing-card__divider pricing-card__divider--features" aria-hidden="true" />

      <div className="pricing-card__metrics" aria-label={t("plans.membership.metricsAria")}>
        {bids != null ? (
          <div className="pricing-card__metric">
            <span className="pricing-card__metric-icon" aria-hidden="true">
              <Target size={15} strokeWidth={2.1} />
            </span>
            <div className="pricing-card__metric-copy">
              <span className="pricing-card__metric-value">{bids}</span>
              <span className="pricing-card__metric-label">{t("plans.membership.bidsAvailable")}</span>
            </div>
          </div>
        ) : null}

        {daily != null ? (
          <div className="pricing-card__metric">
            <span className="pricing-card__metric-icon" aria-hidden="true">
              <CalendarDays size={15} strokeWidth={2.1} />
            </span>
            <div className="pricing-card__metric-copy">
              <span className="pricing-card__metric-value">{daily}</span>
              <span className="pricing-card__metric-label">{t("plans.membership.bidsPerDay")}</span>
            </div>
          </div>
        ) : null}

        <div
          className={[
            "pricing-card__metric",
            unlimited ? "pricing-card__metric--elite-cap" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="pricing-card__metric-icon" aria-hidden="true">
            {unlimited ? <InfinityIcon size={15} strokeWidth={2.1} /> : <Briefcase size={15} strokeWidth={2.1} />}
          </span>
          <div className="pricing-card__metric-copy">
            {unlimited ? (
              <>
                <span className="pricing-card__metric-value pricing-card__metric-value--text">
                  {t("plans.membership.unlimitedShort")}
                </span>
                <span className="pricing-card__metric-label">
                  {t("plans.membership.projectCapUnlimited")}
                </span>
              </>
            ) : (
              <>
                <span className="pricing-card__metric-value">
                  {projectValue != null ? `${projectValue} ${t("plans.currency.jod")}` : "—"}
                </span>
                <span className="pricing-card__metric-label">{t("plans.membership.projectCapMax")}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pricing-card__secondary">
        {withdrawalEnabled === false ? (
          <p className="pricing-card__withdrawal pricing-card__withdrawal--off">
            <MinusCircle size={14} strokeWidth={2} aria-hidden="true" />
            <span>{t("plans.membership.withdrawalOff")}</span>
          </p>
        ) : withdrawalEnabled === true ? (
          <p className="pricing-card__withdrawal pricing-card__withdrawal--on">
            <Check size={14} strokeWidth={2.4} aria-hidden="true" />
            <span>{t("plans.membership.withdrawalOn")}</span>
          </p>
        ) : null}
      </div>
    </>
  );
}

/** Shared membership title for desktop/mobile cards. */
export function MembershipPlanTitle({ plan, featured, locale, t }) {
  const title = getLocalizedField(plan, "title", locale) || plan?.name || "—";
  const showPopular = featured || plan?.isPopular === true;

  return (
    <header className="pricing-card__head pricing-card__head--membership">
      {showPopular ? (
        <span className="pricing-card__badge pricing-card__badge--popular">
          {t("plans.badges.mostPopular")}
        </span>
      ) : null}
      <h2 className="pricing-card__title pricing-card__title--tier">{title}</h2>
    </header>
  );
}
