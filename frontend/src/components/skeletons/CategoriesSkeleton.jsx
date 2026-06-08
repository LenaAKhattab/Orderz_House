import { SkBox, SkLine } from "./SkeletonPrimitives";
import "./home-skeleton.css";

/** Matches one `CategoriesSection` card — same dimensions, spacing, and RTL-safe layout. */
export function CategoryCardSkeleton() {
  return (
    <article
      className="home-categories-card flex min-w-0 max-w-full flex-col rounded-[24px] border border-slate-200/70 bg-white p-5 shadow-[0_10px_40px_-14px_rgba(15,23,42,0.12)]"
      aria-hidden
    >
      <div className="home-categories-card__media relative w-full shrink-0">
        <SkBox className="home-categories-card__image aspect-[4/3] w-full shrink-0 rounded-2xl ring-1 ring-slate-200/35 sm:aspect-[5/3]" />
        <SkBox className="home-categories-card__chip absolute bottom-0 left-1/2 z-10 h-[52px] w-[52px] -translate-x-1/2 translate-y-1/2 rounded-full border-[5px] border-white shadow-[0_6px_20px_rgba(15,23,42,0.12)]" />
      </div>
      <div className="home-categories-card__body flex flex-1 flex-col items-center gap-2 px-1 pb-1 pt-9 text-center sm:gap-2.5 sm:px-2 sm:pt-10">
        <SkLine className="home-categories-card__title h-5 w-[55%] rounded-md" />
        <SkLine className="home-categories-card__desc h-3.5 w-[92%] max-w-[30ch] rounded-md opacity-90" />
        <SkLine className="home-categories-card__desc h-3.5 w-[80%] max-w-[24ch] rounded-md opacity-75" />
        <div className="home-categories-card__actions mt-3 flex w-full flex-1 flex-col justify-end sm:mt-4">
          <SkLine className="home-categories-card__btn h-10 w-[min(100%,14rem)] rounded-full opacity-80" />
        </div>
      </div>
    </article>
  );
}

/** Same outer rhythm as `CategoriesSection` (aside + 3-card rail). */
export default function CategoriesSkeleton() {
  return (
    <section
      className="relative box-border my-8 w-full px-3 py-6 sm:my-10 sm:px-5 sm:py-8 md:my-12 md:px-8 md:py-10 lg:my-14 lg:px-9 lg:py-12 max-[560px]:px-2.5"
      aria-hidden
    >
      <div className="relative z-10 mx-auto w-full max-w-none">
        <div className="grid w-full grid-cols-1 items-stretch rounded-[22px] p-5 sm:p-6 md:p-8 lg:rounded-[28px] lg:px-9 xl:rounded-[32px] xl:p-0 max-[960px]:gap-6 min-[961px]:grid-cols-[minmax(220px,32%)_minmax(0,1fr)]">
          <aside className="flex max-w-[min(400px,100%)] flex-col items-start justify-center gap-3 px-1 py-1.5 sm:gap-3.5 sm:px-2 max-[960px]:max-w-none max-[960px]:items-center max-[960px]:text-center">
            <SkLine className="h-8 w-[min(100%,16rem)] rounded-lg max-[960px]:mx-auto" />
            <SkLine className="h-4 w-[min(100%,22rem)] max-w-full rounded-md opacity-90 max-[960px]:mx-auto" />
            <SkLine className="h-4 w-[min(100%,18rem)] max-w-full rounded-md opacity-80 max-[960px]:mx-auto" />
          </aside>
          <div className="min-h-0 min-w-0 rounded-2xl border border-gray-200/90 bg-white p-2.5 sm:p-4 lg:rounded-[22px] lg:p-5">
            <div
              className="home-categories-cards m-0 grid min-w-0 list-none items-stretch gap-5 sm:gap-6 md:gap-7"
              style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}
            >
              <CategoryCardSkeleton />
              <CategoryCardSkeleton />
              <CategoryCardSkeleton />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
