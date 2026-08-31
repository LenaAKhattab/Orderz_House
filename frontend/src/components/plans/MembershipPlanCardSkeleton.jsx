import { SkelBar } from "../ui/Skeleton";

/**
 * Skeleton shaped like the real Marketplace Membership PlanCard
 * (MembershipPlanTitle + MembershipPlanCardBody + CTA).
 */
export function MembershipPlanCardSkeleton({ featured = false }) {
  return (
    <article
      className={[
        "pricing-card",
        "pricing-card--membership",
        "pricing-card--skeleton",
        featured ? "pricing-card--featured" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden
    >
      <header className="pricing-card__head pricing-card__head--membership">
        {featured ? (
          <SkelBar style={{ height: 22, width: 72, borderRadius: 999 }} />
        ) : (
          <span style={{ height: 22, display: "block" }} aria-hidden />
        )}
        <SkelBar style={{ height: 18, width: "58%" }} />
      </header>

      <SkelBar style={{ height: 12, width: "72%", marginTop: 6 }} />

      <div className="pricing-card__price pricing-card__price--membership">
        <div className="pricing-card__price-stack">
          <SkelBar style={{ height: 34, width: 72, borderRadius: 8 }} />
          <SkelBar style={{ height: 14, width: 28, borderRadius: 6 }} />
        </div>
        <SkelBar style={{ height: 12, width: 88, marginTop: 10, borderRadius: 6 }} />
      </div>

      <div className="pricing-card__divider pricing-card__divider--features" aria-hidden />

      <div className="pricing-card__metrics">
        {[0, 1, 2].map((i) => (
          <div key={i} className="pricing-card__metric">
            <span className="pricing-card__metric-icon" aria-hidden>
              <SkelBar style={{ height: 14, width: 14, borderRadius: 4 }} />
            </span>
            <p className="pricing-card__metric-copy">
              <SkelBar style={{ height: 14, width: i === 2 ? 86 : 36, borderRadius: 5 }} />
              <SkelBar style={{ height: 11, width: i === 2 ? 54 : 78, borderRadius: 5 }} />
            </p>
          </div>
        ))}
      </div>

      <div className="pricing-card__secondary">
        <SkelBar style={{ height: 28, width: 118, borderRadius: 999 }} />
      </div>

      <div className="pricing-card__cta">
        <SkelBar style={{ height: 42, width: "100%", borderRadius: 999 }} />
      </div>
    </article>
  );
}

/**
 * Same public membership grid chrome as /plans (compact 4-col).
 * Order: STARTER → SILVER → PRO → ELITE (PRO featured at index 2).
 */
export function MarketplaceMembershipPlansGridSkeleton({
  count = 4,
  featuredIndex = 2,
  className = "",
}) {
  return (
    <div
      className={[
        "pricing",
        "pricing-ref-shell",
        "pricing--membership",
        "pricing--membership-no-hero",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className="pricing__grid pricing__grid--public-dynamic pricing__grid--plans-4"
        role="presentation"
      >
        {Array.from({ length: count }).map((_, i) => (
          <MembershipPlanCardSkeleton key={`mplan-skel-${i}`} featured={i === featuredIndex} />
        ))}
      </div>
    </div>
  );
}

export default MembershipPlanCardSkeleton;
