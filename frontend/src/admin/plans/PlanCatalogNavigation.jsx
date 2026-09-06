import { Link } from "react-router-dom";
import {
  DEFAULT_PLAN_CATALOG_TAB_BADGE,
  PLAN_CATALOG_NAV,
  orderPlanCatalogNav,
} from "./planCatalogNav";
import { useAdminDefaultPlanCatalog } from "./DefaultPlanCatalogAdminContext";
import { PlanCatalogNavSkeleton } from "./PlanCatalogSkeletons";
import "./super-admin-plans.css";
import "./specialOfferAdmin.css";

/**
 * Shared Super Admin catalog tabs — same three destinations on every plans page.
 * Default catalog (users' current catalog) is first/RTL-right and badged "معروض الآن".
 * Active/open tab highlighting stays independent of that default.
 */
export default function PlanCatalogNavigation({ activeCatalog, isEn = false, hint }) {
  const adminDefault = useAdminDefaultPlanCatalog();
  const resolvedDefault = adminDefault?.ready ? adminDefault.catalog : null;
  const showSkeleton = Boolean(adminDefault?.loading) && !resolvedDefault;
  const items = resolvedDefault
    ? orderPlanCatalogNav(PLAN_CATALOG_NAV, resolvedDefault)
    : PLAN_CATALOG_NAV;

  return (
    <div className="oh-sapl-section-toggle" data-plan-catalog-nav="true">
      {showSkeleton ? (
        <PlanCatalogNavSkeleton isEn={isEn} />
      ) : (
        <div
          className="oh-sapl-section-toggle__tabs"
          role="tablist"
          dir={isEn ? "ltr" : "rtl"}
          aria-label={isEn ? "Plan catalogs" : "أقسام الباقات"}
          data-default-plan-catalog={resolvedDefault || ""}
        >
          {items.map((item) => {
            const selected = activeCatalog === item.id;
            const isDefault = Boolean(resolvedDefault) && item.id === resolvedDefault;
            return (
              <Link
                key={item.id}
                to={item.href}
                role="tab"
                className="oh-sapl-section-toggle__tab oh-sapl-section-toggle__tab-link"
                aria-selected={selected}
                aria-current={selected ? "page" : undefined}
                data-catalog-nav-id={item.id}
                data-default-catalog-tab={isDefault ? "true" : undefined}
              >
                <span>{isEn ? item.labelEn : item.labelAr}</span>
                {item.tabBadgeAr || item.tabBadgeEn ? (
                  <span className="oh-sapl-section-toggle__special-badge" data-special-tab-badge="true">
                    {isEn ? item.tabBadgeEn || item.tabBadgeAr : item.tabBadgeAr || item.tabBadgeEn}
                  </span>
                ) : null}
                {isDefault ? (
                  <span
                    className="oh-sapl-section-toggle__now-badge"
                    data-shown-now-badge="true"
                    title={
                      isEn
                        ? DEFAULT_PLAN_CATALOG_TAB_BADGE.titleEn
                        : DEFAULT_PLAN_CATALOG_TAB_BADGE.titleAr
                    }
                  >
                    {isEn ? DEFAULT_PLAN_CATALOG_TAB_BADGE.en : DEFAULT_PLAN_CATALOG_TAB_BADGE.ar}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
      {hint ? <p className="oh-sapl-section-toggle__hint">{hint}</p> : null}
    </div>
  );
}
