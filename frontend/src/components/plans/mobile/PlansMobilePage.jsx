import PlansMobilePlans from "./PlansMobilePlans";
import SpecialOfferPackageCard from "../SpecialOfferPackageCard";
import { useTranslation } from "../../../i18n/LanguageProvider";
import PlansActivationFeeNote from "../PlansActivationFeeNote";
import TrainingPlanCard from "../TrainingPlanCard";
import { getPlansLayoutConfig, PLANS_LAYOUT_VARIANT } from "../plansLayoutUtils";
import { useDisplayCurrency } from "../../../hooks/useDisplayCurrency";
import { usePublicTrainingPackages } from "../../../hooks/usePublicTrainingPackages";
import { PLANS_CATEGORY } from "../../../constants/trainingPlansCatalog";
import { normalizePublicSpecialOffer } from "../../../constants/specialOfferPackage";
import "./plans-mobile-page.css";

/**
 * Radical mobile-only plans layout (≤640px). Desktop unchanged.
 * Membership + Training catalogs have no page hero — cards start immediately.
 */
export default function PlansMobilePage({
  loading = false,
  plans = [],
  specialOfferPackage = null,
  error = "",
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  specialOfferCheckoutBusy = false,
  onCta,
  onSpecialOfferCheckout = null,
  pageTitle: _pageTitle = null,
  pageSubtitle: _pageSubtitle = null,
  trustPills: _trustPills = [],
  pageSlug = null,
  layoutVariant = PLANS_LAYOUT_VARIANT.MAIN_FIVE_CARD,
  activationFeeNeedsPayment = false,
  activationFee = null,
  category = null,
  contentPending = false,
}) {
  const { t, dir, locale } = useTranslation();
  const { formatActivationFeeAmount } = useDisplayCurrency();
  const trainingPackages = usePublicTrainingPackages();
  const layout = getPlansLayoutConfig(layoutVariant);
  const feeEnabled = activationFee?.enabled === true;
  const feeAmountLabel = feeEnabled ? formatActivationFeeAmount(activationFee?.amountJod) : "";
  const isMainCatalog = !pageSlug;
  const showTraining = !contentPending && isMainCatalog && category === PLANS_CATEGORY.TRAINING;
  const showMembership = !contentPending && (!isMainCatalog || category === PLANS_CATEGORY.MEMBERSHIP);
  const specialOffer =
    showMembership && layoutVariant !== PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD
      ? normalizePublicSpecialOffer(specialOfferPackage)
      : null;

  return (
    <div className="plans-mobile-page" dir={dir}>
      {contentPending ? (
        <section className="pm-training" aria-busy="true">
          <div className="pm-training__list">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={`pm-content-skel-${i}`} className="pm-plan-card pm-plan-card--skeleton" aria-hidden />
            ))}
          </div>
        </section>
      ) : null}

      {!contentPending && showTraining ? (
        <section
          id="plans-panel-training-mobile"
          className="pm-training pm-training--no-hero"
          role="tabpanel"
          aria-labelledby="plans-tab-training"
          aria-label={t("plans.training.sectionAria")}
        >
          <div className="pm-training__list">
            {trainingPackages.map((pkg) => (
              <TrainingPlanCard key={pkg.id} pkg={pkg} locale={locale} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {showMembership ? (
        <>
          {layout.showActivationFeeNote && feeEnabled ? (
            <PlansActivationFeeNote
              className="plans-activation-fee-note--under-lede plans-activation-fee-note--mobile"
              enabled={feeEnabled}
              amountJod={activationFee?.amountJod}
            />
          ) : null}
          {specialOffer && !loading ? (
            <div className="pm-special-offer" data-special-offer-mobile="true">
              <SpecialOfferPackageCard
                offer={specialOffer}
                t={t}
                compact
                checkoutBusy={specialOfferCheckoutBusy}
                onCheckout={onSpecialOfferCheckout}
              />
            </div>
          ) : null}
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
              {error || t("plans.errors.loadFailed")}
            </p>
          ) : null}

          {!loading && !error && plans.length === 0 ? (
            <p className="pm-feedback" role="status">
              {t("common.empty.plans")}
            </p>
          ) : null}
        </>
      ) : null}

      <p className="pm-footnote pm-footnote--secondary">
        {pageSlug === "freelancers" && feeEnabled && feeAmountLabel
          ? t("plans.pages.freelancers.footnote", { amount: feeAmountLabel })
          : showTraining
            ? t("plans.training.footnote")
            : t("plans.mobile.footnote")}
      </p>
    </div>
  );
}
