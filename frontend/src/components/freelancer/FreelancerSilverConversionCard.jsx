import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  recordFreelancerActivationCtaViewedRequest,
  startFreelancerSilverCheckoutRequest,
} from "../../services/api";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  formatSilverUpgradeButtonLabel,
  silverConversionErrorMessage,
  silverConversionSuccessMessage,
  SILVER_CONVERSION_SUCCESS_AR,
} from "../../constants/freelancerActivationConversion";
import { isNewLocale } from "../../i18n/systemContent";

const SC_COPY = "platformComponents.silverConversion";

/** Server CTA copy is Arabic-only: German / Dutch / Romanian render the catalog copy for the same reason. */
function descriptionKeyForReason(reason) {
  if (reason === "trial_expired") return `${SC_COPY}.description.trialExpired`;
  if (reason === "work_cap_reached") return `${SC_COPY}.description.workCapReached`;
  return `${SC_COPY}.description.default`;
}

/**
 * Phase A6 — Silver conversion card. Starts marketplace activation-request handoff.
 * No card number fields or manual payment inputs.
 */
export default function FreelancerSilverConversionCard({
  conversion,
  isEn = false,
  onCheckoutStarted = null,
}) {
  const { t, locale } = useTranslation();
  const newLocale = isNewLocale(locale);
  const sc = "freelancerDashboard.silverConversion";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!conversion?.shouldShowSilverCta || viewedRef.current) return;
    viewedRef.current = true;
    void recordFreelancerActivationCtaViewedRequest().catch(() => {
      /* best-effort funnel event */
    });
  }, [conversion?.shouldShowSilverCta]);

  if (!conversion || conversion.shouldShowSilverCta !== true) return null;

  const cta = conversion.cta || {};
  const priceJod = conversion.silverPlan?.priceJod;
  const buttonLabel = newLocale
    ? formatSilverUpgradeButtonLabel(priceJod, locale)
    : cta.buttonLabel || formatSilverUpgradeButtonLabel(priceJod);
  const titleText = newLocale ? t(`${sc}.defaultTitle`) : cta.title || t(`${sc}.defaultTitle`);
  const descriptionText = newLocale ? t(descriptionKeyForReason(conversion.reason)) : cta.description;
  const secondaryText = newLocale
    ? t(`${sc}.earnedBalanceLink`)
    : cta.secondaryLabel || t(`${sc}.earnedBalanceLink`);
  const plansRoute = conversion.handoff?.plansRoute || "/dashboard/freelancer/plans";

  async function onUpgrade() {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await startFreelancerSilverCheckoutRequest();
      const data = res?.data || {};
      if (typeof onCheckoutStarted === "function") onCheckoutStarted(data);
      if (data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setSuccess(newLocale ? silverConversionSuccessMessage(locale) : data.messageAr || SILVER_CONVERSION_SUCCESS_AR);
      if (data.plansRoute) {
        /* keep user on articles; secondary link covers plans */
      }
    } catch (err) {
      setError(silverConversionErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mb-3 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-primary,#2f3b65)] bg-[color:var(--dash-card,#fcfcfd)] p-3 shadow-[var(--dash-shadow-sm)]"
      data-testid="freelancer-silver-conversion-card"
      data-reason={conversion.reason || "none"}
    >
      <p className="mb-1 text-[0.95rem] font-extrabold text-[color:var(--dash-text,#172033)]">
        {titleText}
      </p>
      <p className="mb-2 text-[0.84rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {descriptionText}
      </p>
      {error ? (
        <p
          className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-danger,#b42318)]"
          data-testid="silver-conversion-error"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-success,#067647)]"
          data-testid="silver-conversion-success"
        >
          {success}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="oh-account-btn-primary"
          data-testid="silver-upgrade-button"
          disabled={busy}
          onClick={() => void onUpgrade()}
        >
          {busy ? t(`${sc}.starting`) : buttonLabel}
        </button>
        <a
          href="#earned-balance"
          className="text-[0.82rem] font-bold text-[color:var(--dash-primary,#2f3b65)]"
          data-testid="silver-earned-balance-secondary"
        >
          {secondaryText}
        </a>
        <Link
          to={plansRoute}
          className="text-[0.78rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]"
          data-testid="silver-plans-handoff-link"
        >
          {t(`${sc}.openPlans`)}
        </Link>
      </div>
    </div>
  );
}
