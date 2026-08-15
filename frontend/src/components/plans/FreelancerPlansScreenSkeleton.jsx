import { SkelBar, PlanCardsRowSkeleton } from "../ui/Skeleton";
import { MarketplaceMembershipPlansGridSkeleton } from "./MembershipPlanCardSkeleton";
import { PLAN_CATALOG, isMarketplacePlanCatalog } from "../../constants/planCatalogs";
import { readLastDefaultCatalog } from "../../lib/planCatalog/fetchPlansForCatalog";

/**
 * Shape-matched loading shell for /dashboard/freelancer/plans.
 * Uses the same wrappers/grid as the resolved Marketplace catalog (1→2→4).
 * No visible loading copy; no temporary business status text.
 */
export default function FreelancerPlansScreenSkeleton({
  catalog = null,
  catalogResolved = false,
}) {
  const hinted =
    catalogResolved && catalog
      ? catalog
      : readLastDefaultCatalog() || PLAN_CATALOG.MARKETPLACE_PLANS;
  const marketplace = isMarketplacePlanCatalog(hinted);

  return (
    <div className="fp-screen-skeleton" aria-busy="true">
      <span className="visually-hidden">Loading plans</span>

      <header className="fp-surface fp-hero fp-hero--membership fp-hero--membership-skel">
        <div className="fp-hero__copy">
          <SkelBar className="fp-skel-eyebrow" style={{ height: 28, width: 128, borderRadius: 999 }} />
          <SkelBar style={{ height: 22, width: "min(72%, 280px)", marginTop: 12, borderRadius: 8 }} />
          <SkelBar style={{ height: 14, width: "min(88%, 360px)", marginTop: 10, borderRadius: 6 }} />
        </div>
      </header>

      <section className="fp-surface fp-pricing-wrap" aria-hidden>
        {marketplace ? (
          <MarketplaceMembershipPlansGridSkeleton count={4} featuredIndex={2} />
        ) : (
          <div className="pricing pricing--dashboard">
            <PlanCardsRowSkeleton count={3} />
          </div>
        )}
      </section>
    </div>
  );
}
