import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import { SUPER_ADMIN_WEBSITE_SECTIONS } from "../../constants/superAdminWebsiteSections";
import WebsiteSectionCard from "./WebsiteSectionCard";
import "./superAdminEditWebsitePage.css";

export default function SuperAdminEditWebsitePage() {
  return (
    <DashboardShell>
      <DashboardPageHeader
        title="تعديل الموقع"
        description="اختر القسم الذي تريد تعديله من محتوى الموقع العام."
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.editWebsite")}
      />

      <DashboardSection title="أقسام الموقع القابلة للتعديل">
        <div className="oh-website-sections">
          {SUPER_ADMIN_WEBSITE_SECTIONS.map((section) => (
            <WebsiteSectionCard
              key={section.id}
              id={section.id}
              title={section.title}
              description={section.description}
              editLabel={section.editLabel}
              path={section.path}
            />
          ))}
        </div>
      </DashboardSection>
    </DashboardShell>
  );
}
