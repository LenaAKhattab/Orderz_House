import { useCallback, useEffect, useState } from "react";
import { Users, UserCheck, IdCard, Package } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import { superAdminBreadcrumbs } from "../../components/dashboard/dashboardBreadcrumbs";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
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

function InsightCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <article className="oh-legacy-admin__stat">
      <div className={`oh-legacy-admin__stat-icon${tone !== "default" ? ` oh-legacy-admin__stat-icon--${tone}` : ""}`} aria-hidden>
        {Icon ? <Icon size={14} strokeWidth={2.25} /> : null}
      </div>
      <div className="oh-legacy-admin__stat-body">
        <p className="oh-legacy-admin__stat-label">{label}</p>
        <p className="oh-legacy-admin__stat-value">
          {value == null ? "—" : Number(value).toLocaleString("en-US")}
        </p>
        {hint ? <p className="oh-legacy-admin__stat-hint">{hint}</p> : null}
      </div>
    </article>
  );
}

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
          eyebrow="إدارة النظام"
          title="مركز إدارة الفريلانسر القدامى"
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
          description="إدارة الفريلانسرز القدامى، حملات الدعوة، الأوراق، وإعدادات التسجيل."
          actions={
            activeTab === "freelancers" ? (
              <Button type="button" onClick={() => setCreateSignal((n) => n + 1)}>
                إضافة فريلانسر قديم
              </Button>
            ) : null
          }
        />

        {activeTab === "freelancers" ? (
          <div className="oh-legacy-admin__stats" aria-busy={insightsLoading || undefined}>
            <InsightCard
              label="إجمالي القدامى"
              value={insights.total}
              hint="كل المسجّلين"
              icon={Users}
            />
            <InsightCard
              label="نشط"
              value={insights.active}
              hint="حسابات فعّالة"
              icon={UserCheck}
              tone="success"
            />
            <InsightCard
              label="هوية غير مكتملة"
              value={insights.pendingIdentity}
              hint="ينقص وجه أمامي/خلفي"
              icon={IdCard}
              tone="warning"
            />
            <InsightCard
              label="باقة نشطة"
              value={insights.packageAssigned}
              hint="اشتراك حالي"
              icon={Package}
              tone="info"
            />
          </div>
        ) : null}

        <div className="oh-legacy-admin__tabs">
          <DashboardTabs aria-label="أقسام مركز الفريلانسر القدامى">
            {CENTER_TABS.map((t) => (
              <DashboardTab key={t.id} selected={activeTab === t.id} onSelect={() => setActiveTab(t.id)}>
                {t.label}
              </DashboardTab>
            ))}
          </DashboardTabs>
        </div>

        {activeTab === "freelancers" ? (
          <LegacyFreelancersPanel createSignal={createSignal} onListChanged={loadInsights} />
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
