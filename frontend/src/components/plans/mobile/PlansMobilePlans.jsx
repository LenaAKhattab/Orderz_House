import PlansMobilePlanCard from "./PlansMobilePlanCard";
import { pickFeaturedPlanIndex } from "./plansMobileUtils";

const SKELETON_COUNT = 3;

/**
 * @param {{
 *   loading?: boolean;
 *   plans?: object[];
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusyPlanId?: string | number | null;
 *   onCta?: (plan: object) => void;
 * }} p
 */
export default function PlansMobilePlans({
  loading = false,
  plans = [],
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  onCta,
}) {
  const featuredIndex = pickFeaturedPlanIndex(plans);

  return (
    <section className="pm-plans" aria-label="قائمة الباقات" aria-busy={loading || undefined}>
      <header className="pm-section-head">
        <h2 className="pm-section-head__title">قارن الباقات</h2>
        <span className="pm-section-head__hint">{loading ? "…" : `${plans.length} باقة`}</span>
      </header>

      <div className="pm-plans__list">
        {loading
          ? Array.from({ length: SKELETON_COUNT }, (_, i) => (
              <div key={`pm-skel-${i}`} className="pm-plan-card pm-plan-card--skeleton" aria-hidden />
            ))
          : plans.map((plan, idx) => (
              <PlansMobilePlanCard
                key={plan.id}
                plan={plan}
                featured={idx === featuredIndex}
                currentSubscription={currentSubscription}
                hasBlockingSubscription={hasBlockingSubscription}
                checkoutBusy={checkoutBusyPlanId != null && String(checkoutBusyPlanId) === String(plan.id)}
                onCta={onCta}
              />
            ))}
      </div>
    </section>
  );
}
