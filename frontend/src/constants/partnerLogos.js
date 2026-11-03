/** Partner logos — files in `public/partners/`. */
import { ct, ctAr, withCatalogLabels } from "./constantsI18n.js";

/** `alt` of the localized partner names follows the non-English UI branch (Arabic, or the active de / nl / ro locale). */
const partner = (row) =>
  withCatalogLabels(row, `partnerLogos.alts.${row.id}`, { alt: "local" }, { keyProp: "altKey" });

export const PARTNER_LOGOS = [
  { id: "gigz", src: "/partners/GIGZ.png", alt: "GIGZHOUSE", href: "https://gigzhouse.com/" },
  partner({
    id: "bildazo",
    src: "/partners/Bildazo.png",
    href: "https://bildazo.com/desktop",
    logoBadge: "circle",
  }),
  partner({ id: "studyzhouse", src: "/partners/studyzhouse.png", href: "https://studyzhouse.com/" }),
  partner({ id: "battech", src: "/partners/Battech.png", href: "https://battechno.com/" }),
];

/** Arabic subtitle (catalog: platformConstants.partnerLogos.subtitle); `partnersSectionSubtitle(locale)` per locale. */
export const PARTNERS_SECTION_SUBTITLE = ctAr("partnerLogos.subtitle");

export function partnersSectionSubtitle(locale) {
  return ct("partnerLogos.subtitle", undefined, locale);
}
