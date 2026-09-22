import { useState } from "react";
import { useAuth } from "../../context/useAuth";
import { ROLE } from "../../constants/authRoutes";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import LegacyCampaignsPanel from "./legacyFreelancerAdmin/LegacyCampaignsPanel";
import LegacyFreelancersPanel from "./legacyFreelancerAdmin/LegacyFreelancersPanel";
import LegacyDocumentsPanel from "./legacyFreelancerAdmin/LegacyDocumentsPanel";
import { CENTER_TABS } from "./legacyFreelancerAdmin/legacyAdminShared";

export default function SuperAdminLegacyFreelancerInvitesPage() {
  const { user } = useAuth();
  const isSuperAdmin = String(user?.role || user?.primaryRole || "") === ROLE.SUPER_ADMIN;
  const [activeTab, setActiveTab] = useState("freelancers");
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);

  if (!isSuperAdmin) {
    return (
      <DashboardShell>
        <DashboardEmptyState title="غير مصرح" description="هذه الصفحة لمدير النظام فقط." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <DashboardPageHeader
        title="مركز إدارة الفريلانسرز القدامى"
        breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
        description="إدارة الفريلانسرز القدامى، حملات الدعوة المشتركة، الأوراق والعقود، وإعدادات التسجيل."
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1.5" role="tablist">
        {CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={activeTab === t.id}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              activeTab === t.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-white"
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "freelancers" ? <LegacyFreelancersPanel /> : null}

      {activeTab === "campaigns" ? (
        <LegacyCampaignsPanel
          selectedCampaignId={selectedCampaignId}
          onSelectedCampaignIdChange={setSelectedCampaignId}
          showFieldConfig
        />
      ) : null}

      {activeTab === "documents" ? (
        <LegacyDocumentsPanel
          selectedCampaignId={selectedCampaignId}
          onSelectedCampaignIdChange={setSelectedCampaignId}
        />
      ) : null}

      {activeTab === "registration" ? (
        <LegacyCampaignsPanel
          selectedCampaignId={selectedCampaignId}
          onSelectedCampaignIdChange={setSelectedCampaignId}
          showFieldConfig
          embedMode
        />
      ) : null}
    </DashboardShell>
  );
}
