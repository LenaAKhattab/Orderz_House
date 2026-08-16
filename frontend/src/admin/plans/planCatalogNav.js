import { PLAN_CATALOG, PLAN_CATALOG_LABELS } from "../../constants/planCatalogs.js";
import { PLAN_ADMIN_SECTION, parsePlanAdminSection } from "./planAdminSections.js";

/** Nav-only id — not a default_plan_catalog / checkout source. */
export const TRAINING_PACKAGES_NAV_ID = "training_packages";

export const PLAN_CATALOG_ADMIN_TITLE = Object.freeze({
  ar: "إدارة الباقات والاشتراكات",
  en: "Plan and subscription management",
});

export const PLAN_CATALOG_ADMIN_HREF = Object.freeze({
  [PLAN_CATALOG.MAIN_PLANS]: "/dashboard/super-admin/plans?section=core",
  [PLAN_CATALOG.PAGE_PLANS]: "/dashboard/super-admin/plans?section=pages",
  [PLAN_CATALOG.MARKETPLACE_PLANS]: "/dashboard/super-admin/marketplace-plans",
  [TRAINING_PACKAGES_NAV_ID]: "/dashboard/super-admin/training-packages",
});

export const PLAN_CATALOG_NAV = Object.freeze([
  {
    id: PLAN_CATALOG.MAIN_PLANS,
    labelAr: PLAN_CATALOG_LABELS[PLAN_CATALOG.MAIN_PLANS].ar,
    labelEn: PLAN_CATALOG_LABELS[PLAN_CATALOG.MAIN_PLANS].en,
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MAIN_PLANS],
  },
  {
    id: PLAN_CATALOG.PAGE_PLANS,
    labelAr: PLAN_CATALOG_LABELS[PLAN_CATALOG.PAGE_PLANS].ar,
    labelEn: PLAN_CATALOG_LABELS[PLAN_CATALOG.PAGE_PLANS].en,
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.PAGE_PLANS],
  },
  {
    id: PLAN_CATALOG.MARKETPLACE_PLANS,
    labelAr: PLAN_CATALOG_LABELS[PLAN_CATALOG.MARKETPLACE_PLANS].ar,
    labelEn: PLAN_CATALOG_LABELS[PLAN_CATALOG.MARKETPLACE_PLANS].en,
    href: PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MARKETPLACE_PLANS],
  },
  {
    id: TRAINING_PACKAGES_NAV_ID,
    labelAr: "باقات التدريب",
    labelEn: "Training packages",
    href: PLAN_CATALOG_ADMIN_HREF[TRAINING_PACKAGES_NAV_ID],
  },
]);

export function catalogIdForAdminSection(section) {
  return parsePlanAdminSection(section) === PLAN_ADMIN_SECTION.PAGES
    ? PLAN_CATALOG.PAGE_PLANS
    : PLAN_CATALOG.MAIN_PLANS;
}

export function resolveActivePlanCatalogNavId(pathname, searchParams) {
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
