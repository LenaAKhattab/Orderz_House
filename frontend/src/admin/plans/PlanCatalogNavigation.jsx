import { Link } from "react-router-dom";
import { PLAN_CATALOG_NAV } from "./planCatalogNav";
import "./super-admin-plans.css";

/**
 * Shared Super Admin catalog tabs — same three destinations on every plans page.
 */
export default function PlanCatalogNavigation({ activeCatalog, isEn = false, hint }) {
  return (
    <div className="oh-sapl-section-toggle" data-plan-catalog-nav="true">
      <div
        className="oh-sapl-section-toggle__tabs"
        role="tablist"
        aria-label={isEn ? "Plan catalogs" : "أقسام الباقات"}
      >
        {PLAN_CATALOG_NAV.map((item) => {
          const selected = activeCatalog === item.id;
          return (
            <Link
              key={item.id}
              to={item.href}
              role="tab"
              className="oh-sapl-section-toggle__tab oh-sapl-section-toggle__tab-link"
              aria-selected={selected}
              aria-current={selected ? "page" : undefined}
              data-catalog-nav-id={item.id}
            >
              <span>{isEn ? item.labelEn : item.labelAr}</span>
            </Link>
          );
        })}
      </div>
      {hint ? <p className="oh-sapl-section-toggle__hint">{hint}</p> : null}
    </div>
  );
}
