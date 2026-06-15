import { SkBox, SkLine } from "./SkeletonPrimitives";
import { HOME_FEATURED_SERVICES_COUNT } from "../../constants/homeFeaturedServices";
import "../sections/categories-section.css";
import "./home-skeleton.css";

/** Matches one featured service cell on the homepage. */
export function FeaturedServiceIconSkeleton() {
  return (
    <div className="home-categories-icon-item home-categories-icon-item--skeleton" aria-hidden>
      <SkBox className="home-categories-icon-item__icon h-12 w-12 rounded-md" />
      <SkLine className="h-3 w-[78%] rounded-md" />
    </div>
  );
}

/** 3×3 featured services grid skeleton. */
export function FeaturedServicesGridSkeleton() {
  return (
    <div className="home-categories-icon-grid home-categories-icon-grid--featured" aria-hidden>
      {Array.from({ length: HOME_FEATURED_SERVICES_COUNT }, (_, index) => (
        <FeaturedServiceIconSkeleton key={`featured-skel-${index}`} />
      ))}
    </div>
  );
}

/** @deprecated Use FeaturedServiceIconSkeleton */
export function SubSubcategoryIconSkeleton() {
  return <FeaturedServiceIconSkeleton />;
}

/** @deprecated Use FeaturedServicesGridSkeleton */
export function SubSubcategoryGridSkeleton() {
  return <FeaturedServicesGridSkeleton />;
}

/** @deprecated */
export function CategoryCardSkeleton() {
  return <FeaturedServiceIconSkeleton />;
}

/** Same outer rhythm as `CategoriesSection` (centered heading + featured grid). */
export default function CategoriesSkeleton() {
  return (
    <section
      className="home-categories-section relative box-border my-8 w-full px-3 py-6 sm:my-10 sm:px-5 sm:py-8 md:my-12 md:px-8 md:py-10 lg:my-14 lg:px-9 lg:py-12 max-[560px]:px-2.5"
      aria-hidden
    >
      <div className="home-categories-stack relative z-10 mx-auto w-full">
        <header className="home-categories-intro home-categories-intro--centered w-full">
          <SkLine className="mx-auto h-8 w-[min(100%,18rem)] rounded-lg" />
          <SkLine className="mx-auto mt-3 h-4 w-[min(100%,14rem)] rounded-md" />
        </header>
        <div className="home-categories-panel w-full">
          <FeaturedServicesGridSkeleton />
        </div>
      </div>
    </section>
  );
}
