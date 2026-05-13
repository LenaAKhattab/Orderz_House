import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Mirrors `HeroMainContent` grid: copy column + device visual + stat row. */
export default function HeroSkeleton() {
  return (
    <div className="hero-main-content min-w-0 w-full" aria-hidden>
      <div className="grid min-w-0 grid-cols-1 content-start items-start gap-6 sm:gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-8 lg:gap-y-6 xl:gap-x-10">
        <div className="flex min-w-0 flex-col items-center gap-3 text-center lg:col-span-5 lg:items-start lg:text-start">
          <div className="flex w-full min-w-0 max-w-[min(100%,48rem)] flex-col items-center gap-2.5 lg:items-start">
            <SkLine className="mx-auto h-[clamp(2rem,5vw,2.75rem)] w-[88%] max-w-[20rem] rounded-lg lg:mx-0" />
            <SkLine className="mx-auto h-[clamp(1.75rem,4.5vw,2.35rem)] w-[72%] max-w-[16rem] rounded-lg lg:mx-0" />
            <SkLine className="mx-auto mt-1 h-4 w-[min(100%,28rem)] max-w-full rounded-md opacity-90 lg:mx-0" />
            <SkLine className="mx-auto h-4 w-[min(100%,22rem)] max-w-full rounded-md opacity-80 lg:mx-0" />
          </div>
          <div className="mt-2 flex w-full min-w-0 flex-wrap justify-center gap-2.5 lg:justify-start">
            <SkBox className="h-11 w-[min(100%,11rem)] rounded-full sm:h-12" />
            <SkBox className="h-11 w-[min(100%,10rem)] rounded-full sm:h-12" />
          </div>
          <div className="mt-5 w-full min-w-0 sm:mt-6">
            <div className="flex w-full flex-wrap justify-center gap-2 sm:gap-3 lg:justify-start">
              <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
              <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
              <SkBox className="h-[4.5rem] min-w-[min(100%,9.5rem)] flex-1 rounded-2xl sm:h-[4.75rem] lg:max-w-[11rem]" />
            </div>
          </div>
        </div>
        <div className="flex min-h-[220px] min-w-0 w-full max-w-full justify-center self-center sm:min-h-[260px] lg:col-span-7 lg:min-h-[300px]">
          <SkBox className="aspect-[4/3] w-full max-w-[min(100%,520px)] rounded-[2rem] opacity-95" />
        </div>
      </div>
    </div>
  );
}
