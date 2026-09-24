import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listLegacyFreelancersRequest,
  getLegacyFreelancerRequest,
  createLegacyFreelancerRequest,
  bulkAssignLegacyFreelancerPackageRequest,
  assignLegacyFreelancerPackageRequest,
  setLegacyFreelancerSignedDocumentRequest,
  removeLegacyFreelancerSignedDocumentRequest,
  addLegacyFreelancerHistoricalMoneyRequest,
  voidLegacyFreelancerHistoricalMoneyRequest,
  replaceLegacyFreelancerIdentityRequest,
  listLegacyDocumentTypesRequest,
  listAdminPlansRequest,
  adminListInstitutionsRequest,
} from "../../../services/api";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../../components/dashboard/DashboardErrorState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import Pagination from "../../../components/common/Pagination";
import {
  formatDate,
  formatMoney,
  entryMethodLabel,
  identityStatusLabel,
  categoriesLabel,
  PACKAGE_DURATION_OPTIONS,
  LegacyIdentityImage,
} from "./legacyAdminShared";
import { LEGACY_WORK_FIELDS, WORK_FIELDS_REQUIRED_MESSAGE } from "../../../constants/legacyFreelancerWorkFields";
import LegacyPhoneInput from "../../../components/legacy/LegacyPhoneInput";
import LegacySmartSuggestField from "../../../components/legacy/LegacySmartSuggestField";
import LegacySearchableSelect from "../../../components/legacy/LegacySearchableSelect";
import { listJordanCityOptions, CITY_OTHER_VALUE, CITY_OTHER_LABEL_AR } from "../../../constants/jordanCities";
import { DEFAULT_DIAL_CODE, toPhonePayload } from "../../../utils/legacyPhone";

const DETAIL_TABS = [
  { id: "profile", label: "البيانات" },
  { id: "identity", label: "الهوية" },
  { id: "docs", label: "الأوراق والعقود" },
  { id: "package", label: "الباقة" },
  { id: "money", label: "المبالغ المستلمة" },
];

const EMPTY_CREATE = {
  firstName: "",
  fatherName: "",
  familyName: "",
  nationalId: "",
  phoneCountryCode: DEFAULT_DIAL_CODE,
  phoneNumber: "",
  email: "",
  city: "",
  residence: "",
  specialization: "",
  nationality: "",
  planId: "",
  durationMonths: "",
  historicalAmount: "",
  signedDocumentTypeIds: [],
  workFields: [],
  institutionId: "",
};

const EMPTY_FILTERS = {
  planId: "",
  identityComplete: "",
  entryMethod: "",
  isActive: "",
  workField: "",
};

/**
 * @param {{ createSignal?: number, onListChanged?: () => void, campaignId?: string|null, hideManualCreate?: boolean }} props
 */
export default function LegacyFreelancersPanel({
  createSignal = 0,
  onListChanged,
  campaignId = null,
  hideManualCreate = false,
}) {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [draftFilters, setDraftFilters] = useState({ q: "", ...EMPTY_FILTERS });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [plans, setPlans] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [institutions, setInstitutions] = useState([]);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [idFrontFile, setIdFrontFile] = useState(null);
  const [idBackFile, setIdBackFile] = useState(null);
  const [creating, setCreating] = useState(false);

  const [showBulk, setShowBulk] = useState(false);
  const [bulkPlanId, setBulkPlanId] = useState("");
  const [bulkDuration, setBulkDuration] = useState("3");
  const [bulkBusy, setBulkBusy] = useState(false);

  const [detailUserId, setDetailUserId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("profile");
  const [identityRefresh, setIdentityRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = {
        q: q || undefined,
        page,
        pageSize,
        planId: filters.planId || undefined,
        identityComplete: filters.identityComplete || undefined,
        entryMethod: filters.entryMethod || undefined,
        isActive: filters.isActive || undefined,
        workField: filters.workField || undefined,
        campaignId: campaignId || undefined,
      };
      const res = await listLegacyFreelancersRequest(params);
      const data = res?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setTotalPages(Number(data.totalPages) || 1);
      setSelectedIds(new Set());
    } catch (err) {
      setLoadError(getSafeApiErrorMessage(err, "تعذر تحميل الفريلانسرز"));
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل الفريلانسرز") });
    } finally {
      setLoading(false);
    }
  }, [q, page, pageSize, filters, campaignId, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (hideManualCreate) return;
    if (createSignal > 0) setShowCreate(true);
  }, [createSignal, hideManualCreate]);

  useEffect(() => {
    listAdminPlansRequest(false)
      .then((res) => {
        const plansList = res?.data?.plans || res?.data || [];
        setPlans(Array.isArray(plansList) ? plansList : []);
      })
      .catch(() => setPlans([]));
    listLegacyDocumentTypesRequest({ includeInactive: false })
      .then((res) => setDocTypes(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setDocTypes([]));
    adminListInstitutionsRequest({ status: "active", limit: 100 })
      .then((res) => setInstitutions(res?.data?.institutions || []))
      .catch(() => setInstitutions([]));
  }, []);

  const loadDetail = useCallback(
    async (userId) => {
      if (!userId) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        const res = await getLegacyFreelancerRequest(userId);
        setDetail(res?.data || null);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل التفاصيل") });
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    if (detailUserId) loadDetail(detailUserId);
  }, [detailUserId, loadDetail]);

  const allVisibleSelected = items.length > 0 && items.every((r) => selectedIds.has(r.id));
  const selectedCount = selectedIds.size;

  const toggleAll = () => {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map((r) => r.id)));
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyFilters = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(draftFilters.q.trim());
    setFilters({
      planId: draftFilters.planId,
      identityComplete: draftFilters.identityComplete,
      entryMethod: draftFilters.entryMethod,
      isActive: draftFilters.isActive,
      campaignId: draftFilters.campaignId,
      workField: draftFilters.workField,
    });
  };

  const resetFilters = () => {
    setDraftFilters({ q: "", ...EMPTY_FILTERS });
    setQ("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const hasFiles = Boolean(idFrontFile || idBackFile);
      const base = {
        firstName: createForm.firstName,
        fatherName: createForm.fatherName,
        familyName: createForm.familyName,
        nationalId: createForm.nationalId,
        phone: toPhonePayload({
          countryCode: createForm.phoneCountryCode,
          number: createForm.phoneNumber,
        }),
        email: createForm.email,
        city: createForm.city || undefined,
        residence: createForm.residence || undefined,
        specialization: createForm.specialization || undefined,
        nationality: createForm.nationality || undefined,
        planId: createForm.planId || undefined,
        durationMonths: createForm.durationMonths || undefined,
        historicalAmount: createForm.historicalAmount || undefined,
        signedDocumentTypeIds: createForm.signedDocumentTypeIds,
        workFields: createForm.workFields,
        institutionId: createForm.institutionId ? Number(createForm.institutionId) : undefined,
      };

      if (!base.workFields?.length) {
        pushToast({ type: "error", message: WORK_FIELDS_REQUIRED_MESSAGE });
        setCreating(false);
        return;
      }

      let payload;
      if (hasFiles) {
        payload = new FormData();
        Object.entries(base).forEach(([key, value]) => {
          if (value == null || value === "") return;
          if (key === "signedDocumentTypeIds" || key === "workFields") {
            payload.append(key, JSON.stringify(value));
          } else if (key === "phone" && typeof value === "object") {
            payload.append(key, JSON.stringify(value));
          } else {
            payload.append(key, String(value));
          }
        });
        if (idFrontFile) payload.append("idFront", idFrontFile);
        if (idBackFile) payload.append("idBack", idBackFile);
      } else {
        payload = base;
      }

      await createLegacyFreelancerRequest(payload);
      pushToast({ type: "success", message: "تم إضافة الفريلانسر القديم" });
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      setIdFrontFile(null);
      setIdBackFile(null);
      await load();
      onListChanged?.();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إضافة الفريلانسر") });
    } finally {
      setCreating(false);
    }
  };

  const onBulkAssign = async () => {
    if (!bulkPlanId || !selectedCount) return;
    setBulkBusy(true);
    try {
      await bulkAssignLegacyFreelancerPackageRequest({
        userIds: [...selectedIds],
        planId: Number(bulkPlanId),
        durationMonths: Number(bulkDuration),
      });
      pushToast({ type: "success", message: `تم إسناد الباقة لـ ${selectedCount} فريلانسر` });
      setShowBulk(false);
      await load();
      onListChanged?.();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر الإسناد الجماعي") });
    } finally {
      setBulkBusy(false);
    }
  };

  const planOptions = useMemo(
    () =>
      plans.map((p) => ({
        id: String(p.id),
        label: p.title || p.name || `#${p.id}`,
      })),
    [plans],
  );

  return (
    <>
      <DashboardSection
        title="إدارة الفريلانسرز"
        description={loading ? "جارٍ التحميل…" : `${total} نتيجة`}
        actions={
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            تحديث
          </Button>
        }
      >
        <form className="oh-legacy-admin__toolbar" onSubmit={applyFilters}>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-search">
            <span>بحث</span>
            <input
              value={draftFilters.q}
              onChange={(e) => setDraftFilters((s) => ({ ...s, q: e.target.value }))}
              placeholder="اسم، بريد، هاتف، رقم عضوية…"
            />
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>الباقة</span>
            <select
              value={draftFilters.planId}
              onChange={(e) => setDraftFilters((s) => ({ ...s, planId: e.target.value }))}
            >
              <option value="">الكل</option>
              {planOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>الهوية</span>
            <select
              value={draftFilters.identityComplete}
              onChange={(e) => setDraftFilters((s) => ({ ...s, identityComplete: e.target.value }))}
            >
              <option value="">الكل</option>
              <option value="true">مكتملة</option>
              <option value="false">غير مكتملة</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>طريقة الدخول</span>
            <select
              value={draftFilters.entryMethod}
              onChange={(e) => setDraftFilters((s) => ({ ...s, entryMethod: e.target.value }))}
            >
              <option value="">الكل</option>
              <option value="SHARED_INVITE">دعوة مشتركة</option>
              <option value="ADMIN_MANUAL">إضافة يدوية</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>حالة الحساب</span>
            <select
              value={draftFilters.isActive}
              onChange={(e) => setDraftFilters((s) => ({ ...s, isActive: e.target.value }))}
            >
              <option value="">الكل</option>
              <option value="true">نشط</option>
              <option value="false">غير نشط</option>
            </select>
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__toolbar-field">
            <span>مجال العمل</span>
            <select
              value={draftFilters.workField}
              onChange={(e) => setDraftFilters((s) => ({ ...s, workField: e.target.value }))}
            >
              <option value="">الكل</option>
              {LEGACY_WORK_FIELDS.map((wf) => (
                <option key={wf.key} value={wf.key}>
                  {wf.labelAr}
                </option>
              ))}
            </select>
          </label>
          <div className="oh-legacy-admin__toolbar-actions">
            <Button type="submit">تطبيق</Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              إعادة ضبط
            </Button>
          </div>
        </form>

        {selectedCount > 0 ? (
          <div className="oh-sa-users-bulk" role="region" aria-label="إجراءات جماعية" style={{ marginBottom: "0.85rem" }}>
            <span className="oh-sa-users-bulk__count">محدّد: {selectedCount}</span>
            <Button type="button" onClick={() => setShowBulk(true)}>
              إسناد باقة
            </Button>
            <Button type="button" variant="secondary" onClick={() => setSelectedIds(new Set())}>
              إلغاء التحديد
            </Button>
          </div>
        ) : null}

        {loading ? (
          <DashboardLoadingState />
        ) : loadError ? (
          <DashboardErrorState
            message={loadError}
            actions={
              <Button type="button" variant="secondary" onClick={load}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <DashboardEmptyState
            title="لا يوجد فريلانسرز"
            description="أضف يدوياً أو عبر حملات الدعوة المشتركة."
          />
        ) : (
          <>
            <div className="oh-sa-users-table-wrap">
              <DashboardTable caption="قائمة الفريلانسرز القدامى">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleAll}
                        aria-label="تحديد الكل"
                      />
                    </th>
                    <th scope="col">رقم العضوية</th>
                    <th scope="col">الاسم</th>
                    <th scope="col">مجال العمل</th>
                    <th scope="col">التواصل</th>
                    <th scope="col">طريقة الدخول</th>
                    <th scope="col">الباقة</th>
                    <th scope="col">الهوية</th>
                    <th scope="col">الأوراق</th>
                    <th scope="col">مبالغ تاريخية</th>
                    <th scope="col">الحالة</th>
                    <th scope="col">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className={selectedIds.has(row.id) ? "oh-legacy-admin__selected-row" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`تحديد ${row.fullName}`}
                        />
                      </td>
                      <td>
                        <span className="oh-legacy-admin__member-id">
                          {row.freelancerMemberIdMasked || "—"}
                        </span>
                      </td>
                      <td>
                        <div className="oh-sa-users-user">
                          <strong>{row.fullName}</strong>
                          <span>{categoriesLabel(row.categories)}</span>
                        </div>
                      </td>
                      <td>
                        {row.workFields?.isEmpty || !(row.workFields?.labels || []).length ? (
                          <span className="oh-legacy-admin__muted">غير محدد</span>
                        ) : (
                          <div className="oh-legacy-work-chips">
                            {(row.workFields?.labels || []).map((lbl) => (
                              <span key={lbl} className="oh-legacy-work-chip">
                                {lbl}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="oh-sa-users-user">
                          <span dir="ltr">{row.phone || "—"}</span>
                          <span dir="ltr">{row.email || "—"}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge
                          tone={row.legacyEntryMethod === "ADMIN_MANUAL" ? "admin_assigned" : "neutral"}
                        >
                          {entryMethodLabel(row.legacyEntryMethod)}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="oh-sa-users-plan-cell">
                          <strong>{row.plan?.title || row.plan?.name || "—"}</strong>
                          <span className="oh-sa-users-muted">{formatDate(row.plan?.expiresAt)}</span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={row.identity?.complete ? "success" : "warning"}>
                          {identityStatusLabel(row.identity)}
                        </StatusBadge>
                      </td>
                      <td>{row.signedDocuments?.count ?? 0}</td>
                      <td>{formatMoney(row.historicalMoney?.total, row.historicalMoney?.currency)}</td>
                      <td>
                        <StatusBadge tone={row.isActive ? "success" : "danger"}>
                          {row.isActive ? "نشط" : "غير نشط"}
                        </StatusBadge>
                      </td>
                      <td>
                        <div className="oh-sa-users-table__actions">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setDetailTab("profile");
                              setDetailUserId(row.id);
                            }}
                          >
                            عرض / إدارة
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DashboardTable>
            </div>
            <div className="oh-legacy-admin__pager">
              <p className="oh-legacy-admin__pager-meta">
                صفحة {page} من {totalPages}
              </p>
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
            </div>
          </>
        )}
      </DashboardSection>

      {showCreate ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-create-title">
          <button type="button" className="oh-sa-users-modal__backdrop" aria-label="إغلاق" onClick={() => setShowCreate(false)} />
          <div className="oh-sa-users-modal__panel" style={{ width: "min(720px, 100%)", maxHeight: "min(92vh, 900px)" }}>
            <header className="oh-sa-users-modal__header">
              <h2 id="oh-legacy-create-title">إضافة فريلانسر قديم</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setShowCreate(false)} aria-label="إغلاق">
                ×
              </button>
            </header>
            <form className="oh-sa-users-modal__body" onSubmit={onCreate}>
              <div className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2">
                {[
                  ["firstName", "الاسم الأول *", true],
                  ["fatherName", "اسم الأب *", true],
                  ["familyName", "اسم العائلة *", true],
                  ["nationalId", "الرقم الوطني *", true, true],
                ].map(([key, label, required, ltr]) => (
                  <label key={key} className="oh-sa-users-field">
                    <span>{label}</span>
                    <input
                      required={required}
                      dir={ltr ? "ltr" : undefined}
                      value={createForm[key]}
                      onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
                <div className="oh-sa-users-field">
                  <span id="oh-legacy-create-phone-label">رقم الهاتف *</span>
                  <LegacyPhoneInput
                    id="oh-legacy-create-phone"
                    variant="admin"
                    required
                    countryCode={createForm.phoneCountryCode}
                    number={createForm.phoneNumber}
                    onCountryCodeChange={(v) => setCreateForm((f) => ({ ...f, phoneCountryCode: v }))}
                    onNumberChange={(v) => setCreateForm((f) => ({ ...f, phoneNumber: v }))}
                    aria-labelledby="oh-legacy-create-phone-label"
                  />
                </div>
                <label className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>البريد الإلكتروني *</span>
                  <input
                    required
                    type="email"
                    dir="ltr"
                    value={createForm.email}
                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </label>
                <div className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>مجال العمل *</span>
                  <div className="oh-legacy-admin__doc-checks" style={{ marginTop: "0.4rem" }}>
                    {LEGACY_WORK_FIELDS.map((wf) => {
                      const checked = createForm.workFields.includes(wf.key);
                      return (
                        <label key={wf.key} className="oh-legacy-admin__check">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCreateForm((f) => {
                                const set = new Set(f.workFields);
                                if (e.target.checked) set.add(wf.key);
                                else set.delete(wf.key);
                                return { ...f, workFields: [...set] };
                              });
                            }}
                          />
                          {wf.labelAr}
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="oh-sa-users-field">
                  <span>المدينة</span>
                  <LegacySearchableSelect
                    className="oh-legacy-smart--admin"
                    value={createForm.city}
                    onChange={(v) => setCreateForm((f) => ({ ...f, city: v }))}
                    options={listJordanCityOptions()}
                    allowOther
                    otherValue={CITY_OTHER_VALUE}
                    otherLabel={CITY_OTHER_LABEL_AR}
                    otherInputLabel="اكتب اسم المدينة"
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>مكان الإقامة</span>
                  <LegacySmartSuggestField
                    fieldKey="residence_area"
                    className="oh-legacy-smart--admin"
                    value={createForm.residence}
                    onChange={(v) => setCreateForm((f) => ({ ...f, residence: v }))}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>التخصص</span>
                  <LegacySmartSuggestField
                    fieldKey="specialization"
                    className="oh-legacy-smart--admin"
                    value={createForm.specialization}
                    onChange={(v) => setCreateForm((f) => ({ ...f, specialization: v }))}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>الجنسية</span>
                  <LegacySmartSuggestField
                    fieldKey="nationality"
                    className="oh-legacy-smart--admin"
                    value={createForm.nationality}
                    onChange={(v) => setCreateForm((f) => ({ ...f, nationality: v }))}
                  />
                </label>
                <label className="oh-sa-users-field oh-legacy-admin__form-span">
                  <span>ربط بمؤسسة (اختياري)</span>
                  <select
                    value={createForm.institutionId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, institutionId: e.target.value }))}
                  >
                    <option value="">— بدون —</option>
                    {institutions.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>الباقة (اختياري)</span>
                  <select
                    value={createForm.planId}
                    onChange={(e) => setCreateForm((f) => ({ ...f, planId: e.target.value }))}
                  >
                    <option value="">— افتراضي —</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>مدة الباقة (أشهر)</span>
                  <select
                    value={createForm.durationMonths}
                    onChange={(e) => setCreateForm((f) => ({ ...f, durationMonths: e.target.value }))}
                  >
                    <option value="">— بدون مدة محددة —</option>
                    {PACKAGE_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>مبلغ تاريخي (اختياري)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    value={createForm.historicalAmount}
                    onChange={(e) => setCreateForm((f) => ({ ...f, historicalAmount: e.target.value }))}
                  />
                </label>
                <div className="oh-legacy-admin__form-span">
                  <p className="oh-sa-users-muted" style={{ marginBottom: "0.5rem", fontWeight: 800 }}>
                    الأوراق والعقود الموقعة
                    <span className="oh-legacy-admin__muted" style={{ display: "block", fontWeight: 400 }}>
                      تُدار بواسطة الإدارة فقط
                    </span>
                  </p>
                  <div className="oh-legacy-admin__form-grid">
                    {docTypes.map((t) => {
                      const checked = createForm.signedDocumentTypeIds.includes(String(t.id));
                      return (
                        <label key={t.id} className="oh-legacy-admin__doc-card" style={{ cursor: "pointer" }}>
                          <span>{t.labelAr}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setCreateForm((f) => {
                                const id = String(t.id);
                                const set = new Set(f.signedDocumentTypeIds.map(String));
                                if (e.target.checked) set.add(id);
                                else set.delete(id);
                                return { ...f, signedDocumentTypeIds: [...set] };
                              });
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <label className="oh-sa-users-field">
                  <span>صورة الهوية (أمام)</span>
                  <input type="file" accept="image/*" onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)} />
                </label>
                <label className="oh-sa-users-field">
                  <span>صورة الهوية (خلف)</span>
                  <input type="file" accept="image/*" onChange={(e) => setIdBackFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              <div className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "جاري الحفظ…" : "حفظ"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showBulk ? (
        <div className="oh-sa-users-modal" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-bulk-title">
          <button type="button" className="oh-sa-users-modal__backdrop" aria-label="إغلاق" onClick={() => setShowBulk(false)} />
          <div className="oh-sa-users-modal__panel">
            <header className="oh-sa-users-modal__header">
              <h2 id="oh-legacy-bulk-title">إسناد باقة</h2>
              <button type="button" className="oh-sa-users-modal__close" onClick={() => setShowBulk(false)} aria-label="إغلاق">
                ×
              </button>
            </header>
            <div className="oh-sa-users-modal__body">
              <p className="oh-sa-users-modal__desc">
                سيتم إسناد الباقة لـ <strong>{selectedCount}</strong> فريلانسر محدد.
              </p>
              <label className="oh-sa-users-field">
                <span>الباقة</span>
                <select value={bulkPlanId} onChange={(e) => setBulkPlanId(e.target.value)}>
                  <option value="">— اختر —</option>
                  {planOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="oh-sa-users-field">
                <span>المدة (أشهر)</span>
                <select value={bulkDuration} onChange={(e) => setBulkDuration(e.target.value)}>
                  {PACKAGE_DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <div className="oh-sa-users-modal__footer">
                <Button type="button" variant="secondary" onClick={() => setShowBulk(false)}>
                  إلغاء
                </Button>
                <Button type="button" disabled={bulkBusy || !bulkPlanId} onClick={onBulkAssign}>
                  {bulkBusy ? "جاري الإسناد…" : "تأكيد"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {detailUserId ? (
        <LegacyFreelancerDetailDrawer
          detail={detail}
          loading={detailLoading}
          detailTab={detailTab}
          setDetailTab={setDetailTab}
          identityRefresh={identityRefresh}
          planOptions={planOptions}
          docTypes={docTypes}
          onClose={() => {
            setDetailUserId(null);
            setDetail(null);
          }}
          onRefresh={async () => {
            await loadDetail(detailUserId);
            await load();
          }}
          onIdentityReplaced={() => setIdentityRefresh((n) => n + 1)}
          pushToast={pushToast}
        />
      ) : null}
    </>
  );
}

function LegacyFreelancerDetailDrawer({
  detail,
  loading,
  detailTab,
  setDetailTab,
  identityRefresh,
  planOptions,
  docTypes,
  onClose,
  onRefresh,
  onIdentityReplaced,
  pushToast,
}) {
  const [pkgPlanId, setPkgPlanId] = useState("");
  const [pkgDuration, setPkgDuration] = useState("3");
  const [pkgBusy, setPkgBusy] = useState(false);
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyNote, setMoneyNote] = useState("");
  const [moneyBusy, setMoneyBusy] = useState(false);
  const [docBusyId, setDocBusyId] = useState(null);
  const [idBusySide, setIdBusySide] = useState(null);

  const activeSignedIds = useMemo(() => {
    const set = new Set();
    for (const d of detail?.signedDocuments || []) {
      if (d.isActive !== false) set.add(String(d.documentTypeId));
    }
    return set;
  }, [detail]);

  const assignPackage = async () => {
    if (!detail?.id || !pkgPlanId) return;
    setPkgBusy(true);
    try {
      await assignLegacyFreelancerPackageRequest(detail.id, {
        planId: Number(pkgPlanId),
        durationMonths: Number(pkgDuration),
      });
      pushToast({ type: "success", message: "تم إسناد الباقة" });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إسناد الباقة") });
    } finally {
      setPkgBusy(false);
    }
  };

  const addMoney = async (e) => {
    e.preventDefault();
    if (!detail?.id) return;
    setMoneyBusy(true);
    try {
      await addLegacyFreelancerHistoricalMoneyRequest(detail.id, {
        amount: Number(moneyAmount),
        note: moneyNote || undefined,
        currency: "JOD",
      });
      setMoneyAmount("");
      setMoneyNote("");
      pushToast({ type: "success", message: "تم تسجيل المبلغ التاريخي" });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تسجيل المبلغ") });
    } finally {
      setMoneyBusy(false);
    }
  };

  const voidMoney = async (id) => {
    if (!detail?.id) return;
    const reason = window.prompt("سبب الإلغاء (اختياري):") || undefined;
    try {
      await voidLegacyFreelancerHistoricalMoneyRequest(detail.id, id, { voidReason: reason });
      pushToast({ type: "success", message: "تم إلغاء السجل" });
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر الإلغاء") });
    }
  };

  const toggleSignedDoc = async (documentTypeId, currentlyActive) => {
    if (!detail?.id) return;
    setDocBusyId(documentTypeId);
    try {
      if (currentlyActive) {
        await removeLegacyFreelancerSignedDocumentRequest(detail.id, documentTypeId);
      } else {
        await setLegacyFreelancerSignedDocumentRequest(detail.id, { documentTypeId });
      }
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحديث المستند") });
    } finally {
      setDocBusyId(null);
    }
  };

  const replaceIdentity = async (side, file) => {
    if (!detail?.id || !file) return;
    setIdBusySide(side);
    try {
      await replaceLegacyFreelancerIdentityRequest(detail.id, side, file);
      pushToast({ type: "success", message: "تم استبدال صورة الهوية" });
      onIdentityReplaced();
      await onRefresh();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر رفع الصورة") });
    } finally {
      setIdBusySide(null);
    }
  };

  const hasFront = (detail?.identityDocuments || []).some((d) => String(d.side).toUpperCase() === "FRONT");
  const hasBack = (detail?.identityDocuments || []).some((d) => String(d.side).toUpperCase() === "BACK");

  return (
    <div className="oh-sa-users-drawer" role="dialog" aria-modal="true" aria-labelledby="oh-legacy-drawer-title">
      <button type="button" className="oh-sa-users-drawer__backdrop" aria-label="إغلاق" onClick={onClose} />
      <aside className="oh-sa-users-drawer__panel">
        <header className="oh-sa-users-drawer__header">
          <div>
            <h2 id="oh-legacy-drawer-title">{detail?.fullName || "تفاصيل الفريلانسر"}</h2>
            <p className="oh-sa-users-drawer__sub">
              <span className="oh-legacy-admin__member-id">{detail?.freelancerMemberIdMasked || "—"}</span>
            </p>
          </div>
          <button type="button" className="oh-sa-users-drawer__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        <nav className="oh-sa-users-tabs" role="tablist" aria-label="أقسام التفاصيل">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={detailTab === t.id}
              className={`oh-sa-users-tabs__btn${detailTab === t.id ? " is-active" : ""}`}
              onClick={() => setDetailTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="oh-sa-users-drawer__body">
          {loading || !detail ? (
            <DashboardLoadingState />
          ) : detailTab === "profile" ? (
            <dl className="oh-sa-users-kv">
              <div>
                <span>الاسم</span>
                <strong>{detail.fullName}</strong>
              </div>
              <div>
                <span>رقم العضوية</span>
                <strong className="oh-legacy-admin__member-id">{detail.freelancerMemberIdMasked || "—"}</strong>
              </div>
              <div>
                <span>البريد</span>
                <strong dir="ltr">{detail.email || "—"}</strong>
              </div>
              <div>
                <span>الهاتف</span>
                <strong dir="ltr">{detail.phone || "—"}</strong>
              </div>
              <div>
                <span>مجال العمل</span>
                <strong>
                  {detail.workFields?.isEmpty || !(detail.workFields?.labels || []).length ? (
                    "غير محدد"
                  ) : (
                    <span className="oh-legacy-work-chips">
                      {detail.workFields.labels.map((lbl) => (
                        <span key={lbl} className="oh-legacy-work-chip">
                          {lbl}
                        </span>
                      ))}
                    </span>
                  )}
                </strong>
              </div>
              <div>
                <span>المهارات والبرامج</span>
                <strong>
                  {!(detail.detailedSkills || []).length ? (
                    "—"
                  ) : (
                    <span className="oh-legacy-work-chips">
                      {(detail.detailedSkills || []).map((sk) => (
                        <span key={sk} className="oh-legacy-work-chip">
                          {sk}
                        </span>
                      ))}
                    </span>
                  )}
                </strong>
              </div>
              <div>
                <span>طريقة الدخول</span>
                <strong>
                  <StatusBadge
                    tone={detail.legacyEntryMethod === "ADMIN_MANUAL" ? "admin_assigned" : "neutral"}
                  >
                    {entryMethodLabel(detail.legacyEntryMethod)}
                  </StatusBadge>
                </strong>
              </div>
              <div>
                <span>الحالة</span>
                <strong>
                  <StatusBadge tone={detail.isActive ? "success" : "danger"}>
                    {detail.isActive ? "نشط" : "غير نشط"}
                  </StatusBadge>
                </strong>
              </div>
              <div>
                <span>الباقة الحالية</span>
                <strong>{detail.plan?.title || detail.plan?.name || "—"}</strong>
              </div>
              <div>
                <span>انتهاء الباقة</span>
                <strong>{formatDate(detail.plan?.expiresAt)}</strong>
              </div>
            </dl>
          ) : detailTab === "identity" ? (
            <div className="oh-sa-users-stack">
              {hasFront ? (
                <LegacyIdentityImage
                  userId={detail.id}
                  side="front"
                  label="صورة الهوية الأمامية"
                  refreshKey={identityRefresh}
                />
              ) : (
                <p className="oh-sa-users-muted">لا توجد صورة أمامية محفوظة.</p>
              )}
              <label className="oh-sa-users-field">
                <span>استبدال الأمامية</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={idBusySide === "front"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) replaceIdentity("front", f);
                  }}
                />
              </label>
              {hasBack ? (
                <LegacyIdentityImage
                  userId={detail.id}
                  side="back"
                  label="صورة الهوية الخلفية"
                  refreshKey={identityRefresh}
                />
              ) : (
                <p className="oh-sa-users-muted">لا توجد صورة خلفية محفوظة.</p>
              )}
              <label className="oh-sa-users-field">
                <span>استبدال الخلفية</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={idBusySide === "back"}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) replaceIdentity("back", f);
                  }}
                />
              </label>
            </div>
          ) : detailTab === "docs" ? (
            <div className="oh-sa-users-stack">
              <p className="oh-sa-users-muted" style={{ margin: 0 }}>
                الأوراق والعقود الموقعة — تُدار بواسطة الإدارة فقط. التغييرات تُسجَّل في سجل التدقيق.
              </p>
              {docTypes.length === 0 ? (
                <DashboardEmptyState title="لا أنواع مستندات" />
              ) : (
                docTypes.map((t) => {
                  const active = activeSignedIds.has(String(t.id));
                  return (
                    <label key={t.id} className="oh-legacy-admin__doc-card" style={{ cursor: "pointer" }}>
                      <div className="oh-legacy-admin__meta">
                        <strong>{t.labelAr}</strong>
                        <span>{active ? "موقّع / مؤكد" : "غير مؤكد"}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={docBusyId === t.id}
                        onChange={() => toggleSignedDoc(t.id, active)}
                      />
                    </label>
                  );
                })
              )}
            </div>
          ) : detailTab === "package" ? (
            <div className="oh-sa-users-stack">
              <div className="oh-legacy-admin__notice oh-legacy-admin__notice--info">
                الحالية: <strong>{detail.plan?.title || detail.plan?.name || "—"}</strong>
                <br />
                الانتهاء: {formatDate(detail.plan?.expiresAt)}
              </div>
              <div className="oh-legacy-admin__form-grid">
                <label className="oh-sa-users-field">
                  <span>باقة جديدة</span>
                  <select value={pkgPlanId} onChange={(e) => setPkgPlanId(e.target.value)}>
                    <option value="">— اختر —</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="oh-sa-users-field">
                  <span>المدة (أشهر)</span>
                  <select value={pkgDuration} onChange={(e) => setPkgDuration(e.target.value)}>
                    {PACKAGE_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button type="button" disabled={pkgBusy || !pkgPlanId} onClick={assignPackage}>
                {pkgBusy ? "جاري الإسناد…" : "إسناد الباقة"}
              </Button>
              <h4 style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>سجل الإسنادات</h4>
              {(detail.packageHistory || []).length === 0 ? (
                <p className="oh-sa-users-muted">لا سجل بعد.</p>
              ) : (
                <ul className="oh-sa-users-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(detail.packageHistory || []).map((h) => (
                    <li key={h.id} className="oh-legacy-admin__doc-card">
                      <div className="oh-legacy-admin__meta">
                        <strong>{h.planTitle || h.planName || h.planId}</strong>
                        <span>
                          {formatDate(h.startsAt)} → {formatDate(h.expiresAt)} · {h.durationMonths || "—"} شهر ·{" "}
                          {h.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="oh-sa-users-stack">
              <p className="oh-legacy-admin__notice">
                هذه المبالغ تاريخية/إدارية فقط — لا تؤثر على رصيد المحفظة أو المدفوعات.
              </p>
              <p style={{ margin: 0 }}>
                الإجمالي النشط:{" "}
                <strong>
                  {formatMoney(detail.historicalMoney?.total, detail.historicalMoney?.currency || "JOD")}
                </strong>
              </p>
              <form className="oh-legacy-admin__form-grid" onSubmit={addMoney}>
                <label className="oh-sa-users-field">
                  <span>المبلغ</span>
                  <input
                    required
                    type="number"
                    min={0.01}
                    step="0.01"
                    dir="ltr"
                    value={moneyAmount}
                    onChange={(e) => setMoneyAmount(e.target.value)}
                  />
                </label>
                <label className="oh-sa-users-field">
                  <span>ملاحظة</span>
                  <input value={moneyNote} onChange={(e) => setMoneyNote(e.target.value)} />
                </label>
                <div className="oh-sa-users-filters__actions">
                  <Button type="submit" disabled={moneyBusy}>
                    إضافة
                  </Button>
                </div>
              </form>
              <ul className="oh-sa-users-stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(detail.historicalMoney?.records || []).map((r) => (
                  <li
                    key={r.id}
                    className="oh-legacy-admin__doc-card"
                    style={r.isVoided ? { opacity: 0.55, textDecoration: "line-through" } : undefined}
                  >
                    <div className="oh-legacy-admin__meta">
                      <strong>{formatMoney(r.amount, r.currency)}</strong>
                      <span>
                        {r.note || "—"} · {formatDate(r.receivedAt || r.createdAt)}
                      </span>
                    </div>
                    {!r.isVoided ? (
                      <Button type="button" variant="secondary" onClick={() => voidMoney(r.id)}>
                        إلغاء
                      </Button>
                    ) : (
                      <span className="oh-sa-users-muted">ملغى</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
