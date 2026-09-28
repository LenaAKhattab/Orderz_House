import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/planAdminResources";
import { DefaultPlanCatalogAdminProvider } from "./DefaultPlanCatalogAdminContext";
import PlanCatalogNavigation from "./PlanCatalogNavigation";
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
  const { t } = useTranslation();
  return (
    <DefaultPlanCatalogAdminProvider isEn={isEn}>
      <DashboardShell className={`oh-sapl-page ${className}`.trim()}>
        <DashboardPageHeader
          className="oh-sapl-header oh-sapl-header--compact"
          eyebrow={t("planAdmin.catalog.eyebrow")}
          title={t("planAdmin.catalog.adminTitle")}
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.managePlans")}
        />
        <PlanCatalogNavigation activeCatalog={activeCatalog} hint={hint} />
        {children}
      </DashboardShell>
    </DefaultPlanCatalogAdminProvider>
  );
}
