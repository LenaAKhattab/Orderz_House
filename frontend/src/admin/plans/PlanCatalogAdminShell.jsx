import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { DefaultPlanCatalogAdminProvider } from "./DefaultPlanCatalogAdminContext";
import PlanCatalogNavigation from "./PlanCatalogNavigation";
import { PLAN_CATALOG_ADMIN_TITLE } from "./planCatalogNav";
import "./super-admin-plans.css";

/**
 * Unified Super Admin shell for the three plan catalogs.
 * Does not merge catalog APIs, tables, or checkout — navigation and chrome only.
 */
export default function PlanCatalogAdminShell({
  activeCatalog,
  isEn = false,
  hint,
  className = "",
  children,
}) {
  return (
    <DefaultPlanCatalogAdminProvider isEn={isEn}>
      <DashboardShell className={`oh-sapl-page ${className}`.trim()}>
        <DashboardPageHeader
          className="oh-sapl-header oh-sapl-header--compact"
          eyebrow={isEn ? "Super admin" : "لوحة المدير الأعلى"}
          title={isEn ? PLAN_CATALOG_ADMIN_TITLE.en : PLAN_CATALOG_ADMIN_TITLE.ar}
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.managePlans")}
        />
        <PlanCatalogNavigation activeCatalog={activeCatalog} isEn={isEn} hint={hint} />
        {children}
      </DashboardShell>
    </DefaultPlanCatalogAdminProvider>
  );
}
