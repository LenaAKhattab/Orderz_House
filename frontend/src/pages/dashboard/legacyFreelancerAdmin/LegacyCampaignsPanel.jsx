import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createLegacyFreelancerInviteRequest,
  listLegacyFreelancerInvitesRequest,
  listLegacyFreelancerInviteRedemptionsRequest,
  revokeLegacyFreelancerInviteRequest,
  regenerateLegacyFreelancerInviteTokenRequest,
  updateLegacyFreelancerInviteRequest,
  getCategoriesRequest,
  getLegacyFreelancerInviteFieldsRequest,
  putLegacyFreelancerInviteFieldsRequest,
  restoreLegacyFreelancerInviteFieldsRequest,
  getLegacyFreelancerInviteAnswersRequest,
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

/**
 * @param {{ selectedCampaignId: string|null, onSelectedCampaignIdChange: (id: string|null) => void, showFieldConfig?: boolean, embedMode?: boolean }} props
 */
export default function LegacyCampaignsPanel({
  selectedCampaignId,
  onSelectedCampaignIdChange,
  showFieldConfig = true,
  embedMode = false,
}) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lastCreatedLink, setLastCreatedLink] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [fieldConfig, setFieldConfig] = useState(null);
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [answersModal, setAnswersModal] = useState(null);
  const [answersLoading, setAnswersLoading] = useState(false);
  const [institutions, setInstitutions] = useState([]);
  const [campaignInstitutionId, setCampaignInstitutionId] = useState("");

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

  useEffect(() => {
    if (!selected) {
      setCampaignInstitutionId("");
      return;
    }
    const iid = selected.institutionId ?? selected.institution?.id ?? "";
    setCampaignInstitutionId(iid ? String(iid) : "");
  }, [selected]);

  const loadRedemptions = useCallback(
    async (campaignId) => {
      if (!campaignId) {
        setRedemptions([]);
        return;
      }
      try {
        const res = await listLegacyFreelancerInviteRedemptionsRequest(campaignId);
        setRedemptions(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل المسجلين") });
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (selectedId) loadRedemptions(selectedId);
  }, [selectedId, loadRedemptions]);

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
    if (selectedId && showFieldConfig) loadFields(selectedId);
  }, [selectedId, loadFields, showFieldConfig]);

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

  const openAnswers = async (userId) => {
    if (!selectedId || !userId) return;
    setAnswersLoading(true);
    setAnswersModal(null);
    try {
      const res = await getLegacyFreelancerInviteAnswersRequest(selectedId, userId);
      setAnswersModal(res?.data || null);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل بيانات التسجيل") });
    } finally {
      setAnswersLoading(false);
    }
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
      setLastCreatedLink(created?.joinUrl || null);
      setForm(EMPTY_FORM);
      pushToast({ type: "success", message: "تم إنشاء رابط الدعوة المشترك" });
      await load();
      if (created?.id) onSelectedCampaignIdChange(String(created.id));
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إنشاء الحملة") });
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      pushToast({ type: "success", message: "تم نسخ الرابط" });
    } catch {
      pushToast({ type: "error", message: "تعذر النسخ — انسخ الرابط يدوياً" });
    }
  };

  const onRevoke = async (id) => {
    setBusyId(id);
    try {
      await revokeLegacyFreelancerInviteRequest(id);
      pushToast({ type: "success", message: "تم إيقاف الرابط" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إيقاف الرابط") });
    } finally {
      setBusyId(null);
    }
  };

  const onRegenerate = async (id) => {
    setBusyId(id);
    try {
      const res = await regenerateLegacyFreelancerInviteTokenRequest(id);
      setLastCreatedLink(res?.data?.joinUrl || null);
      pushToast({ type: "success", message: "تم إعادة توليد الرمز — الرابط السابق باطل" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إعادة التوليد") });
    } finally {
      setBusyId(null);
    }
  };

  const institutionNameById = useMemo(() => {
    const map = new Map();
    institutions.forEach((i) => map.set(String(i.id), i.name || `#${i.id}`));
    return map;
  }, [institutions]);

  const resolveCampaignInstitutionLabel = (row) => {
    if (row?.institutionName) return row.institutionName;
    if (row?.institution?.name) return row.institution.name;
    const iid = row?.institutionId ?? row?.institution?.id;
    if (iid) return institutionNameById.get(String(iid)) || `#${iid}`;
    return "بدون مؤسسة";
  };

  const saveCampaignInstitution = async () => {
    if (!selectedId) return;
    setBusyId(selectedId);
    try {
      await updateLegacyFreelancerInviteRequest(selectedId, {
        institutionId: campaignInstitutionId ? Number(campaignInstitutionId) : null,
      });
      pushToast({ type: "success", message: "تم تحديث ربط المؤسسة" });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحديث المؤسسة") });
    } finally {
      setBusyId(null);
    }
  };

  const onToggleActive = async (row) => {
    setBusyId(row.id);
    try {
      await updateLegacyFreelancerInviteRequest(row.id, { isActive: !row.isActive });
      await load();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر التحديث") });
    } finally {
      setBusyId(null);
    }
  };

  function renderFieldConfig() {
    return (
      <DashboardSection
        title={`بيانات التسجيل المطلوبة — ${selected.name}`}
        description="حدد البيانات التي يجب على الفريلانسر تعبئتها عند التسجيل من خلال رابط هذه الحملة."
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
        {fieldConfig?.systemAccountFields?.length ? (
          <div className="oh-legacy-admin__notice oh-legacy-admin__notice--info" style={{ marginBottom: "1rem" }}>
            <strong>حقول أساسية للنظام (لا يمكن تعطيلها)</strong>
            <ul style={{ margin: "0.5rem 0 0", paddingInlineStart: "1.25rem" }}>
              {fieldConfig.systemAccountFields.map((f) => (
                <li key={f.key}>
                  {f.labelAr} — {f.labelNote || "حقل أساسي للنظام"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {fieldConfig?.fields?.length ? (
          <div className="oh-sa-users-table-wrap">
            <DashboardTable caption="حقول التسجيل">
              <thead>
                <tr>
                  <th scope="col">السؤال / الحقل</th>
                  <th scope="col">إظهار</th>
                  <th scope="col">إلزامي</th>
                  <th scope="col">الترتيب</th>
                  <th scope="col">تعديل النص</th>
                </tr>
              </thead>
              <tbody>
                {fieldConfig.fields.map((f) => (
                  <tr key={f.fieldKey}>
                    <td>
                      <div className="oh-sa-users-user">
                        <strong>{f.labelAr}</strong>
                        <span dir="ltr">
                          {f.fieldKey}
                          {f.conditional ? ` · شرط: ${f.conditional.fieldKey}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={Boolean(f.isEnabled)}
                        onChange={(e) =>
                          updateFieldLocal(f.fieldKey, {
                            isEnabled: e.target.checked,
                            isRequired: e.target.checked ? f.isRequired : false,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!f.isEnabled}
                        checked={Boolean(f.isRequired)}
                        onChange={(e) => updateFieldLocal(f.fieldKey, { isRequired: e.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="oh-sa-users-field"
                        style={{ width: "5rem", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(91,102,132,0.22)" }}
                        value={f.sortOrder}
                        onChange={(e) => updateFieldLocal(f.fieldKey, { sortOrder: Number(e.target.value) || 0 })}
                      />
                    </td>
                    <td>
                      <input
                        style={{ width: "100%", minWidth: "10rem", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(91,102,132,0.22)" }}
                        value={f.labelAr}
                        onChange={(e) => updateFieldLocal(f.fieldKey, { labelAr: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
          </div>
        ) : (
          <DashboardEmptyState title="لا توجد حقول بعد" description="اضغط استعادة الافتراضي لتهيئة الكتالوج." />
        )}
      </DashboardSection>
    );
  }

  if (embedMode) {
    return (
      <>
        <DashboardSection
          title="إعدادات التسجيل"
          description="إعدادات حقول التسجيل مرتبطة بحملة الدعوة. اختر حملة ثم عدّل الحقول المطلوبة."
        >
          <label className="oh-sa-users-field" style={{ maxWidth: "28rem" }}>
            <span>الحملة</span>
            <select
              value={selectedId || ""}
              onChange={(e) => onSelectedCampaignIdChange(e.target.value || null)}
            >
              <option value="">— اختر حملة —</option>
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.slug})
                </option>
              ))}
            </select>
          </label>
        </DashboardSection>
        {selected && showFieldConfig ? renderFieldConfig() : null}
      </>
    );
  }

  return (
    <>
      {lastCreatedLink ? (
        <DashboardSection title="الرابط المشترك" description="احفظ هذا الرابط الآن — الرمز يظهر مرة واحدة فقط بعد الإنشاء أو إعادة التوليد.">
          <div className="oh-legacy-admin__link-box">
            <input readOnly value={lastCreatedLink} dir="ltr" aria-label="رابط الدعوة" />
            <Button type="button" onClick={() => copyLink(lastCreatedLink)}>
              نسخ الرابط
            </Button>
          </div>
        </DashboardSection>
      ) : null}

      <DashboardSection title="إنشاء حملة جديدة" description="أنشئ رابط دعوة مشتركاً بحدود مقاعد وتاريخ انتهاء واضحين.">
        <form className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2" onSubmit={onCreate}>
          <label className="oh-sa-users-field">
            <span>اسم الحملة</span>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </label>
          <label className="oh-sa-users-field">
            <span>رابط الحملة / slug</span>
            <input
              dir="ltr"
              placeholder="company-freelancers-2026"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>عدد المقاعد المسموح</span>
            <input
              type="number"
              min={1}
              required
              value={form.maxRedemptions}
              onChange={(e) => setForm((f) => ({ ...f, maxRedemptions: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>تاريخ انتهاء الرابط</span>
            <input
              type="datetime-local"
              required
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>الخطة الافتراضية</span>
            <input
              dir="ltr"
              value={form.defaultPlanCode}
              onChange={(e) => setForm((f) => ({ ...f, defaultPlanCode: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>مستوى الثقة الافتراضي</span>
            <select
              value={form.defaultTrustLevel}
              onChange={(e) => setForm((f) => ({ ...f, defaultTrustLevel: e.target.value }))}
            >
              <option value="APPROVED">APPROVED</option>
              <option value="TRUSTED">TRUSTED</option>
            </select>
          </label>
          <label className="oh-sa-users-field">
            <span>التصنيف الافتراضي (اختياري)</span>
            <select
              value={form.defaultCategoryId}
              onChange={(e) => setForm((f) => ({ ...f, defaultCategoryId: e.target.value }))}
            >
              <option value="">— بدون —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.slug}
                </option>
              ))}
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__form-span">
            <span>المؤسسة المرتبطة</span>
            <select
              value={form.institutionId}
              onChange={(e) => setForm((f) => ({ ...f, institutionId: e.target.value }))}
            >
              <option value="">بدون مؤسسة</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
            <span className="oh-sa-users-muted" style={{ fontSize: "0.78rem", lineHeight: 1.5 }}>
              كل فريلانسر يسجل من خلال هذه الحملة سيتم إضافته تلقائياً كعضو في المؤسسة المحددة.
            </span>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__form-span">
            <span>ملاحظات داخلية</span>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </label>
          <label className="oh-legacy-admin__doc-card oh-legacy-admin__form-span" style={{ cursor: "pointer" }}>
            <span>تفعيل الرابط فوراً</span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
          </label>
          <div className="oh-legacy-admin__form-span">
            <Button type="submit" disabled={creating}>
              {creating ? "جاري الإنشاء…" : "إنشاء رابط مشترك"}
            </Button>
          </div>
        </form>
      </DashboardSection>

      <DashboardSection
        title="الحملات"
        description="إدارة روابط الدعوة المشتركة وحالاتها ومقاعدها."
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            تحديث
          </Button>
        }
      >
        {loading ? (
          <DashboardLoadingState />
        ) : rows.length === 0 ? (
          <DashboardEmptyState title="لا توجد حملات" description="أنشئ حملة لعرض رابط دعوة مشترك." />
        ) : (
          <div className="oh-sa-users-table-wrap">
            <DashboardTable caption="حملات الدعوة">
              <thead>
                <tr>
                  <th scope="col">الاسم</th>
                  <th scope="col">Slug</th>
                  <th scope="col">المؤسسة</th>
                  <th scope="col">المسجلون / المقاعد</th>
                  <th scope="col">الانتهاء</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={String(selectedId) === String(row.id) ? "oh-legacy-admin__selected-row" : undefined}>
                    <td>
                      <div className="oh-sa-users-user">
                        <strong>{row.name}</strong>
                      </div>
                    </td>
                    <td dir="ltr">{row.slug}</td>
                    <td>{resolveCampaignInstitutionLabel(row)}</td>
                    <td>
                      {row.usedCount} / {row.maxRedemptions}
                    </td>
                    <td>{formatDate(row.expiresAt)}</td>
                    <td>
                      <StatusBadge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? "نشط" : "متوقف"}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className="oh-sa-users-table__actions">
                        <Button type="button" variant="secondary" onClick={() => onSelectedCampaignIdChange(row.id)}>
                          المسجلون / الحقول
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyId === row.id}
                          onClick={() => onToggleActive(row)}
                        >
                          {row.isActive ? "إيقاف" : "تفعيل"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyId === row.id}
                          onClick={() => onRegenerate(row.id)}
                        >
                          إعادة توليد token
                        </Button>
                        <Button type="button" variant="danger" disabled={busyId === row.id} onClick={() => onRevoke(row.id)}>
                          إبطال
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
          </div>
        )}
      </DashboardSection>

      {selected && showFieldConfig ? renderFieldConfig() : null}

      {selected ? (
        <DashboardSection
          title={`ربط المؤسسة — ${selected.name}`}
          description="يمكن تعديل المؤسسة المرتبطة بالحملة؛ ينطبق على المسجلين الجدد عبر الرابط."
        >
          <div className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2" style={{ maxWidth: "36rem" }}>
            <label className="oh-sa-users-field oh-legacy-admin__form-span">
              <span>المؤسسة</span>
              <select
                value={campaignInstitutionId}
                onChange={(e) => setCampaignInstitutionId(e.target.value)}
                disabled={busyId === selectedId}
              >
                <option value="">بدون مؤسسة</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="oh-legacy-admin__form-span">
              <Button type="button" disabled={busyId === selectedId} onClick={() => void saveCampaignInstitution()}>
                حفظ ربط المؤسسة
              </Button>
            </div>
          </div>
        </DashboardSection>
      ) : null}

      {selected ? (
        <DashboardSection
          title={`المسجلون — ${selected.name}`}
          description={`${selected.usedCount} / ${selected.maxRedemptions} مقعد مستخدم`}
          actions={
            <a className="btn btn-secondary" href={`/api/super-admin/legacy-freelancer-invites/${selected.id}/redemptions.csv`}>
              تصدير CSV
            </a>
          }
        >
          {redemptions.length === 0 ? (
            <DashboardEmptyState title="لا مسجلين بعد" />
          ) : (
            <div className="oh-sa-users-table-wrap">
              <DashboardTable caption="مسجلو الحملة">
                <thead>
                  <tr>
                    <th scope="col">الاسم</th>
                    <th scope="col">رقم الفريلانسر</th>
                    <th scope="col">البريد</th>
                    <th scope="col">الهاتف</th>
                    <th scope="col">مرجع</th>
                    <th scope="col">تاريخ التسجيل</th>
                    <th scope="col">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.map((r) => (
                    <tr key={r.id}>
                      <td>{r.fullName}</td>
                      <td>
                        <span className="oh-legacy-admin__member-id">{r.freelancerMemberIdMasked || "—"}</span>
                      </td>
                      <td dir="ltr">{r.emailMasked}</td>
                      <td dir="ltr">{r.phoneMasked || "—"}</td>
                      <td>{r.internalReference || r.identityLast4 || "—"}</td>
                      <td>{formatDate(r.redeemedAt)}</td>
                      <td>
                        <Button type="button" variant="secondary" disabled={answersLoading} onClick={() => openAnswers(r.userId)}>
                          عرض بيانات التسجيل
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DashboardTable>
            </div>
          )}
        </DashboardSection>
      ) : null}

      {answersModal ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-answers-title">
          <button type="button" className="oh-sa-users-modal__backdrop" aria-label="إغلاق" onClick={() => setAnswersModal(null)} />
          <div className="oh-sa-users-modal__panel" style={{ width: "min(640px, 100%)" }}>
            <header className="oh-sa-users-modal__header">
              <h2 id="oh-legacy-answers-title">بيانات التسجيل</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setAnswersModal(null)} aria-label="إغلاق">
                ×
              </button>
            </header>
            <div className="oh-sa-users-modal__body">
              {(answersModal.sections || []).map((sec) => (
                <div key={sec.key}>
                  <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem" }}>{sec.labelAr}</h4>
                  <dl className="oh-sa-users-kv">
                    {(sec.fields || []).map((f) => (
                      <div key={f.fieldKey}>
                        <span>{f.labelAr}</span>
                        <strong dir={f.sensitive ? "ltr" : undefined}>
                          {f.value === true ? "نعم" : f.value === false ? "لا" : String(f.value ?? "—")}
                        </strong>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {!answersModal.sections?.length ? <p className="oh-sa-users-muted">لا توجد إجابات محفوظة.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
