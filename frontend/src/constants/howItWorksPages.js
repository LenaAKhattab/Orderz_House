/** Public routes ↔ database slugs for How it works pages. */
import { ct, withCatalogLabels } from "./constantsI18n.js";

/** `navLabel` follows the non-English UI branch (Arabic, or the active de / nl / ro locale); prefer `t(labelKey)`. */
export const HOW_IT_WORKS_PAGES = [
  withCatalogLabels(
    {
      slug: "how-it-works-freelancer",
      routeKey: "freelancer",
      path: "/how-it-works/freelancer",
      labelKey: "nav.howItWorksFreelancer",
      adminLabelKey: "siteEditor.howItWorksPages.freelancer",
    },
    "howItWorksPages.navLabels.freelancer",
    { navLabel: "local" },
    { keyProp: false },
  ),
  withCatalogLabels(
    {
      slug: "how-it-works-client",
      routeKey: "client",
      path: "/how-it-works/client",
      labelKey: "nav.howItWorksClient",
      adminLabelKey: "siteEditor.howItWorksPages.client",
    },
    "howItWorksPages.navLabels.client",
    { navLabel: "local" },
    { keyProp: false },
  ),
];

export const HOW_IT_WORKS_ROUTE_TO_SLUG = Object.fromEntries(
  HOW_IT_WORKS_PAGES.map((p) => [p.routeKey, p.slug]),
);

export const HOW_IT_WORKS_SLUG_TO_PAGE = Object.fromEntries(
  HOW_IT_WORKS_PAGES.map((p) => [p.slug, p]),
);

/** Block type labels (getters: non-English UI branch; catalog platformConstants.howItWorksPages.blockTypes). */
export const BLOCK_TYPE_LABELS = Object.defineProperties(
  {},
  Object.fromEntries(
    ["title", "text", "image", "text_image"].map((type) => [
      type,
      { enumerable: true, get: () => ct(`howItWorksPages.blockTypes.${type}`) },
    ]),
  ),
);
