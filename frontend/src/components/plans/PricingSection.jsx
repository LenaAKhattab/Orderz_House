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
  forceMembershipHero = false,
  membershipCatalog = null,
}) => {
  const { t } = useTranslation();
  const plansList = Array.isArray(plans) ? plans : [];
  const featuredIndex = pickFeaturedPlanIndex(plansList);
  const isDashboard = variant === "dashboard";
  const layout = isDashboard ? null : getPlansLayoutConfig(layoutVariant);
  const plansLookLikeMembership = plansList.some(
    (p) => p?.catalogSource === "marketplace_membership" || p?.marketplaceMembership,
  );
  const isMembershipCatalog =
    !isDashboard &&
    (membershipCatalog === true ||
      (membershipCatalog == null &&
        (plansLookLikeMembership ||
          (loading && forceMembershipHero && layoutVariant !== PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD && !pageTitle))));
  const title = pageTitle || t("plans.hero.title");
  const subtitle = pageSubtitle || t("plans.hero.subtitle");
  const eyebrow = isMembershipCatalog ? t("plans.hero.eyebrow") : null;
  const skeletonCount = isDashboard ? Math.max(plansList.length || 4, 4) : layout.skeletonCount;
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

      id={forceMembershipHero ? "plans-panel-membership" : undefined}

      role={forceMembershipHero ? "tabpanel" : undefined}

      aria-labelledby={forceMembershipHero ? "plans-tab-membership" : undefined}

      className={`pricing ${isDashboard ? "pricing--dashboard" : "pricing-ref-shell"} ${
        isMembershipCatalog ? "pricing--membership" : ""
      }`.trim()}

      aria-label={t("plans.sectionAria")}

    >

      {isDashboard ? null : (
        <PublicPageHeader
          className={isMembershipCatalog ? "public-page-hero--membership" : ""}
          title={title}
          subtitle={subtitle}
          eyebrow={eyebrow}
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


