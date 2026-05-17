import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Placeholders aligned with `FaqSection` (header + list + side image). */
export default function FaqSkeleton() {
  return (
    <section className="relative w-full border-t border-slate-200/60 px-4 py-12 sm:px-6 sm:py-14 md:px-8 md:py-16 lg:px-10" dir="rtl" aria-hidden>
      <div className="mx-auto w-full max-w-6xl pb-2">
        <header className="mb-8 text-right sm:mb-10">
          <SkLine className="ms-auto h-9 w-[min(100%,14rem)] rounded-lg sm:h-10" />
          <SkLine className="ms-auto mt-3 h-4 w-[min(100%,22rem)] max-w-full rounded-md opacity-80" />
        </header>
        <div className="flex flex-col items-stretch gap-8 md:flex-row md:items-start md:gap-8 lg:gap-12">
          <ul className="m-0 min-w-0 flex-1 list-none divide-y divide-slate-200/80 p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-1 py-4 sm:px-0 sm:py-[1.15rem]">
                <SkLine className="h-4 flex-1 rounded-md" />
                <SkBox className="h-8 w-8 shrink-0 rounded-md opacity-80" />
              </li>
            ))}
          </ul>
          <div className="flex shrink-0 justify-center md:w-[min(42%,14rem)] md:justify-end lg:w-[min(38%,16rem)]">
            <SkBox className="h-[clamp(9rem,28vw,16rem)] w-[clamp(9rem,28vw,16rem)] max-w-full shrink-0 rounded-none opacity-90" />
          </div>
        </div>
      </div>
    </section>
  );
}
