import { SkBox, SkLine } from "./SkeletonPrimitives";

/** Approximates `PartnersSection` height and title + logo row. */
export default function PartnersBandSkeleton() {
  return (
    <section
      className="partners-section partners-section--skeleton relative overflow-hidden bg-[#f3f4f4]"
      aria-hidden
    >
      <div className="container partners-section__inner py-10 sm:py-12 md:py-14">
        <SkLine className="mx-auto mb-8 h-8 w-[min(100%,12rem)] rounded-lg sm:mb-10 md:h-9" />
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-6 sm:gap-10 md:gap-12" aria-hidden>
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <SkBox className="h-12 w-[7.5rem] rounded-xl sm:h-14 sm:w-[8.5rem]" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
