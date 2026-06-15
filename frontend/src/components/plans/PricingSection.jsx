import { useTranslation } from "../../i18n/LanguageProvider";
import PlanCard from "./PlanCard";
import PublicPageHeader from "../layout/PublicPageHeader";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";
import { pickFeaturedPlanIndex } from "./plansFeaturedUtils";
import "../../styles/plansPage.css";

const PricingSection = ({
  plans,
  onCta,
  currentSubscription = null,
  hasBlockingSubscription = false,
  loading = false,
  checkoutBusyPlanId = null,
  variant = "public",
}) => {
  const { t } = useTranslation();
  const featuredIndex = pickFeaturedPlanIndex(plans);
  const isDashboard = variant === "dashboard";

  return (
    <section
      className={`pricing ${isDashboard ? "pricing--dashboard" : "pricing-ref-shell"}`.trim()}
      aria-label={t("plans.sectionAria")}
    >
      {isDashboard ? null : (
        <PublicPageHeader title={t("plans.hero.title")} subtitle={t("plans.hero.subtitle")} />
      )}

      {loading ? (
        <PlanCardsRowSkeleton count={3} />
      ) : (
        <div className="pricing__grid">
          {plans.map((p, idx) => (
            <PlanCard
              key={p.id}
              plan={p}
              featured={idx === featuredIndex}
              currentSubscription={currentSubscription}
              onCta={onCta}
              hasBlockingSubscription={hasBlockingSubscription}
              checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(p.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default PricingSection;

