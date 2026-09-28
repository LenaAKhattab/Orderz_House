import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useTranslation } from "../../i18n/LanguageProvider";
import LegacyCampaignsPanel from "./legacyFreelancerAdmin/LegacyCampaignsPanel";
import LegacyFreelancersPanel from "./legacyFreelancerAdmin/LegacyFreelancersPanel";
import LegacyDocumentsPanel from "./legacyFreelancerAdmin/LegacyDocumentsPanel";
import { getCenterTabs } from "./legacyFreelancerAdmin/legacyAdminShared";
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
  const { t } = useTranslation();
  const centerTabs = useMemo(() => getCenterTabs(t), [t]);
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
          title={t("legacy.common.unauthorized")}
          description={t("legacy.center.unauthorizedDesc")}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="oh-legacy-admin">
        <DashboardPageHeader
          eyebrow={t("legacy.common.systemManagement")}
          title={t("legacy.center.title")}
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
          description={t("legacy.center.description")}
          actions={
            activeTab === "freelancers" ? (
              <Button type="button" onClick={() => setCreateSignal((n) => n + 1)}>
                {t("legacy.common.addLegacyFreelancer")}
              </Button>
            ) : null
          }
        />

        {activeTab === "freelancers" ? (
          <div className="oh-legacy-admin__stats" aria-busy={insightsLoading || undefined}>
            <InsightCard
              label={t("legacy.center.stats.total")}
              value={insights.total}
              hint={t("legacy.center.stats.totalHint")}
              icon={Users}
            />
            <InsightCard
              label={t("legacy.center.stats.active")}
              value={insights.active}
              hint={t("legacy.center.stats.activeHint")}
              icon={UserCheck}
              tone="success"
            />
            <InsightCard
              label={t("legacy.center.stats.pendingIdentity")}
              value={insights.pendingIdentity}
              hint={t("legacy.center.stats.pendingIdentityHint")}
              icon={IdCard}
              tone="warning"
            />
            <InsightCard
              label={t("legacy.center.stats.activePackage")}
              value={insights.packageAssigned}
              hint={t("legacy.center.stats.activePackageHint")}
              icon={Package}
              tone="info"
            />
          </div>
        ) : null}

        <div className="oh-legacy-admin__tabs">
          <DashboardTabs aria-label={t("legacy.center.tabsAria")}>
            {centerTabs.map((tab) => (
              <DashboardTab key={tab.id} selected={activeTab === tab.id} onSelect={() => setActiveTab(tab.id)}>
                {tab.label}
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
