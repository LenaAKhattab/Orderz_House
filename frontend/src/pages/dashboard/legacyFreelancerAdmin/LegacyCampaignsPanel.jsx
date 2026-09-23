import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createLegacyFreelancerInviteRequest,
  listLegacyFreelancerInvitesRequest,
  updateLegacyFreelancerInviteRequest,
  deleteLegacyFreelancerInviteRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
  getCategoriesRequest,
  getLegacyFreelancerInviteFieldsRequest,
  putLegacyFreelancerInviteFieldsRequest,
  restoreLegacyFreelancerInviteFieldsRequest,
  adminListInstitutionsRequest,
} from "../../../services/api";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import { formatDate } from "./legacyAdminShared";
import LegacyCampaignLinkModal from "./LegacyCampaignLinkModal";

function defaultExpiresAt() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const EMPTY_FORM = {
  name: "",
  slug: "",
  maxRedemptions: 100,
  expiresAt: defaultExpiresAt(),
  defaultPlanCode: "orderzhouse_free",
  defaultTrustLevel: "APPROVED",
  defaultCategoryId: "",
  notes: "",
  isActive: true,
  institutionId: "",
};

const CAMPAIGN_STATUS = {
  active: { label: "نشط", tone: "success" },
  inactive: { label: "متوقف", tone: "neutral" },
  archived: { label: "مؤرشف", tone: "warning" },
};

function campaignStatus(row) {
  if (row?.isArchived || row?.archivedAt) return CAMPAIGN_STATUS.archived;
  if (row?.isActive) return CAMPAIGN_STATUS.active;
  return CAMPAIGN_STATUS.inactive;
}

/**
 * @param {{ selectedCampaignId: string|null, onSelectedCampaignIdChange: (id: string|null) => void, showFieldConfig?: boolean, embedMode?: boolean }} props
 */
export default function LegacyCampaignsPanel({
  selectedCampaignId,
  onSelectedCampaignIdChange,
  showFieldConfig = true,
  embedMode = false,
}) {
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [categories, setCategories] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [linkModalCampaign, setLinkModalCampaign] = useState(null);
  const [fieldConfig, setFieldConfig] = useState(null);
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const selectedId = selectedCampaignId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listLegacyFreelancerInvitesRequest();
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل الحملات") });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    load();
    getCategoriesRequest()
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setCategories([]));
    adminListInstitutionsRequest({ status: "active", limit: 100 })
      .then((res) => setInstitutions(res?.data?.institutions || []))
      .catch(() => setInstitutions([]));
  }, [load]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const loadFields = useCallback(
    async (campaignId) => {
      if (!campaignId) {
        setFieldConfig(null);
        return;
      }
      try {
        const res = await getLegacyFreelancerInviteFieldsRequest(campaignId);
        setFieldConfig(res?.data || null);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل حقول التسجيل") });
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (selectedId && showFieldConfig && embedMode) loadFields(selectedId);
  }, [selectedId, loadFields, showFieldConfig, embedMode]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "active" && !r.isActive) return false;
      if (statusFilter === "inactive" && (r.isActive || r.isArchived)) return false;
      if (statusFilter === "archived" && !r.isArchived && !r.archivedAt) return false;
      if (institutionFilter === "none" && r.institutionId) return false;
      if (institutionFilter && institutionFilter !== "none" && String(r.institutionId) !== institutionFilter) {
        return false;
      }
      if (!q) return true;
      const hay = `${r.name || ""} ${r.slug || ""} ${r.institutionName || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, statusFilter, institutionFilter]);

  const resolveInstitutionLabel = (row) => {
    if (row?.institutionName) return row.institutionName;
    if (row?.institutionId) {
      const hit = institutions.find((i) => String(i.id) === String(row.institutionId));
      return hit?.name || `#${row.institutionId}`;
    }
    return "بدون مؤسسة";
  };

  const openManage = (row) => {
    onSelectedCampaignIdChange?.(String(row.id));
    navigate(`/dashboard/legacy-freelancers/campaigns/${encodeURIComponent(row.id)}`);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await createLegacyFreelancerInviteRequest({
        name: form.name,
        slug: form.slug || undefined,
        maxRedemptions: Number(form.maxRedemptions),
        expiresAt: new Date(form.expiresAt).toISOString(),
        defaultPlanCode: form.defaultPlanCode,
        defaultTrustLevel: form.defaultTrustLevel,
        defaultCategoryId: form.defaultCategoryId ? Number(form.defaultCategoryId) : null,
        notes: form.notes || null,
        isActive: Boolean(form.isActive),
        institutionId: form.institutionId ? Number(form.institutionId) : null,
      });
      const created = res?.data;
      setForm(EMPTY_FORM);
      setShowCreate(false);
      pushToast({ type: "success", message: "تم إنشاء رابط الدعوة المشترك" });
      await load();
      if (created?.id) {
        onSelectedCampaignIdChange?.(String(created.id));
        if (created.joinUrl) {
          setLinkModalCampaign(created);
        }
      }
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إنشاء الحملة") });
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = async (row, e) => {
    e?.stopPropagation?.();
    if (row.isArchived) return;
    setBusyId(row.id);
    try {
      await updateLegacyFreelancerInviteRequest(row.id, { isActive: !row.isActive });
      pushToast({ type: "success", message: row.isActive ? "تم إيقاف الحملة" : "تم تفعيل الحملة" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر التحديث") });
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row, e) => {
    e?.stopPropagation?.();
    const ok = window.confirm(
      row.usedCount > 0
        ? `الحملة «${row.name}» تحتوي مسجّلين. سيتم أرشفتها وإيقاف الرابط مع الاحتفاظ بالسجلات. هل تريد المتابعة؟`
        : `حذف الحملة «${row.name}» نهائياً؟ هذا الإجراء للحملات غير المستخدمة فقط.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await deleteLegacyFreelancerInviteRequest(row.id);
      pushToast({ type: "success", message: res?.message || res?.data?.message || "تم تنفيذ الإجراء" });
      if (selectedId === String(row.id)) onSelectedCampaignIdChange?.(null);
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حذف/أرشفة الحملة") });
    } finally {
      setBusyId(null);
    }
  };

  const onRegenerate = async (row, e) => {
    e?.stopPropagation?.();
    const ok = window.confirm("إعادة توليد الرمز تُبطل الرابط السابق. المتابعة؟");
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await regenerateLegacyFreelancerInviteTokenRequest(row.id);
      pushToast({ type: "success", message: "تم إعادة توليد الرمز" });
      await load();
      if (res?.data) setLinkModalCampaign(res.data);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إعادة التوليد") });
    } finally {
      setBusyId(null);
    }
  };

  const updateFieldLocal = (fieldKey, patch) => {
    setFieldConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: (prev.fields || []).map((f) => (f.fieldKey === fieldKey ? { ...f, ...patch } : f)),
      };
    });
  };

  const saveFields = async () => {
    if (!selectedId || !fieldConfig) return;
    setFieldsBusy(true);
    try {
      const payload = (fieldConfig.fields || []).map((f) => ({
        fieldKey: f.fieldKey,
        labelAr: f.labelAr,
        isEnabled: Boolean(f.isEnabled),
        isRequired: Boolean(f.isEnabled) && Boolean(f.isRequired),
        sortOrder: Number(f.sortOrder) || 0,
      }));
      const res = await putLegacyFreelancerInviteFieldsRequest(selectedId, payload);
      setFieldConfig(res?.data || null);
      pushToast({ type: "success", message: "تم حفظ بيانات التسجيل المطلوبة" });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حفظ الحقول") });
    } finally {
      setFieldsBusy(false);
    }
  };

  const restoreFields = async () => {
    if (!selectedId) return;
    setFieldsBusy(true);
    try {
      const res = await restoreLegacyFreelancerInviteFieldsRequest(selectedId);
      setFieldConfig(res?.data || null);
      pushToast({ type: "success", message: "تمت استعادة الإعداد الافتراضي" });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر الاستعادة") });
    } finally {
      setFieldsBusy(false);
    }
  };

  if (loading) return <DashboardLoadingState label="جاري تحميل الحملات…" />;

  // Embed mode: registration field config for a selected campaign (top-level tab).
  if (embedMode) {
    return (
      <div className="oh-legacy-admin__stack">
        <DashboardSection title="اختر حملة" description="إعداد حقول التسجيل مرتبط بحملة واحدة.">
          <select
            className="oh-legacy-admin__select"
            value={selectedId || ""}
            onChange={(e) => onSelectedCampaignIdChange?.(e.target.value || null)}
          >
            <option value="">— اختر حملة —</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.slug})
              </option>
            ))}
          </select>
        </DashboardSection>
        {selected && showFieldConfig ? (
          <DashboardSection
            title={`بيانات التسجيل — ${selected.name}`}
            actions={
              <div className="oh-legacy-admin__actions">
                <Button type="button" variant="secondary" disabled={fieldsBusy} onClick={restoreFields}>
                  استعادة الافتراضي
                </Button>
                <Button type="button" disabled={fieldsBusy} onClick={saveFields}>
                  {fieldsBusy ? "جاري الحفظ…" : "حفظ الحقول"}
                </Button>
              </div>
            }
          >
            {fieldConfig?.fields?.length ? (
              <div className="oh-sa-users-table-wrap">
                <DashboardTable caption="حقول التسجيل">
                  <thead>
                    <tr>
                      <th scope="col">الحقل</th>
                      <th scope="col">إظهار</th>
                      <th scope="col">إلزامي</th>
                      <th scope="col">الترتيب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fieldConfig.fields.map((f) => (
                      <tr key={f.fieldKey}>
                        <td>
                          <strong>{f.labelAr}</strong>
                          <div dir="ltr" className="oh-legacy-admin__muted">
                            {f.fieldKey}
                          </div>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(f.isEnabled)}
                            onChange={(e) => updateFieldLocal(f.fieldKey, { isEnabled: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={Boolean(f.isRequired)}
                            disabled={!f.isEnabled}
                            onChange={(e) => updateFieldLocal(f.fieldKey, { isRequired: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            className="oh-legacy-admin__input"
                            style={{ width: 72 }}
                            value={f.sortOrder ?? 0}
                            onChange={(e) =>
                              updateFieldLocal(f.fieldKey, { sortOrder: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DashboardTable>
              </div>
            ) : (
              <DashboardEmptyState title="لا توجد حقول" description="اختر حملة أو أنشئ حملة أولاً." />
            )}
          </DashboardSection>
        ) : null}
      </div>
    );
  }

  return (
    <div className="oh-legacy-admin__stack">
      <DashboardSection
        title="حملات الدعوة"
        description="كل حملة لها مساحة إدارة مستقلة للمسجّلين والإعدادات. المسجّلون عبر رابط مشترك يُدارون داخل حملتهم فقط."
        actions={
          <Button type="button" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "إخفاء النموذج" : "إنشاء حملة"}
          </Button>
        }
      >
        <div className="oh-legacy-campaigns__toolbar">
          <input
            className="oh-legacy-admin__input"
            placeholder="بحث بالاسم أو الـ slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="oh-legacy-admin__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">متوقف</option>
            <option value="archived">مؤرشف</option>
          </select>
          <select
            className="oh-legacy-admin__select"
            value={institutionFilter}
            onChange={(e) => setInstitutionFilter(e.target.value)}
          >
            <option value="">كل المؤسسات</option>
            <option value="none">بدون مؤسسة</option>
            {institutions.map((i) => (
              <option key={i.id} value={String(i.id)}>
                {i.name}
              </option>
            ))}
          </select>
        </div>

        {showCreate ? (
          <form className="oh-legacy-campaigns__create" onSubmit={onCreate}>
            <div className="oh-legacy-campaigns__create-grid">
              <label>
                اسم الحملة
                <input
                  className="oh-legacy-admin__input"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Slug
                <input
                  className="oh-legacy-admin__input"
                  dir="ltr"
                  placeholder="auto من الاسم"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                />
              </label>
              <label>
                المقاعد
                <input
                  className="oh-legacy-admin__input"
                  type="number"
                  min={1}
                  required
                  value={form.maxRedemptions}
                  onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
                />
              </label>
              <label>
                الانتهاء
                <input
                  className="oh-legacy-admin__input"
                  type="datetime-local"
                  required
                  value={form.expiresAt}
                  onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
                />
              </label>
              <label>
                مستوى الثقة
                <select
                  className="oh-legacy-admin__select"
                  value={form.defaultTrustLevel}
                  onChange={(e) => setForm((f) => ({ ...f, defaultTrustLevel: e.target.value }))}
                >
                  <option value="APPROVED">APPROVED</option>
                  <option value="TRUSTED">TRUSTED</option>
                </select>
              </label>
              <label>
                التصنيف الافتراضي
                <select
                  className="oh-legacy-admin__select"
                  value={form.defaultCategoryId}
                  onChange={(e) => setForm((f) => ({ ...f, defaultCategoryId: e.target.value }))}
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
                  value={form.institutionId}
                  onChange={(e) => setForm((f) => ({ ...f, institutionId: e.target.value }))}
                >
                  <option value="">بدون مؤسسة</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={String(i.id)}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="oh-legacy-admin__actions" style={{ marginTop: "0.75rem" }}>
              <Button type="submit" disabled={creating}>
                {creating ? "جاري الإنشاء…" : "إنشاء الحملة"}
              </Button>
            </div>
          </form>
        ) : null}

        {filteredRows.length === 0 ? (
          <DashboardEmptyState
            title="لا توجد حملات"
            description={rows.length ? "لا نتائج مطابقة للفلاتر." : "أنشئ أول حملة دعوة مشتركة."}
          />
        ) : (
          <div className="oh-legacy-campaigns__grid">
            {filteredRows.map((row) => {
              const st = campaignStatus(row);
              const busy = busyId === row.id;
              return (
                <article
                  key={row.id}
                  className={`oh-legacy-campaign-card${selectedId === String(row.id) ? " is-selected" : ""}`}
                  onClick={() => openManage(row)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openManage(row);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <header className="oh-legacy-campaign-card__head">
                    <div>
                      <h3 className="oh-legacy-campaign-card__title">{row.name}</h3>
                      <p className="oh-legacy-campaign-card__slug" dir="ltr">
                        {row.slug}
                      </p>
                    </div>
                    <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  </header>

                  <dl className="oh-legacy-campaign-card__meta">
                    <div>
                      <dt>المؤسسة</dt>
                      <dd>{resolveInstitutionLabel(row)}</dd>
                    </div>
                    <div>
                      <dt>المقاعد</dt>
                      <dd>
                        {row.usedCount ?? 0} / {row.maxRedemptions ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>الانتهاء</dt>
                      <dd>{formatDate(row.expiresAt)}</dd>
                    </div>
                    <div>
                      <dt>زيارات الرابط</dt>
                      <dd>{Number(row.linkViewCount || 0).toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt>تسجيلات ناجحة</dt>
                      <dd>{Number(row.usedCount || 0).toLocaleString("en-US")}</dd>
                    </div>
                  </dl>

                  <div
                    className="oh-legacy-campaign-card__actions"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Button type="button" onClick={() => openManage(row)}>
                      إدارة
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setLinkModalCampaign(row)}
                    >
                      عرض الرابط
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || row.isArchived}
                      onClick={(e) => onToggleActive(row, e)}
                    >
                      {row.isActive ? "إيقاف" : "تفعيل"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={(e) => onRegenerate(row, e)}
                    >
                      إعادة توليد
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={(e) => onDelete(row, e)}
                      aria-label="حذف أو أرشفة"
                    >
                      حذف
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DashboardSection>

      {linkModalCampaign ? (
        <LegacyCampaignLinkModal
          campaign={linkModalCampaign}
          onClose={() => setLinkModalCampaign(null)}
          onRegenerated={() => load()}
        />
      ) : null}
    </div>
  );
}
