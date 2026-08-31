import { useTranslation } from "../../i18n/LanguageProvider";
import PlanCard from "./PlanCard";
import SpecialOfferPackageCard from "./SpecialOfferPackageCard";
import PublicPageHeader from "../layout/PublicPageHeader";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";
import { pickFeaturedPlanIndex } from "./plansFeaturedUtils";
import PlansActivationFeeNote from "./PlansActivationFeeNote";
import {
  getPlansLayoutConfig,
  PLANS_LAYOUT_VARIANT,
  resolvePublicPlansGridClassName,
} from "./plansLayoutUtils";
import { normalizePublicSpecialOffer } from "../../constants/specialOfferPackage";
import "../../styles/publicPlans.css";
import "../../styles/plansPage.css";

const PricingSection = ({
  plans,
  specialOfferPackage = null,
  onCta,
  onSpecialOfferCheckout = null,
  specialOfferCheckoutBusy = false,
  currentSubscription = null,
  currentMarketplaceMembership = null,
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
  const skeletonCount = isDashboard ? Math.max(plansList.length || 4, 4) : layout.skeletonCount;
  const isLegacyPublic =
    !isDashboard && layoutVariant === PLANS_LAYOUT_VARIANT.LEGACY_THREE_CARD;
  const specialOffer =
    !isLegacyPublic ? normalizePublicSpecialOffer(specialOfferPackage) : null;
  const showSpecial = Boolean(specialOffer);
  const gridClassName = isDashboard
    ? ""
    : isLegacyPublic
      ? layout.gridClassName
      : [
          resolvePublicPlansGridClassName(loading ? 0 : plansList.length),
          showSpecial ? "pricing__grid--with-special-offer" : "",
        ]
          .filter(Boolean)
          .join(" ");
  const feeEnabled = activationFee?.enabled === true;
  const feeAmountJod = activationFee?.amountJod;
  // Membership catalog: no page hero — cards (incl. special offer) are the first content.
  const showPublicHero = !isDashboard && !isMembershipCatalog;
  const title = pageTitle || t("plans.hero.title");
  const subtitle = pageSubtitle || t("plans.hero.subtitle");

  const planCards = (
    <div className={["pricing__grid", gridClassName].filter(Boolean).join(" ")}>
      {plansList.map((p, idx) => (
        <PlanCard
          key={p.id}
          plan={p}
          featured={idx === featuredIndex}
          currentSubscription={currentSubscription}
          currentMarketplaceMembership={currentMarketplaceMembership}
          onCta={onCta}
          hasBlockingSubscription={hasBlockingSubscription}
          checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(p.id)}
          activationFeeNeedsPayment={activationFeeNeedsPayment}
          activationFee={activationFee}
        />
      ))}
    </div>
  );

  return (
    <section
      id={forceMembershipHero ? "plans-panel-membership" : undefined}
      role={forceMembershipHero ? "tabpanel" : undefined}
      aria-labelledby={forceMembershipHero ? "plans-tab-membership" : undefined}
      className={`pricing ${isDashboard ? "pricing--dashboard" : "pricing-ref-shell"} ${
        isMembershipCatalog ? "pricing--membership pricing--membership-no-hero" : ""
      } ${showSpecial ? "pricing--with-special-offer" : ""}`.trim()}
      aria-label={t("plans.sectionAria")}
    >
      {showPublicHero ? (
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
      ) : null}

      {!isDashboard && isMembershipCatalog && layout?.showActivationFeeNote && feeEnabled ? (
        <PlansActivationFeeNote
          className="plans-activation-fee-note--under-lede"
          enabled={feeEnabled}
          amountJod={feeAmountJod}
        />
      ) : null}

      {loading ? (
        <PlanCardsRowSkeleton count={skeletonCount} className={gridClassName} />
      ) : showSpecial ? (
        <div className="pricing__with-special" data-has-special-offer="true">
          <SpecialOfferPackageCard
            offer={specialOffer}
            t={t}
            checkoutBusy={specialOfferCheckoutBusy}
            onCheckout={onSpecialOfferCheckout}
          />
          <div className="pricing__regular-grid">{planCards}</div>
        </div>
      ) : (
        planCards
      )}
    </section>
  );
};

export default PricingSection;
