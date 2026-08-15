/**
 * Super Admin unified plan-catalog navigation.
 * Run: node --test src/admin/plans/planCatalogNav.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PLAN_CATALOG_ADMIN_HREF,
  PLAN_CATALOG_ADMIN_TITLE,
  PLAN_CATALOG_NAV,
  catalogIdForAdminSection,
  resolveActivePlanCatalogNavId,
} from "./planCatalogNav.js";
import { PLAN_CATALOG } from "../../constants/planCatalogs.js";
import { PLAN_ADMIN_SECTION } from "./planAdminSections.js";

describe("PLAN_CATALOG_NAV", () => {
  it("lists the three existing catalogs with their existing admin routes", () => {
    assert.equal(PLAN_CATALOG_NAV.length, 3);
    assert.deepEqual(
      PLAN_CATALOG_NAV.map((item) => item.id),
      [PLAN_CATALOG.MAIN_PLANS, PLAN_CATALOG.PAGE_PLANS, PLAN_CATALOG.MARKETPLACE_PLANS],
    );
    assert.equal(
      PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MAIN_PLANS],
      "/dashboard/super-admin/plans?section=core",
    );
    assert.equal(
      PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.PAGE_PLANS],
      "/dashboard/super-admin/plans?section=pages",
    );
    assert.equal(
      PLAN_CATALOG_ADMIN_HREF[PLAN_CATALOG.MARKETPLACE_PLANS],
      "/dashboard/super-admin/marketplace-plans",
    );
    assert.equal(PLAN_CATALOG_NAV[0].labelAr, "الباقات الرئيسية");
    assert.equal(PLAN_CATALOG_NAV[1].labelAr, "باقات الصفحات");
    assert.equal(PLAN_CATALOG_NAV[2].labelAr, "باقات العمل");
    assert.equal(PLAN_CATALOG_ADMIN_TITLE.ar, "إدارة الباقات والاشتراكات");
  });

  it("resolves the selected catalog from the existing routes", () => {
    assert.equal(catalogIdForAdminSection(PLAN_ADMIN_SECTION.CORE), PLAN_CATALOG.MAIN_PLANS);
    assert.equal(catalogIdForAdminSection(PLAN_ADMIN_SECTION.PAGES), PLAN_CATALOG.PAGE_PLANS);
    assert.equal(
      resolveActivePlanCatalogNavId("/dashboard/super-admin/plans", { get: () => "core" }),
      PLAN_CATALOG.MAIN_PLANS,
    );
    assert.equal(
      resolveActivePlanCatalogNavId("/dashboard/super-admin/plans", { get: () => "pages" }),
      PLAN_CATALOG.PAGE_PLANS,
    );
    assert.equal(
      resolveActivePlanCatalogNavId("/dashboard/super-admin/marketplace-plans", { get: () => "core" }),
      PLAN_CATALOG.MARKETPLACE_PLANS,
    );
  });
});
