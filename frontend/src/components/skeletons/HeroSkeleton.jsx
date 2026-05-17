import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Mirrors `HeroMainContent` (centered copy + stat row over hero background). */
export default function HeroSkeleton() {
  return (
    <div className="hero-main-content relative z-[1] mx-auto flex min-h-0 w-full max-w-[min(100%,48rem)] flex-col items-center justify-start" aria-hidden>
      <div className="flex min-w-0 w-full flex-col items-center gap-3 text-center">
        <div className="flex w-full min-w-0 max-w-[min(100%,48rem)] flex-col items-center gap-2.5">
          <SkBox className="h-12 w-28 rounded-lg opacity-90 sm:h-14 sm:w-32" />
          <SkLine className="mx-auto h-[clamp(2rem,5vw,2.75rem)] w-[88%] max-w-[20rem] rounded-lg" />
          <SkLine className="mx-auto h-[clamp(1.75rem,4.5vw,2.35rem)] w-[72%] max-w-[16rem] rounded-lg" />
          <SkLine className="mx-auto mt-1 h-4 w-[min(100%,28rem)] max-w-full rounded-md opacity-90" />
          <SkLine className="mx-auto h-4 w-[min(100%,22rem)] max-w-full rounded-md opacity-80" />
        </div>
        <div className="mt-2 flex w-full min-w-0 flex-wrap justify-center gap-2.5">
          <SkBox className="h-11 w-[min(100%,11rem)] rounded-full sm:h-12" />
          <SkBox className="h-11 w-[min(100%,10rem)] rounded-full sm:h-12" />
        </div>
        <div className="mt-5 w-full min-w-0 sm:mt-6">
          <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3">
            <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
            <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
            <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
          </div>
        </div>
      </div>
    </div>
  );
}
