import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatDate } from "./legacyAdminShared";
import LegacyFreelancersPanel from "./LegacyFreelancersPanel";
import LegacyCampaignLinkModal from "./LegacyCampaignLinkModal";
import "./legacyAdminCenter.css";

const LIST_PATH = "/dashboard/legacy-freelancers";
const WORKSPACE_TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "registrants", label: "المسجلون" },
  { id: "settings", label: "إعدادات الحملة" },
  { id: "documents", label: "الأوراق ومتطلبات التسجيل" },
];

function InsightCard({ label, value, hint, icon: Icon, tone = "default" }) {
  return (
    <article className="oh-legacy-admin__stat">
      <div
        className={`oh-legacy-admin__stat-icon${tone !== "default" ? ` oh-legacy-admin__stat-icon--${tone}` : ""}`}
        aria-hidden
      >
        {Icon ? <Icon size={16} strokeWidth={2.25} /> : null}
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
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canManage = Boolean(hasPermission?.(LEGACY_FREELANCERS_MANAGE_PERMISSION));
  const { pushToast } = useToast();

  const tab = WORKSPACE_TABS.some((t) => t.id === searchParams.get("tab"))
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
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل مساحة الحملة") });
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
    if (campaign.isArchived) return <StatusBadge tone="warning">مؤرشف</StatusBadge>;
    if (campaign.isActive) return <StatusBadge tone="success">نشط</StatusBadge>;
    return <StatusBadge tone="neutral">متوقف</StatusBadge>;
  }, [campaign]);

  const onToggleActive = async () => {
    if (!campaign || busy) return;
    setBusy(true);
    try {
      await updateLegacyFreelancerInviteRequest(campaign.id, { isActive: !campaign.isActive });
      pushToast({ type: "success", message: campaign.isActive ? "تم إيقاف الحملة" : "تم تفعيل الحملة" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر التحديث") });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!campaign || busy) return;
    const ok = window.confirm(
      campaign.usedCount > 0
        ? "سيتم أرشفة الحملة وإيقاف الرابط مع الاحتفاظ بسجلات المسجّلين. المتابعة؟"
        : "حذف الحملة غير المستخدمة نهائياً؟",
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteLegacyFreelancerInviteRequest(campaign.id);
      pushToast({ type: "success", message: res?.message || res?.data?.message || "تم" });
      if (res?.data?.mode === "deleted") {
        navigate(LIST_PATH);
      } else {
        await load();
      }
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر الحذف/الأرشفة") });
    } finally {
      setBusy(false);
    }
  };

  const onRegenerate = async () => {
    if (!campaign || busy) return;
    const ok = window.confirm("إعادة توليد الرمز تُبطل الرابط السابق. المتابعة؟");
    if (!ok) return;
    setBusy(true);
    try {
      await regenerateLegacyFreelancerInviteTokenRequest(campaign.id);
      pushToast({ type: "success", message: "تم إعادة توليد الرمز" });
      await load();
      setLinkOpen(true);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إعادة التوليد") });
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
      pushToast({ type: "success", message: "تم حفظ إعدادات الحملة" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حفظ الإعدادات") });
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
      pushToast({ type: "success", message: "تم حفظ حقول التسجيل" });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حفظ الحقول") });
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
      pushToast({ type: "success", message: "تم حفظ متطلبات الأوراق" });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حفظ الأوراق") });
    } finally {
      setDocsBusy(false);
    }
  };

  if (!canManage) {
    return (
      <DashboardShell>
        <DashboardEmptyState title="غير مصرح" description="تحتاج صلاحية إدارة الفريلانسرز القدامى." />
      </DashboardShell>
    );
  }

  if (loading) {
    return (
      <DashboardShell>
        <DashboardLoadingState label="جاري تحميل مساحة الحملة…" />
      </DashboardShell>
    );
  }

  if (!campaign) {
    return (
      <DashboardShell>
        <DashboardEmptyState
          title="الحملة غير موجودة"
          description="تحقق من المعرف أو ارجع لقائمة الحملات."
          actions={
            <Link to={LIST_PATH} className="dash-ui-btn">
              العودة للحملات
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
          eyebrow="حملات الدعوة"
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
                كل الحملات
              </Button>
              <Button type="button" variant="secondary" onClick={() => setLinkOpen(true)}>
                عرض الرابط
              </Button>
              <Button type="button" variant="secondary" disabled={busy || campaign.isArchived} onClick={onToggleActive}>
                {campaign.isActive ? "إيقاف" : "تفعيل"}
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={onRegenerate}>
                إعادة توليد
              </Button>
              <Button type="button" variant="secondary" disabled={busy} onClick={onDelete}>
                حذف / أرشفة
              </Button>
            </div>
          }
        />

        <div className="oh-legacy-admin__stats oh-legacy-admin__stats--workspace">
          <InsightCard label="زيارات الرابط" value={stats?.linkViews} hint="فتحات ناجحة للمعاينة" icon={Eye} />
          <InsightCard
            label="تسجيلات ناجحة"
            value={stats?.successfulRegistrations}
            hint="مستخدمون فعليون"
            icon={Users}
            tone="info"
          />
          <InsightCard label="مقاعد مستخدمة" value={stats?.usedSeats} icon={Armchair} />
          <InsightCard label="مقاعد متبقية" value={stats?.remainingSeats} icon={ArrowRightLeft} />
          <InsightCard label="مسجّلون نشطون" value={stats?.activeRegistrants} icon={UserCheck} tone="success" />
          <InsightCard
            label="هوية غير مكتملة"
            value={stats?.identityIncompleteCount}
            icon={IdCard}
            tone="warning"
          />
          <InsightCard label="باقات نشطة" value={stats?.packagesAssignedCount} icon={Package} tone="info" />
          <InsightCard
            label="مبالغ تاريخية (JOD)"
            value={stats?.historicalMoneyTotal}
            icon={Coins}
          />
        </div>

        <div className="oh-legacy-admin__tabs">
          <DashboardTabs aria-label="أقسام مساحة الحملة">
            {WORKSPACE_TABS.map((t) => (
              <DashboardTab key={t.id} selected={tab === t.id} onSelect={() => setTab(t.id)}>
                {t.label}
              </DashboardTab>
            ))}
          </DashboardTabs>
        </div>

        {tab === "overview" ? (
          <DashboardSection title="ملخص الحملة">
            <dl className="oh-legacy-campaign-summary">
              <div>
                <dt>الاسم</dt>
                <dd>{campaign.name}</dd>
              </div>
              <div>
                <dt>Slug</dt>
                <dd dir="ltr">{campaign.slug}</dd>
              </div>
              <div>
                <dt>الحالة</dt>
                <dd>{statusBadge}</dd>
              </div>
              <div>
                <dt>المؤسسة</dt>
                <dd>{campaign.institutionName || "بدون مؤسسة"}</dd>
              </div>
              <div>
                <dt>الحد الأقصى للمقاعد</dt>
                <dd>{campaign.maxRedemptions}</dd>
              </div>
              <div>
                <dt>الانتهاء</dt>
                <dd>{formatDate(campaign.expiresAt)}</dd>
              </div>
              <div>
                <dt>تاريخ الإنشاء</dt>
                <dd>{formatDate(campaign.createdAt)}</dd>
              </div>
              <div>
                <dt>أنشئت بواسطة (admin id)</dt>
                <dd>{campaign.createdByAdminId || "—"}</dd>
              </div>
              <div>
                <dt>مستوى الثقة الافتراضي</dt>
                <dd>{campaign.defaultTrustLevel || "—"}</dd>
              </div>
              <div>
                <dt>الباقة الافتراضية</dt>
                <dd>{campaign.defaultPlanCode || "—"}</dd>
              </div>
              <div>
                <dt>ملاحظات</dt>
                <dd>{campaign.notes || "—"}</dd>
              </div>
              <div>
                <dt>استرجاع الرابط</dt>
                <dd>{campaign.hasRecoverableInviteLink ? "متاح" : "يتطلب إعادة توليد"}</dd>
              </div>
            </dl>
            <p className="oh-legacy-admin__muted" style={{ marginTop: "0.75rem" }}>
              زيارات الرابط = إجمالي فتحات المعاينة العامة الناجحة (ليست زواراً فريدين).
            </p>
          </DashboardSection>
        ) : null}

        {tab === "registrants" ? (
          <DashboardSection
            title="مسجّلو هذه الحملة فقط"
            description="المصدر: users.legacy_invite_campaign_id — لا يُخلط مع مسجّلي حملات أخرى."
          >
            <LegacyFreelancersPanel campaignId={campaign.id} hideManualCreate />
          </DashboardSection>
        ) : null}

        {tab === "settings" && settingsForm ? (
          <DashboardSection title="إعدادات الحملة">
            <form className="oh-legacy-campaigns__create" onSubmit={saveSettings}>
              <div className="oh-legacy-campaigns__create-grid">
                <label>
                  الاسم
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
                  المقاعد
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
                  الانتهاء
                  <input
                    className="oh-legacy-admin__input"
                    type="datetime-local"
                    required
                    value={settingsForm.expiresAt}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  />
                </label>
                <label>
                  مستوى الثقة
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
                  التصنيف
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
                  المؤسسة
                  <select
                    className="oh-legacy-admin__select"
                    value={settingsForm.institutionId}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, institutionId: e.target.value }))}
                  >
                    <option value="">بدون مؤسسة</option>
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
                  نشطة
                </label>
                <label className="oh-legacy-admin__check">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.requireIdFront)}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, requireIdFront: e.target.checked }))}
                  />
                  هوية أمامية مطلوبة
                </label>
                <label className="oh-legacy-admin__check">
                  <input
                    type="checkbox"
                    checked={Boolean(settingsForm.requireIdBack)}
                    onChange={(e) => setSettingsForm((f) => ({ ...f, requireIdBack: e.target.checked }))}
                  />
                  هوية خلفية مطلوبة
                </label>
              </div>
              <label style={{ display: "block", marginTop: "0.75rem" }}>
                ملاحظات
                <textarea
                  className="oh-legacy-admin__input"
                  rows={3}
                  value={settingsForm.notes}
                  onChange={(e) => setSettingsForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <div className="oh-legacy-admin__actions" style={{ marginTop: "0.85rem" }}>
                <Button type="submit" disabled={busy}>
                  {busy ? "جاري الحفظ…" : "حفظ الإعدادات"}
                </Button>
              </div>
            </form>

            <div style={{ marginTop: "1.25rem" }}>
              <h4 className="oh-legacy-campaign-card__title">حقول التسجيل</h4>
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
                      pushToast({ type: "success", message: "تمت استعادة الافتراضي" });
                    } catch (err) {
                      pushToast({
                        type: "error",
                        message: getSafeApiErrorMessage(err, "تعذر الاستعادة"),
                      });
                    } finally {
                      setFieldsBusy(false);
                    }
                  }}
                >
                  استعادة الافتراضي
                </Button>
                <Button type="button" disabled={fieldsBusy} onClick={saveFields}>
                  حفظ الحقول
                </Button>
              </div>
              {(fieldConfig?.fields || []).map((f) => (
                <div key={f.fieldKey} className="oh-legacy-admin__field-row">
                  <strong>{f.labelAr}</strong>
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
                    إظهار
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
                    إلزامي
                  </label>
                </div>
              ))}
            </div>
          </DashboardSection>
        ) : null}

        {tab === "documents" ? (
          <DashboardSection
            title="أوراق يجب على الإدارة التحقق منها"
            description="قائمة تحقق إدارية لهذه الحملة. لا تُطلب من الفريلانسر أثناء التسجيل العام."
            actions={
              <Button type="button" disabled={docsBusy} onClick={saveDocs}>
                {docsBusy ? "جاري الحفظ…" : "حفظ المتطلبات"}
              </Button>
            }
          >
            {docReqs.length === 0 ? (
              <DashboardEmptyState title="لا متطلبات" description="لا توجد أنواع أوراق مربوطة بعد." />
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
                      مفعّل في قائمة التحقق
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
                      يجب على الإدارة التحقق
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
