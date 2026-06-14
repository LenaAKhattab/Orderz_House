import { SkBox, SkLine } from "./SkeletonPrimitives";
import "../components/sections/partners-section.css";

/** Approximates `PartnersSection` layout. */
export default function PartnersBandSkeleton() {
  return (
    <section className="partners-section partners-section--skeleton" aria-hidden>
      <div className="partners-section__container">
        <div className="partners-section__content" dir="rtl">
          <div className="partners-section__copy">
            <SkLine className="h-9 w-[min(100%,12rem)] rounded-lg" />
            <SkLine className="h-4 w-[min(100%,16rem)] rounded-md" />
          </div>

          <ul className="partners-section__grid" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="partners-section__grid-cell">
                <SkBox className="h-10 w-[min(100%,7rem)] rounded-md" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
