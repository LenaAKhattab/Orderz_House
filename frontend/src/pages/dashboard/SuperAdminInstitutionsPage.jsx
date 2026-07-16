import { Building2 } from "lucide-react";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { useTranslation } from "../../i18n/LanguageProvider";

export default function SuperAdminInstitutionsPage() {
  const { t } = useTranslation();

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.institutions.title")}
        description={t("dashboard.institutions.description")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.institutions")}
      />

      <DashboardSection title={t("dashboard.institutions.sectionTitle")}>
        <DashboardEmptyState
          title={t("dashboard.institutions.placeholderTitle")}
          description={t("dashboard.institutions.placeholderDescription")}
          icon={<Building2 size={40} strokeWidth={1.5} aria-hidden />}
        />
      </DashboardSection>
    </DashboardShell>
  );
}
