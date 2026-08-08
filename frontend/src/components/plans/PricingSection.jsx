import { useTranslation } from "../../i18n/LanguageProvider";

import PlanCard from "./PlanCard";

import PublicPageHeader from "../layout/PublicPageHeader";

import { PlanCardsRowSkeleton } from "../ui/Skeleton";

import { pickFeaturedPlanIndex } from "./plansFeaturedUtils";

import PlansActivationFeeNote from "./PlansActivationFeeNote";

import {
  getPlansLayoutConfig,
  PLANS_LAYOUT_VARIANT,
  resolvePublicPlansGridClassName,
} from "./plansLayoutUtils";

import "../../styles/plansPage.css";

const PricingSection = ({
  plans,
  onCta,
  currentSubscription = null,
  hasBlockingSubscription = false,
  loading = false,
  checkoutBusyPlanId = null,
  variant = "public",
  pageTitle = null,
  pageSubtitle = null,
  trustPills = [],
  layoutVariant = PLANS_LAYOUT_VARIANT.MAIN_FIVE_CARD,
  activationFeeNeedsPayment = false,
  activationFee = null,
}) => {
  const { t } = useTranslation();
  const plansList = Array.isArray(plans) ? plans : [];
  const featuredIndex = pickFeaturedPlanIndex(plansList);
  const isDashboard = variant === "dashboard";
  const layout = isDashboard ? null : getPlansLayoutConfig(layoutVariant);
  const title = pageTitle || t("plans.hero.title");
  const subtitle = pageSubtitle || t("plans.hero.subtitle");
  const skeletonCount = isDashboard ? 3 : layout.skeletonCount;
  const isLegacyPublic =
    !isDashboard && layoutVariant === PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;
  const gridClassName = isDashboard
    ? ""
    : isLegacyPublic
      ? layout.gridClassName
      : resolvePublicPlansGridClassName(loading ? 0 : plansList.length);
  const feeEnabled = activationFee?.enabled === true;
  const feeAmountJod = activationFee?.amountJod;



  return (

    <section

      className={`pricing ${isDashboard ? "pricing--dashboard" : "pricing-ref-shell"}`.trim()}

      aria-label={t("plans.sectionAria")}

    >

      {isDashboard ? null : (
        <PublicPageHeader
          title={title}
          subtitle={subtitle}
          trustPills={trustPills}
          afterLede={
            layout?.showActivationFeeNote && feeEnabled ? (
              <PlansActivationFeeNote
                className="plans-activation-fee-note--under-lede"
                enabled={feeEnabled}
                amountJod={feeAmountJod}
              />
            ) : null
          }
        />
      )}



      {loading ? (

        <PlanCardsRowSkeleton count={skeletonCount} className={gridClassName} />

      ) : (

        <div className={["pricing__grid", gridClassName].filter(Boolean).join(" ")}>

          {plansList.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              featured={idx === featuredIndex}
              currentSubscription={currentSubscription}
              onCta={onCta}
              hasBlockingSubscription={hasBlockingSubscription}
              checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(p.id)}
              activationFeeNeedsPayment={activationFeeNeedsPayment}
              activationFee={activationFee}
            />
          ))}

        </div>

      )}



    </section>

  );

};



export default PricingSection;


