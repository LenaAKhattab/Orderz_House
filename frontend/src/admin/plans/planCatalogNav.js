import { PLAN_CATALOG, isPlanCatalog } from "../../constants/planCatalogs.js";
import { PLAN_ADMIN_SECTION, parsePlanAdminSection } from "./planAdminSections.js";

/** Nav-only id — not a default_plan_catalog / checkout source. */
export const TRAINING_PACKAGES_NAV_ID = "training_packages";
export const SPECIAL_OFFER_NAV_ID = "special_offer_package";

export const PLAN_CATALOG_ADMIN_TITLE_KEY = "planAdmin.catalog.adminTitle";

export const PLAN_CATALOG_ADMIN_HREF = Object.freeze({
  [PLAN_CATALOG.MAIN_PLANS]: "/dashboard/super-admin/plans?section=core",
  [PLAN_CATALOG.PAGE_PLANS]: "/dashboard/super-admin/plans?section=pages",
  [PLAN_CATALOG.MARKETPLACE_PLANS]: "/dashboard/super-admin/marketplace-plans",
  [TRAINING_PACKAGES_NAV_ID]: "/dashboard/super-admin/training-packages",
  [SPECIAL_OFFER_NAV_ID]: "/dashboard/super-admin/special-offer-package",
});

export const PLAN_CATALOG_NAV = Object.freeze([
  {
    id: PLAN_CATALOG.MAIN_PLANS,
    labelKey: "planAdmin.catalog.nav.main_plans",
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MAIN_PLANS],
  },
  {
    id: PLAN_CATALOG.PAGE_PLANS,
    labelKey: "planAdmin.catalog.nav.page_plans",
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.PAGE_PLANS],
  },
  {
    id: PLAN_CATALOG.MARKETPLACE_PLANS,
    labelKey: "planAdmin.catalog.nav.marketplace_plans",
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MARKETPLACE_PLANS],
  },
  {
    id: TRAINING_PACKAGES_NAV_ID,
    labelKey: "planAdmin.catalog.nav.training",
    href: PLAN_CATALOG_ADMIN_HREF[TRAINING_PACKAGES_NAV_ID],
  },
  {
    id: SPECIAL_OFFER_NAV_ID,
    labelKey: "planAdmin.catalog.nav.specialOffer",
    href: PLAN_CATALOG_ADMIN_HREF[SPECIAL_OFFER_NAV_ID],
    tabBadgeKey: "planAdmin.catalog.tabBadgeSpecial",
  },
]);

/**
 * Admin-only tab order: default_plan_catalog first (RTL rightmost / LTR start).
 * Preserves the canonical relative order of the remaining tabs.
 * Unresolved/invalid default → canonical order; caller must not show the badge.
 */
export function orderPlanCatalogNav(items = PLAN_CATALOG_NAV, defaultCatalog) {
  const list = Array.isArray(items) ? [...items] : [...PLAN_CATALOG_NAV];
  if (!isPlanCatalog(defaultCatalog)) return list;
  const preferred = list.filter((item) => item.id === defaultCatalog);
  const rest = list.filter((item) => item.id !== defaultCatalog);
  return [...preferred, ...rest];
}

export function catalogIdForAdminSection(section) {
  return parsePlanAdminSection(section) === PLAN_ADMIN_SECTION.PAGES
    ? PLAN_CATALOG.PAGE_PLANS
    : PLAN_CATALOG.MAIN_PLANS;
}

export function resolveActivePlanCatalogNavId(pathname, searchParams) {
  if (String(pathname || "").includes("/special-offer-package")) {
    return SPECIAL_OFFER_NAV_ID;
  }
  if (String(pathname || "").includes("/training-packages")) {
    return TRAINING_PACKAGES_NAV_ID;
  }
  if (String(pathname || "").includes("/marketplace-plans")) {
    return PLAN_CATALOG.MARKETPLACE_PLANS;
  }
  const section =
    typeof searchParams?.get === "function" ? searchParams.get("section") : searchParams;
  return catalogIdForAdminSection(section);
}
