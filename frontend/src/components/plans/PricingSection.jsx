import PlanCard from "./PlanCard";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";
import "../../styles/plansPage.css";

function pickFeaturedIndex(plans) {
  const popular = plans.findIndex((p) => p?.isPopular === true || p?.is_popular === true);
  if (popular >= 0) return popular;
  const featured = plans.findIndex((p) => p?.isFeatured === true || p?.is_featured === true);
  if (featured >= 0) return featured;
  if (plans.length === 0) return -1;
  return Math.floor(plans.length / 2);
}

const PricingSection = ({
  plans,
  onCta,
  currentSubscription = null,
  hasBlockingSubscription = false,
  loading = false,
  checkoutBusyPlanId = null,
}) => {
  const featuredIndex = pickFeaturedIndex(plans);

  return (
    <section className="pricing pricing-ref-shell" aria-label="خطط الاشتراك">
      <header className="pricing__header pricing-ref-hero">
        <h1 className="pricing__title pricing-ref-hero__title">باقات أوردرز هاوس للعمل الحر</h1>
        <div className="pricing-ref-hero__divider" aria-hidden>
          <span className="pricing-ref-hero__divider-line" />
          <span className="pricing-ref-hero__divider-diamond" />
          <span className="pricing-ref-hero__divider-line" />
        </div>
      </header>

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

