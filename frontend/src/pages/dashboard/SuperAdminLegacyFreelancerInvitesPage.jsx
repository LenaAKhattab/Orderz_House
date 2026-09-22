import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/useAuth";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardStatsGrid from "../../components/dashboard/DashboardStatsGrid";
import DashboardStatCard, { DashboardStatCardSkeleton } from "../../components/dashboard/DashboardStatCard";
import DashboardTabs, { DashboardTab } from "../../components/dashboard/DashboardTabs";
import { LEGACY_FREELANCERS_MANAGE_PERMISSION } from "../../constants/dashboardPermissions";
import { listLegacyFreelancersRequest } from "../../services/api";
import LegacyCampaignsPanel from "./legacyFreelancerAdmin/LegacyCampaignsPanel";
import LegacyFreelancersPanel from "./legacyFreelancerAdmin/LegacyFreelancersPanel";
import LegacyDocumentsPanel from "./legacyFreelancerAdmin/LegacyDocumentsPanel";
import { CENTER_TABS } from "./legacyFreelancerAdmin/legacyAdminShared";
import "./superAdminUsersPage.css";
import "./legacyFreelancerAdmin/legacyAdminCenter.css";

const EMPTY_INSIGHTS = {
  total: null,
  active: null,
  pendingIdentity: null,
  packageAssigned: null,
};

export default function SuperAdminLegacyFreelancerInvitesPage() {
  const { hasPermission } = useAuth();
  const canManage = Boolean(hasPermission?.(LEGACY_FREELANCERS_MANAGE_PERMISSION));
  const [activeTab, setActiveTab] = useState("freelancers");
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [createSignal, setCreateSignal] = useState(0);
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [insightsLoading, setInsightsLoading] = useState(false);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const [all, active, pendingIdentity, packageAssigned] = await Promise.all([
        listLegacyFreelancersRequest({ page: 1, pageSize: 1 }),
        listLegacyFreelancersRequest({ page: 1, pageSize: 1, isActive: "true" }),
        listLegacyFreelancersRequest({ page: 1, pageSize: 1, identityComplete: "false" }),
        listLegacyFreelancersRequest({ page: 1, pageSize: 1, packageStatus: "active" }),
      ]);
      setInsights({
        total: Number(all?.data?.total) || 0,
        active: Number(active?.data?.total) || 0,
        pendingIdentity: Number(pendingIdentity?.data?.total) || 0,
        packageAssigned: Number(packageAssigned?.data?.total) || 0,
      });
    } catch {
      setInsights(EMPTY_INSIGHTS);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "freelancers" && canManage) loadInsights();
  }, [activeTab, canManage, loadInsights]);

  if (!canManage) {
    return (
      <DashboardShell>
        <DashboardEmptyState
          title="غير مصرح"
          description="تحتاج صلاحية إدارة الفريلانسرز القدامى لعرض هذا المركز."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="oh-legacy-admin">
        <DashboardPageHeader
          eyebrow="لوحة التحكم"
          title="مركز إدارة الفريلانسر القدامى"
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
          description="إدارة الفريلانسرز القدامى، حملات الدعوة المشتركة، الأوراق والعقود، وإعدادات التسجيل ضمن نفس تجربة لوحة الإدارة."
          actions={
            activeTab === "freelancers" ? (
              <Button type="button" onClick={() => setCreateSignal((n) => n + 1)}>
                إضافة فريلانسر قديم
              </Button>
            ) : null
          }
        />

        {activeTab === "freelancers" ? (
          insightsLoading && insights.total == null ? (
            <DashboardStatsGrid className="mb-5">
              {[0, 1, 2, 3].map((i) => (
                <DashboardStatCardSkeleton key={i} />
              ))}
            </DashboardStatsGrid>
          ) : (
            <DashboardStatsGrid className="mb-5">
              <DashboardStatCard label="إجمالي القدامى" value={insights.total ?? "—"} hint="كل المسجّلين عبر Legacy" />
              <DashboardStatCard label="نشط" value={insights.active ?? "—"} hint="حسابات فعّالة" />
              <DashboardStatCard
                label="هوية غير مكتملة"
                value={insights.pendingIdentity ?? "—"}
                hint="ينقص وجه أمامي أو خلفي"
              />
              <DashboardStatCard
                label="باقة مُسندة"
                value={insights.packageAssigned ?? "—"}
                hint="اشتراك حالي نشط"
              />
            </DashboardStatsGrid>
          )
        ) : null}

        <div className="oh-legacy-admin__tabs-card">
          <DashboardTabs aria-label="أقسام مركز الفريلانسر القدامى">
            {CENTER_TABS.map((t) => (
              <DashboardTab key={t.id} selected={activeTab === t.id} onSelect={() => setActiveTab(t.id)}>
                {t.label}
              </DashboardTab>
            ))}
          </DashboardTabs>
        </div>

        {activeTab === "freelancers" ? (
          <LegacyFreelancersPanel
            createSignal={createSignal}
            onListChanged={loadInsights}
          />
        ) : null}

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
      </div>
    </DashboardShell>
  );
}
