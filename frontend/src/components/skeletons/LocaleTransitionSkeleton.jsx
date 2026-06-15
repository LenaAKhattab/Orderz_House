import NavbarSkeleton from "./NavbarSkeleton";
import HeroSkeleton from "./HeroSkeleton";
import CategoriesSkeleton from "./CategoriesSkeleton";
import DashboardWelcomeSkeleton from "../dashboard/hub/DashboardWelcomeSkeleton";
import { SkBox, SkLine } from "./SkeletonPrimitives";
import "./home-skeleton.css";
import "./locale-transition.css";

function GenericBodySkeleton() {
  return (
    <>
      <div className="locale-transition-skeleton__hero">
        <SkLine className="h-9 w-[min(18rem,72%)] rounded-xl" />
        <SkLine className="h-4 w-[min(28rem,92%)]" />
        <SkLine className="h-4 w-[min(22rem,78%)]" />
      </div>
      <div className="locale-transition-skeleton__cards">
        <SkBox className="locale-transition-skeleton__block" />
        <SkBox className="locale-transition-skeleton__block" />
      </div>
    </>
  );
}

function PlansBodySkeleton() {
  return (
    <>
      <div className="locale-transition-skeleton__hero" style={{ marginInline: "auto", textAlign: "center", alignItems: "center" }}>
        <SkLine className="h-8 w-[min(14rem,60%)] rounded-xl" />
        <SkLine className="h-4 w-[min(24rem,88%)]" />
      </div>
      <div className="locale-transition-skeleton__cards locale-transition-skeleton__cards--plans">
        {[0, 1, 2].map((i) => (
          <SkBox key={i} className="locale-transition-skeleton__plan-card" />
        ))}
      </div>
    </>
  );
}

function ServicesBodySkeleton() {
  return (
    <>
      <div className="locale-transition-skeleton__hero">
        <SkLine className="h-9 w-[min(16rem,65%)] rounded-xl" />
        <SkLine className="h-4 w-[min(26rem,90%)]" />
      </div>
      <div className="locale-transition-skeleton__service-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkBox key={i} className="locale-transition-skeleton__service-chip" />
        ))}
      </div>
      <div style={{ marginTop: "1.25rem" }}>
        <SkBox className="locale-transition-skeleton__block" />
      </div>
    </>
  );
}

function OrdersBodySkeleton() {
  return (
    <>
      <div className="locale-transition-skeleton__hero">
        <SkLine className="h-9 w-[min(14rem,58%)] rounded-xl" />
        <SkLine className="h-4 w-[min(20rem,82%)]" />
      </div>
      <div className="locale-transition-skeleton__order-list">
        {[0, 1, 2].map((i) => (
          <SkBox key={i} className="locale-transition-skeleton__order-row" />
        ))}
      </div>
    </>
  );
}

function HomeBodySkeleton() {
  return (
    <div className="home-page-skeleton min-w-0 w-full" aria-hidden>
      <div className="home-landing-vp min-w-0">
        <section className="home-top-section w-full min-w-0">
          <div className="home-top-section__inner mx-auto w-full min-w-0 max-w-screen-2xl px-0 pt-2 pb-6 sm:pt-4 sm:pb-8">
            <div className="home-top-section__hero min-w-0">
              <div className="hero-container min-w-0 w-full">
                <section className="home-hero home-hero--ref w-full min-w-0">
                  <div className="home-hero__inner w-full min-w-0 py-4 md:py-6">
                    <HeroSkeleton />
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      </div>
      <CategoriesSkeleton />
    </div>
  );
}

function FreelancerDashboardBodySkeleton() {
  return (
    <div className="min-w-0 w-full" aria-hidden>
      <DashboardWelcomeSkeleton />
    </div>
  );
}

const BODY_BY_VARIANT = {
  home: HomeBodySkeleton,
  plans: PlansBodySkeleton,
  services: ServicesBodySkeleton,
  orders: OrdersBodySkeleton,
  freelancerDashboard: FreelancerDashboardBodySkeleton,
  generic: GenericBodySkeleton,
};

/**
 * Route-aware skeleton shown during locale switch (not first app load).
 * @param {{ variant?: 'home' | 'plans' | 'services' | 'orders' | 'freelancerDashboard' | 'generic' }} props
 */
export default function LocaleTransitionSkeleton({ variant = "generic" }) {
  const Body = BODY_BY_VARIANT[variant] || GenericBodySkeleton;

  return (
    <div className="locale-transition-skeleton">
      <header className="locale-transition-skeleton__nav">
        <div className="locale-transition-skeleton__nav-inner">
          <NavbarSkeleton />
        </div>
      </header>
      <div className="locale-transition-skeleton__body">
        <Body />
      </div>
    </div>
  );
}
