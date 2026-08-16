import PlansMobileHero from "./PlansMobileHero";
import PlansMobilePlans from "./PlansMobilePlans";
import { useTranslation } from "../../../i18n/LanguageProvider";
import PlansActivationFeeNote from "../PlansActivationFeeNote";
import TrainingPlanCard from "../TrainingPlanCard";
import { getPlansLayoutConfig, PLANS_LAYOUT_VARIANT } from "../plansLayoutUtils";
import { useDisplayCurrency } from "../../../hooks/useDisplayCurrency";
import { usePublicTrainingPackages } from "../../../hooks/usePublicTrainingPackages";
import { PLANS_CATEGORY } from "../../../constants/trainingPlansCatalog";
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
  category = null,
  trainingEyebrow = null,
  trainingTitle = null,
  trainingSubtitle = null,
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
          className="pm-training"
          role="tabpanel"
          aria-labelledby="plans-tab-training"
          aria-label={t("plans.training.sectionAria")}
        >
          <PlansMobileHero
            title={trainingTitle || t("plans.training.hero.title")}
            subtitle={trainingSubtitle || t("plans.training.hero.subtitle")}
            eyebrow={trainingEyebrow || t("plans.training.hero.eyebrow")}
            trustPills={trustPills}
          />
          <div className="pm-training__list">
            {trainingPackages.map((pkg) => (
              <TrainingPlanCard key={pkg.id} pkg={pkg} locale={locale} t={t} />
            ))}
          </div>
        </section>
      ) : null}

      {showMembership ? (
        <>
          <PlansMobileHero
            title={pageTitle}
            subtitle={pageSubtitle}
            eyebrow={
              isMainCatalog ||
              (Array.isArray(plans) &&
                plans.some(
                  (p) => p?.catalogSource === "marketplace_membership" || p?.marketplaceMembership,
                ))
                ? t("plans.hero.eyebrow")
                : null
            }
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
