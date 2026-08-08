import PlansMobileHero from "./PlansMobileHero";
import PlansMobilePlans from "./PlansMobilePlans";
import { useTranslation } from "../../../i18n/LanguageProvider";
import PlansActivationFeeNote from "../PlansActivationFeeNote";
import { getPlansLayoutConfig, PLANS_LAYOUT_VARIANT } from "../plansLayoutUtils";
import { useDisplayCurrency } from "../../../hooks/useDisplayCurrency";
import "./plans-mobile-page.css";

/**
 * Radical mobile-only plans layout (≤640px). Desktop unchanged.
 */
export default function PlansMobilePage({
  loading = false,
  plans = [],
  error = "",
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  onCta,
  pageTitle = null,
  pageSubtitle = null,
  trustPills = [],
  pageSlug = null,
  layoutVariant = PLANS_LAYOUT_VARIANT.MAIN_FIVE_CARD,
  activationFeeNeedsPayment = false,
  activationFee = null,
}) {
  const { t, dir } = useTranslation();
  const { formatActivationFeeAmount } = useDisplayCurrency();
  const layout = getPlansLayoutConfig(layoutVariant);
  const feeEnabled = activationFee?.enabled === true;
  const feeAmountLabel = feeEnabled ? formatActivationFeeAmount(activationFee?.amountJod) : "";

  return (
    <div className="plans-mobile-page" dir={dir}>
      <PlansMobileHero
        title={pageTitle}
        subtitle={pageSubtitle}
        trustPills={trustPills}
        afterLede={
          layout.showActivationFeeNote && feeEnabled ? (
            <PlansActivationFeeNote
              className="plans-activation-fee-note--under-lede plans-activation-fee-note--mobile"
              enabled={feeEnabled}
              amountJod={activationFee?.amountJod}
            />
          ) : null
        }
      />
      <PlansMobilePlans
        loading={loading}
        plans={plans}
        currentSubscription={currentSubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        activationFeeNeedsPayment={activationFeeNeedsPayment}
        activationFee={activationFee}
        onCta={onCta}
        skeletonCount={layout.skeletonCount}
      />

      {error ? (
        <p className="pm-feedback pm-feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && plans.length === 0 ? (
        <p className="pm-feedback" role="status">
          {t("common.empty.plans")}
        </p>
      ) : null}

      <p className="pm-footnote pm-footnote--secondary">
        {pageSlug === "freelancers" && feeEnabled && feeAmountLabel
          ? t("plans.pages.freelancers.footnote", { amount: feeAmountLabel })
          : t("plans.mobile.footnote")}
      </p>
    </div>
  );
}
