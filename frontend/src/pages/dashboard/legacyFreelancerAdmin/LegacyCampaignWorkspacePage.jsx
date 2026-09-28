import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Eye,
  Users,
  UserCheck,
  IdCard,
  Package,
  Coins,
  Armchair,
  ArrowRightLeft,
} from "lucide-react";
import DashboardPageHeader from "../../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../../components/dashboard/DashboardShell";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardTabs, { DashboardTab } from "../../../components/dashboard/DashboardTabs";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import Button from "../../../components/ui/Button";
import { superAdminBreadcrumbs } from "../../../components/dashboard/dashboardBreadcrumbs";
import { useAuth } from "../../../context/useAuth";
import { useToast } from "../../../components/ui/toastContext";
import { LEGACY_FREELANCERS_MANAGE_PERMISSION } from "../../../constants/dashboardPermissions";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  getLegacyFreelancerInviteWorkspaceRequest,
  updateLegacyFreelancerInviteRequest,
  deleteLegacyFreelancerInviteRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
  getLegacyFreelancerInviteFieldsRequest,
  putLegacyFreelancerInviteFieldsRequest,
  restoreLegacyFreelancerInviteFieldsRequest,
  getLegacyCampaignDocumentRequirementsRequest,
  putLegacyCampaignDocumentRequirementsRequest,
  getCategoriesRequest,
  adminListInstitutionsRequest,
  listLegacyDocumentTypesRequest,
} from "../../../services/api";
import { formatDate, getWorkspaceTabs } from "./legacyAdminShared";
import LegacyFreelancersPanel from "./LegacyFreelancersPanel";
import LegacyCampaignLinkModal from "./LegacyCampaignLinkModal";
import "./legacyAdminCenter.css";

const LIST_PATH = "/dashboard/legacy-freelancers";

function InsightCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <article className="oh-legacy-admin__stat">
      <div
        className={`oh-legacy-admin__stat-icon${tone !== "default" ? ` oh-legacy-admin__stat-icon--${tone}` : ""}`}
        aria-hidden
      >
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

function toLocalDatetimeValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function LegacyCampaignWorkspacePage() {
  const { t } = useTranslation();
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = Boolean(hasPermission?.(LEGACY_FREELANCERS_MANAGE_PERMISSION));
  const { pushToast } = useToast();
  const workspaceTabs = useMemo(() => getWorkspaceTabs(t), [t]);

  const tab = workspaceTabs.some((wt) => wt.id === searchParams.get("tab"))
    ? searchParams.get("tab")
    : "overview";

  const [loading, setLoading] = useState(true);
  const [workspace, setWorkspace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [settingsForm, setSettingsForm] = useState(null);
  const [fieldConfig, setFieldConfig] = useState(null);
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [docReqs, setDocReqs] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [docsBusy, setDocsBusy] = useState(false);

  const campaign = workspace?.campaign || null;
  const stats = workspace?.stats || null;

  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    try {
      const res = await getLegacyFreelancerInviteWorkspaceRequest(campaignId);
      setWorkspace(res?.data || null);
      const c = res?.data?.campaign;
      if (c) {
        setSettingsForm({
          name: c.name || "",
          slug: c.slug || "",
          maxRedemptions: c.maxRedemptions ?? 1,
          expiresAt: toLocalDatetimeValue(c.expiresAt),
          defaultPlanCode: c.defaultPlanCode || "orderzhouse_free",
          defaultTrustLevel: c.defaultTrustLevel || "APPROVED",
          defaultCategoryId: c.defaultCategoryId || "",
          notes: c.notes || "",
          isActive: Boolean(c.isActive),
          requireIdFront: c.requireIdFront !== false,
          requireIdBack: c.requireIdBack !== false,
          institutionId: c.institutionId || "",
        });
      }
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.workspaceLoadFailed")) });
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, pushToast]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  useEffect(() => {
    getCategoriesRequest()
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setCategories([]));
    adminListInstitutionsRequest({ status: "active", limit: 100 })
      .then((res) => setInstitutions(res?.data?.institutions || []))
      .catch(() => setInstitutions([]));
    listLegacyDocumentTypesRequest({ includeInactive: false })
      .then((res) => setDocTypes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setDocTypes([]));
  }, []);

  useEffect(() => {
    if (!campaignId || (tab !== "settings" && tab !== "documents")) return;
    getLegacyFreelancerInviteFieldsRequest(campaignId)
      .then((res) => setFieldConfig(res?.data || null))
      .catch(() => setFieldConfig(null));
    getLegacyCampaignDocumentRequirementsRequest(campaignId)
      .then((res) => setDocReqs(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setDocReqs([]));
  }, [campaignId, tab]);

  const statusBadge = useMemo(() => {
    if (!campaign) return null;
    if (campaign.isArchived) return <StatusBadge tone="warning">{t("legacy.common.archived")}</StatusBadge>;
    if (campaign.isActive) return <StatusBadge tone="success">{t("legacy.center.stats.active")}</StatusBadge>;
    return <StatusBadge tone="neutral">{t("legacy.common.stopped")}</StatusBadge>;
  }, [campaign, t]);

  const onToggleActive = async () => {
    if (!campaign || busy) return;
    setBusy(true);
    try {
      await updateLegacyFreelancerInviteRequest(campaign.id, { isActive: !campaign.isActive });
      pushToast({
        type: "success",
        message: campaign.isActive ? t("legacy.toast.campaignPaused") : t("legacy.toast.campaignActivated"),
      });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.updateFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!campaign || busy) return;
    const ok = window.confirm(
      campaign.usedCount > 0
        ? t("legacy.campaigns.confirmArchiveShort")
        : t("legacy.campaigns.confirmDeleteUnusedShort"),
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteLegacyFreelancerInviteRequest(campaign.id);
      pushToast({ type: "success", message: res?.message || res?.data?.message || t("legacy.common.done") });
      if (res?.data?.mode === "deleted") {
        navigate(LIST_PATH);
      } else {
        await load();
      }
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.deleteArchiveFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const onRegenerate = async () => {
    if (!campaign || busy) return;
    const ok = window.confirm(t("legacy.campaigns.confirmRegenerate"));
    if (!ok) return;
    setBusy(true);
    try {
      await regenerateLegacyFreelancerInviteTokenRequest(campaign.id);
      pushToast({ type: "success", message: t("legacy.toast.regenerateSuccess") });
      await load();
      setLinkOpen(true);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.regenerateFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    if (!campaign || !settingsForm || busy) return;
    setBusy(true);
    try {
      await updateLegacyFreelancerInviteRequest(campaign.id, {
        name: settingsForm.name,
        slug: settingsForm.slug,
        maxRedemptions: Number(settingsForm.maxRedemptions),
        expiresAt: new Date(settingsForm.expiresAt).toISOString(),
        defaultPlanCode: settingsForm.defaultPlanCode,
        defaultTrustLevel: settingsForm.defaultTrustLevel,
        defaultCategoryId: settingsForm.defaultCategoryId
          ? Number(settingsForm.defaultCategoryId)
          : null,
        notes: settingsForm.notes || null,
        isActive: Boolean(settingsForm.isActive),
        requireIdFront: Boolean(settingsForm.requireIdFront),
        requireIdBack: Boolean(settingsForm.requireIdBack),
        institutionId: settingsForm.institutionId ? Number(settingsForm.institutionId) : null,
      });
      pushToast({ type: "success", message: t("legacy.toast.settingsSaved") });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.saveSettingsFailed")) });
    } finally {
      setBusy(false);
    }
  };

  const saveFields = async () => {
    if (!campaignId || !fieldConfig) return;
    setFieldsBusy(true);
    try {
      const payload = (fieldConfig.fields || []).map((f) => ({
        fieldKey: f.fieldKey,
        labelAr: f.labelAr,
        isEnabled: Boolean(f.isEnabled),
        isRequired: Boolean(f.isEnabled) && Boolean(f.isRequired),
        sortOrder: Number(f.sortOrder) || 0,
      }));
      const res = await putLegacyFreelancerInviteFieldsRequest(campaignId, payload);
      setFieldConfig(res?.data || null);
      pushToast({ type: "success", message: t("legacy.toast.registrationFieldsSaved") });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.saveFieldsFailed")) });
    } finally {
      setFieldsBusy(false);
    }
  };

  const saveDocs = async () => {
    if (!campaignId) return;
    setDocsBusy(true);
    try {
      const payload = docReqs.map((r) => ({
        documentTypeId: Number(r.documentTypeId),
        isEnabled: Boolean(r.isEnabled),
        isRequired: Boolean(r.isEnabled) && Boolean(r.isRequired),
        sortOrder: Number(r.sortOrder) || 0,
      }));
      const res = await putLegacyCampaignDocumentRequirementsRequest(campaignId, payload);
      setDocReqs(Array.isArray(res?.data) ? res.data : []);
      pushToast({ type: "success", message: t("legacy.toast.docsRequirementsSaved") });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, t("legacy.toast.saveDocsFailed")) });
    } finally {
      setDocsBusy(false);
    }
  };

  if (!canManage) {
    return (
      <DashboardShell>
        <DashboardEmptyState title={t("legacy.common.unauthorized")} description={t("legacy.center.unauthorizedDesc")} />
      </DashboardShell>
    );
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardLoadingState label={t("legacy.campaigns.workspaceLoading")} />
      </DashboardShell>
    );
  }

  if (!campaign) {
    return (
      <DashboardShell>
        <DashboardEmptyState
          title={t("legacy.campaigns.notFoundTitle")}
          description={t("legacy.campaigns.notFoundDesc")}
          actions={
            <Link to={LIST_PATH} className="dash-ui-btn">
              {t("legacy.common.backToCampaigns")}
            </Link>
          }
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="oh-legacy-admin oh-legacy-campaign-workspace">
        <DashboardPageHeader
          eyebrow={t("legacy.campaigns.eyebrow")}
          title={campaign.name}
          breadcrumbs={superAdminBreadcrumbs("dashboard.breadcrumbs.legacyFreelancerInvites")}
          description={
            <span>
              slug: <bdi dir="ltr">{campaign.slug}</bdi> · {statusBadge}
            </span>
          }
          actions={
            <div className="oh-legacy-admin__actions">
              <Button type="button" variant="secondary" onClick={() => navigate(LIST_PATH)}>
                {t("legacy.common.allCampaigns")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setLinkOpen(true)}>
                {t("legacy.common.viewLink")}
              </Button>
              <Button type="button" variant="secondary" disabled={busy || campaign.isArchived} onClick={onToggleActive}>
                {campaign.isActive ? t("legacy.common.disable") : t("legacy.common.enable")}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={onRegenerate}>
                {t("legacy.common.regenerate")}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={onDelete}>
                {t("legacy.common.deleteArchive")}
              </Button>
            </div>
          }
        />

        <div className="oh-legacy-admin__stats oh-legacy-admin__stats--workspace">
          <InsightCard label={t("legacy.campaigns.cardLinkViews")} value={stats?.linkViews} hint={t("legacy.common.linkViewsHint")} icon={Eye} />
          <InsightCard
            label={t("legacy.campaigns.cardRegistrations")}
            value={stats?.successfulRegistrations}
            hint={t("legacy.common.successfulRegHint")}
            icon={Users}
            tone="info"
          />
          <InsightCard label={t("legacy.common.usedSeats")} value={stats?.usedSeats} icon={Armchair} />
          <InsightCard label={t("legacy.common.remainingSeats")} value={stats?.remainingSeats} icon={ArrowRightLeft} />
          <InsightCard label={t("legacy.common.activeRegistrants")} value={stats?.activeRegistrants} icon={UserCheck} tone="success" />
          <InsightCard
            label={t("legacy.center.stats.pendingIdentity")}
            value={stats?.identityIncompleteCount}
            icon={IdCard}
            tone="warning"
          />
          <InsightCard label={t("legacy.common.activePackages")} value={stats?.packagesAssignedCount} icon={Package} tone="info" />
          <InsightCard
            label={t("legacy.common.historicalMoneyJod")}
            value={stats?.historicalMoneyTotal}
            icon={Coins}
          />
        </div>

        <div className="oh-legacy-admin__tabs">
          <DashboardTabs aria-label={t("legacy.campaigns.workspaceTabsAria")}>
            {workspaceTabs.map((t) => (
              <DashboardTab key={t.id} selected={tab === t.id} onSelect={() => setTab(t.id)}>
                {t.label}
              </DashboardTab>
            ))}
          </DashboardTabs>
        </div>

        {tab === "overview" ? (
          <DashboardSection title={t("legacy.common.campaignSummary")}>
            <dl className="oh-legacy-campaign-summary">
              <div>
                <dt>{t("legacy.common.fullName")}</dt>
                <dd>{campaign.name}</dd>
              </div>
              <div>
                <dt>Slug</dt>
                <dd dir="ltr">{campaign.slug}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.status")}</dt>
                <dd>{statusBadge}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.institution")}</dt>
                <dd>{campaign.institutionName || t("legacy.common.noInstitution")}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.maxSeats")}</dt>
                <dd>{campaign.maxRedemptions}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.expiryLabel")}</dt>
                <dd>{formatDate(campaign.expiresAt)}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.createdAt")}</dt>
                <dd>{formatDate(campaign.createdAt)}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.createdByAdmin")}</dt>
                <dd>{campaign.createdByAdminId || "—"}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.defaultTrust")}</dt>
                <dd>{campaign.defaultTrustLevel || "—"}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.defaultPlanCode")}</dt>
                <dd>{campaign.defaultPlanCode || "—"}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.notes")}</dt>
                <dd>{campaign.notes || "—"}</dd>
              </div>
              <div>
                <dt>{t("legacy.common.linkRecovery")}</dt>
                <dd>{campaign.hasRecoverableInviteLink ? t("legacy.common.available") : t("legacy.common.requiresRegenerate")}</dd>
              </div>
            </dl>
            <p className="oh-legacy-admin__muted" style={{ marginTop: "0.75rem" }}>
              {t("legacy.common.linkViewsFootnote")}
            </p>
          </DashboardSection>
        ) : null}

        {tab === "registrants" ? (
          <DashboardSection
            title={t("legacy.common.campaignRegistrantsOnly")}
            description={t("legacy.common.campaignRegistrantsSource")}
          >
            <LegacyFreelancersPanel campaignId={campaign.id} hideManualCreate />
          </DashboardSection>
        ) : null}

        {tab === "settings" && settingsForm ? (
          <DashboardSection title={t("legacy.common.campaignSettings")}>
            <form className="oh-legacy-campaigns__create" onSubmit={saveSettings}>
              <div className="oh-legacy-campaigns__create-grid">
                <label>
                  {t("legacy.common.name")}
                  <input
                    className="oh-legacy-admin__input"
                    required
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label>
                  Slug
                  <input
                    className="oh-legacy-admin__input"
                    dir="ltr"
                    required
                    value={settingsForm.slug}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, slug: e.target.value }))}
                  />
                </label>
                <label>
                  {t("legacy.common.seats")}
                  <input
                    className="oh-legacy-admin__input"
                    type="number"
                    min={1}
                    required
                    value={settingsForm.maxRedemptions}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                  />
                </label>
                <label>
                  {t("legacy.common.expiry")}
                  <input
                    className="oh-legacy-admin__input"
                    type="datetime-local"
                    required
                    value={settingsForm.expiresAt}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  />
                </label>
                <label>
                  {t("legacy.common.trustLevel")}
                  <select
                    className="oh-legacy-admin__select"
                    value={settingsForm.defaultTrustLevel}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, defaultTrustLevel: e.target.value }))}
                  >
                    <option value="APPROVED">APPROVED</option>
                    <option value="TRUSTED">TRUSTED</option>
                  </select>
                </label>
                <label>
                  {t("legacy.common.category")}
                  <select
                    className="oh-legacy-admin__select"
                    value={settingsForm.defaultCategoryId}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, defaultCategoryId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.nameAr || c.name || c.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("legacy.common.institution")}
                  <select
                    className="oh-legacy-admin__select"
                    value={settingsForm.institutionId}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, institutionId: e.target.value }))}
                  >
                    <option value="">{t("legacy.common.noInstitution")}</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={String(i.id)}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-legacy-admin__check">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.isActive)}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  {t("legacy.common.activeFeminine")}
                </label>
                <label className="oh-legacy-admin__check">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.requireIdFront)}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, requireIdFront: e.target.checked }))}
                  />
                  {t("legacy.common.requireIdFront")}
                </label>
                <label className="oh-legacy-admin__check">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.requireIdBack)}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, requireIdBack: e.target.checked }))}
                  />
                  {t("legacy.common.requireIdBack")}
                </label>
              </div>
              <label style={{ display: "block", marginTop: "0.75rem" }}>
                {t("legacy.common.notes")}
                <textarea
                  className="oh-legacy-admin__input"
                  rows={3}
                  value={settingsForm.notes}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="oh-legacy-admin__actions" style={{ marginTop: "0.85rem" }}>
                <Button type="submit" disabled={busy}>
                  {busy ? t("legacy.common.saving") : t("legacy.common.saveSettings")}
                </Button>
              </div>
            </form>

            <div style={{ marginTop: "1.25rem" }}>
              <h4 className="oh-legacy-campaign-card__title">{t("legacy.campaigns.registrationFieldsCaption")}</h4>
              <div className="oh-legacy-admin__actions" style={{ marginBottom: "0.5rem" }}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={fieldsBusy}
                  onClick={async () => {
                    setFieldsBusy(true);
                    try {
                      const res = await restoreLegacyFreelancerInviteFieldsRequest(campaignId);
                      setFieldConfig(res?.data || null);
                      pushToast({ type: "success", message: t("legacy.toast.restoreSuccess") });
                    } catch (err) {
                      pushToast({
                        type: "error",
                        message: getSafeApiErrorMessage(err, t("legacy.toast.restoreFailed")),
                      });
                    } finally {
                      setFieldsBusy(false);
                    }
                  }}
                >
                  {t("legacy.common.restoreDefault")}
                </Button>
                <Button type="button" disabled={fieldsBusy} onClick={saveFields}>
                  {t("legacy.common.saveFields")}
                </Button>
              </div>
              {(fieldConfig?.fields || []).map((f) => (
                <div key={f.fieldKey} className="oh-legacy-admin__field-row">
                  <strong>
                    {f.labelAr}
                    <span className="oh-legacy-admin__muted" style={{ display: "block", fontWeight: 400 }} dir="ltr">
                      {f.fieldKey} · {f.type}
                      {f.controlLocked ? ` · ${t("legacy.common.fixed")}` : ""}
                    </span>
                  </strong>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(f.isEnabled)}
                      onChange={(e) =>
                        setFieldConfig((prev) => ({
                          ...prev,
                          fields: prev.fields.map((x) =>
                            x.fieldKey === f.fieldKey ? { ...x, isEnabled: e.target.checked } : x,
                          ),
                        }))
                      }
                    />{" "}
                    {t("legacy.common.show")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={Boolean(f.isRequired)}
                      disabled={!f.isEnabled}
                      onChange={(e) =>
                        setFieldConfig((prev) => ({
                          ...prev,
                          fields: prev.fields.map((x) =>
                            x.fieldKey === f.fieldKey ? { ...x, isRequired: e.target.checked } : x,
                          ),
                        }))
                      }
                    />{" "}
                    {t("legacy.common.required")}
                  </label>
                </div>
              ))}
            </div>
          </DashboardSection>
        ) : null}

        {tab === "documents" ? (
          <DashboardSection
            title={t("legacy.campaigns.docsAdminTitle")}
            description={t("legacy.campaigns.docsAdminDescWorkspace")}
            actions={
              <Button type="button" disabled={docsBusy} onClick={saveDocs}>
                {docsBusy ? t("legacy.common.saving") : t("legacy.common.saveRequirements")}
              </Button>
            }
          >
            {docReqs.length === 0 ? (
              <DashboardEmptyState title={t("legacy.campaigns.noRequirements")} description={t("legacy.campaigns.noRequirementsDesc")} />
            ) : (
              <ul className="oh-legacy-admin__doc-list">
                {docReqs.map((r) => (
                  <li key={r.documentTypeId} className="oh-legacy-admin__field-row">
                    <strong>{r.labelAr || docTypes.find((t) => String(t.id) === String(r.documentTypeId))?.labelAr}</strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(r.isEnabled)}
                        onChange={(e) =>
                          setDocReqs((prev) =>
                            prev.map((x) =>
                              String(x.documentTypeId) === String(r.documentTypeId)
                                ? { ...x, isEnabled: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />{" "}
                      {t("legacy.common.enabledInChecklist")}
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(r.isRequired)}
                        disabled={!r.isEnabled}
                        onChange={(e) =>
                          setDocReqs((prev) =>
                            prev.map((x) =>
                              String(x.documentTypeId) === String(r.documentTypeId)
                                ? { ...x, isRequired: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />{" "}
                      {t("legacy.common.adminMustVerify")}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </DashboardSection>
        ) : null}
      </div>

      {linkOpen ? (
        <LegacyCampaignLinkModal
          campaign={campaign}
          onClose={() => setLinkOpen(false)}
          onRegenerated={() => load()}
        />
      ) : null}
    </DashboardShell>
  );
}
