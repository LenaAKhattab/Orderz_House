import PlansMobileHero from "./PlansMobileHero";
import PlansMobilePlans from "./PlansMobilePlans";
import { useTranslation } from "../../../i18n/LanguageProvider";
import PlansActivationFeeNote from "../PlansActivationFeeNote";
import { getPlansLayoutConfig, PLANS_LAYOUT_VARIANT } from "../plansLayoutUtils";
import "./plans-mobile-page.css";

/**
 * Radical mobile-only plans layout (≤640px). Desktop unchanged.
 * @param {{
 *   loading?: boolean;
 *   plans?: object[];
 *   error?: string;
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusyPlanId?: string | number | null;
 *   onCta?: (plan: object) => void;
 * }} p
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
}) {
  const { t, dir } = useTranslation();
  const layout = getPlansLayoutConfig(layoutVariant);

  return (
    <div className="plans-mobile-page" dir={dir}>
      <PlansMobileHero title={pageTitle} subtitle={pageSubtitle} trustPills={trustPills} />
      <PlansMobilePlans
        loading={loading}
        plans={plans}
        currentSubscription={currentSubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
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

      {layout.showActivationFeeNote ? (
        <PlansActivationFeeNote className="plans-activation-fee-note--mobile" />
      ) : null}
      <p className="pm-footnote pm-footnote--secondary">
        {pageSlug === "freelancers" ? t("plans.pages.freelancers.footnote") : t("plans.mobile.footnote")}
      </p>
    </div>
  );
}
