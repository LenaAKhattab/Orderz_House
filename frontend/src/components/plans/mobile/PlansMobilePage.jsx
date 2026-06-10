import PlansMobileHero from "./PlansMobileHero";
import PlansMobilePlans from "./PlansMobilePlans";
import "./plans-mobile-page.css";

/**
 * Radical mobile-only plans layout (≤640px). Desktop unchanged.
 * @param {{
 *   loading?: boolean;
 *   plans?: object[];
 *   error?: string;
 *   currentSubscription?: object | null;
 *   hasBlockingSubscription?: boolean;
 *   checkoutBusyPlanId?: string | number | null;
 *   onCta?: (plan: object) => void;
 * }} p
 */
export default function PlansMobilePage({
  loading = false,
  plans = [],
  error = "",
  currentSubscription = null,
  hasBlockingSubscription = false,
  checkoutBusyPlanId = null,
  onCta,
}) {
  return (
    <div className="plans-mobile-page" dir="rtl">
      <PlansMobileHero />
      <PlansMobilePlans
        loading={loading}
        plans={plans}
        currentSubscription={currentSubscription}
        hasBlockingSubscription={hasBlockingSubscription}
        checkoutBusyPlanId={checkoutBusyPlanId}
        onCta={onCta}
      />

      {error ? (
        <p className="pm-feedback pm-feedback--error" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && plans.length === 0 ? (
        <p className="pm-feedback" role="status">
          لا توجد باقات متاحة حالياً.
        </p>
      ) : null}

      <p className="pm-footnote">الباقات مخصّصة للمستقلين المسجّلين في المنصة.</p>
    </div>
  );
}
