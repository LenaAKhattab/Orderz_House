import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Accordion-shaped placeholders matching `FaqSection` density. */
export default function FaqSkeleton() {
  return (
    <section className="relative w-full px-4 py-10 sm:px-8 sm:py-12 md:px-12 lg:px-16" dir="rtl" aria-hidden>
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-8 sm:mb-10">
          <SkLine className="h-8 w-[min(100%,14rem)] rounded-lg sm:h-9" />
        </header>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <ul className="m-0 list-none divide-y divide-gray-200 p-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-4 sm:px-5 sm:py-5">
                <SkLine className="h-4 flex-1 rounded-md" />
                <SkBox className="h-8 w-8 shrink-0 rounded-md opacity-80" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
