import PlanCard from "./PlanCard";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";

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
  hasBlockingSubscription = false,
  loading = false,
  checkoutBusyPlanId = null,
}) => {
  const featuredIndex = pickFeaturedIndex(plans);

  return (
    <section className="pricing" aria-label="خطط الاشتراك">
      <header className="pricing__header">
        <h1 className="pricing__title">باقات ORDERZHOUSE للعمل الحر</h1>
        <p className="pricing__subtitle">اختر الاشتراك المناسب — جميع التفاصيل من قاعدة البيانات</p>
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

