import { PLAN_CATALOG, PLAN_CATALOG_LABELS, isPlanCatalog } from "../../constants/planCatalogs.js";
import { PLAN_ADMIN_SECTION, parsePlanAdminSection } from "./planAdminSections.js";

export const PLAN_CATALOG_ADMIN_TITLE = Object.freeze({
  ar: "إدارة الباقات والاشتراكات",
  en: "Plan and subscription management",
});

export const PLAN_CATALOG_ADMIN_HREF = Object.freeze({
  [PLAN_CATALOG.MAIN_PLANS]: "/dashboard/super-admin/plans?section=core",
  [PLAN_CATALOG.PAGE_PLANS]: "/dashboard/super-admin/plans?section=pages",
  [PLAN_CATALOG.MARKETPLACE_PLANS]: "/dashboard/super-admin/marketplace-plans",
});

export const DEFAULT_PLAN_CATALOG_TAB_BADGE = Object.freeze({
  ar: "معروض الآن",
  en: "Shown now",
  titleAr: "هذا هو قسم الباقات المعروض للمستخدمين حاليًا",
  titleEn: "This is the plan catalog currently shown to users",
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
  if (String(pathname || "").includes("/marketplace-plans")) {
    return PLAN_CATALOG.MARKETPLACE_PLANS;
  }
  const section =
    typeof searchParams?.get === "function" ? searchParams.get("section") : searchParams;
  return catalogIdForAdminSection(section);
}
