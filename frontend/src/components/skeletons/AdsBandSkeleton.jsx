import { SkBox, SkLine } from "./SkeletonPrimitives";

function AdCardSkeleton() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm sm:p-4">
      <SkBox className="aspect-[16/10] w-full rounded-xl" />
      <div className="mt-3 flex flex-1 flex-col gap-2 px-0.5 pb-1">
        <SkLine className="h-4 w-[60%] max-w-[12rem]" />
        <SkLine className="h-3 w-full max-w-none opacity-90" />
        <SkLine className="h-3 w-[92%] opacity-85" />
        <SkBox className="mt-auto h-9 w-[7.5rem] rounded-full" />
      </div>
    </div>
  );
}

/**
 * Matches `HomePromoOffersSection` band: title row + responsive grid of cards.
 * @param {{ variant?: "default"|"hero" }} p
 */
export default function AdsBandSkeleton({ variant = "default" }) {
  const isHero = variant === "hero";
  return (
    <div
      className={`home-promo-offers home-promo-offers--skeleton w-full min-w-0${isHero ? " home-promo-offers--hero" : ""}`}
      aria-hidden
    >
      {!isHero ? (
        <div className="home-promo-offers__head">
          <div className="home-promo-offers__title-block">
            <SkBox className="h-5 w-5 shrink-0 rounded-md opacity-70" />
            <SkLine className="h-7 w-[min(100%,14rem)] rounded-lg" />
          </div>
        </div>
      ) : null}
      {isHero ? (
        <div className="home-promo-offers__grid">
          <div className="home-promo-offers__cell">
            <SkBox className="mx-auto h-[clamp(5.5rem,16vw,6.75rem)] w-full max-w-[42.5rem] rounded-2xl border border-slate-200/70" />
          </div>
        </div>
      ) : (
        <div className="home-promo-offers__grid">
          <div className="home-promo-offers__cell">
            <AdCardSkeleton />
          </div>
          <div className="home-promo-offers__cell max-[639px]:hidden">
            <AdCardSkeleton />
          </div>
          <div className="home-promo-offers__cell max-[1023px]:hidden">
            <AdCardSkeleton />
          </div>
        </div>
      )}
    </div>
  );
}
