import PlanCard from "./PlanCard";
import { PlanCardsRowSkeleton } from "../ui/Skeleton";

function pickFeaturedIndex(plans) {
  const byFlag = plans.findIndex((p) => p?.isFeatured === true);
  if (byFlag >= 0) return byFlag;
  if (plans.length === 0) return -1;
  return Math.floor(plans.length / 2);
}

const PricingSection = ({ plans, onCta, hasBlockingSubscription = false, loading = false }) => {
  const featuredIndex = pickFeaturedIndex(plans);

  return (
    <section className="pricing" aria-label="خطط الاشتراك">
      <header className="pricing__header">
        <h1 className="pricing__title">اختر الباقة المناسبة لك</h1>
        <p className="pricing__subtitle">باقات ديناميكية من قاعدة البيانات حسب المدة والسعر.</p>
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
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default PricingSection;

