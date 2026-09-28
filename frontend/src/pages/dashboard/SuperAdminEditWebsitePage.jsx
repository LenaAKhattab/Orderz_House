import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { SUPER_ADMIN_WEBSITE_SECTIONS } from "../../constants/superAdminWebsiteSections";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/siteEditorResources";
import WebsiteSectionCard from "./WebsiteSectionCard";
import "./superAdminEditWebsitePage.css";

export default function SuperAdminEditWebsitePage() {
  const { t } = useTranslation();

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("siteEditor.editWebsiteHub.pageTitle")}
        description={t("siteEditor.editWebsiteHub.pageDescription")}
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.editWebsite")}
      />

      <DashboardSection title={t("siteEditor.editWebsiteHub.sectionTitle")}>
        <div className="oh-website-sections">
          {SUPER_ADMIN_WEBSITE_SECTIONS.map((section) => (
            <WebsiteSectionCard
              key={section.id}
              id={section.id}
              title={t(section.titleKey)}
              description={t(section.descriptionKey)}
              editLabel={t(section.editLabelKey)}
              path={section.path}
            />
          ))}
        </div>
      </DashboardSection>
    </DashboardShell>
  );
}
