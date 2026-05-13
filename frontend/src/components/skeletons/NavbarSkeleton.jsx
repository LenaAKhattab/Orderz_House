import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Matches `Navbar` shell: logo rail, center pills, actions — RTL-friendly flex row. */
export default function NavbarSkeleton() {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:gap-4 lg:gap-6" aria-hidden>
      <SkBox className="h-10 w-[112px] shrink-0 sm:h-11 sm:w-[128px] lg:h-12 lg:w-[140px]" />
      <div className="order-3 flex w-full basis-full justify-center gap-2 pt-1 lg:absolute lg:inset-0 lg:z-[1] lg:flex lg:w-auto lg:basis-auto lg:items-center lg:justify-center lg:gap-3 lg:pt-0 lg:[pointer-events:none]">
        <div className="flex w-max max-w-full flex-nowrap items-center gap-2 sm:gap-3 lg:[pointer-events:auto]">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkLine key={i} className="h-8 w-[4.5rem] shrink-0 rounded-full sm:h-9 sm:w-[5.25rem] lg:h-10 lg:w-[5.75rem]" />
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
        <SkBox className="h-10 w-24 rounded-full sm:h-11 sm:w-28" />
        <SkBox className="h-10 w-10 rounded-full sm:h-11 sm:w-11" />
      </div>
    </div>
  );
}
