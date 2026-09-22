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
} from "../../../services/api";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../../components/dashboard/StatusBadge";
import Pagination from "../../../components/common/Pagination";
import { DEFAULT_DIAL_CODE } from "../../../constants/arabCountries";
import {
  formatDate,
  formatMoney,
  entryMethodLabel,
  identityStatusLabel,
  categoriesLabel,
  PACKAGE_DURATION_OPTIONS,
  LegacyIdentityImage,
} from "./legacyAdminShared";

const DETAIL_TABS = [
  { id: "profile", label: "البيانات" },
  { id: "identity", label: "الهوية" },
  { id: "docs", label: "الأوراق" },
  { id: "package", label: "الباقة" },
  { id: "money", label: "المبالغ المستلمة" },
];

const EMPTY_CREATE = {
  firstName: "",
  fatherName: "",
  familyName: "",
  nationalId: "",
  phoneDial: DEFAULT_DIAL_CODE,
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
};

export default function LegacyFreelancersPanel() {
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({
    planId: "",
    identityComplete: "",
    entryMethod: "",
    isActive: "",
  });
  const [plans, setPlans] = useState([]);
  const [docTypes, setDocTypes] = useState([]);

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
    try {
      const params = {
        q: q || undefined,
        page,
        pageSize,
        planId: filters.planId || undefined,
        identityComplete: filters.identityComplete || undefined,
        entryMethod: filters.entryMethod || undefined,
        isActive: filters.isActive || undefined,
      };
      const res = await listLegacyFreelancersRequest(params);
      const data = res?.data || {};
      setItems(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setTotalPages(Number(data.totalPages) || 1);
      setSelectedIds(new Set());
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل الفريلانسرز") });
    } finally {
      setLoading(false);
    }
  }, [q, page, pageSize, filters, pushToast]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((r) => r.id)));
    }
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQ(searchInput.trim());
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
        phone: { countryCode: createForm.phoneDial, number: createForm.phoneNumber },
        email: createForm.email,
        city: createForm.city || undefined,
        residence: createForm.residence || undefined,
        specialization: createForm.specialization || undefined,
        nationality: createForm.nationality || undefined,
        planId: createForm.planId || undefined,
        durationMonths: createForm.durationMonths || undefined,
        historicalAmount: createForm.historicalAmount || undefined,
        signedDocumentTypeIds: createForm.signedDocumentTypeIds,
      };

      let payload;
      if (hasFiles) {
        const phoneE164 = `${String(createForm.phoneDial || "").trim()}${String(createForm.phoneNumber || "").trim().replace(/\D/g, "")}`;
        payload = new FormData();
        Object.entries({
          ...base,
          phone: phoneE164.startsWith("+") ? phoneE164 : `+${phoneE164.replace(/^\+/, "")}`,
        }).forEach(([key, value]) => {
          if (value == null || value === "") return;
          if (key === "signedDocumentTypeIds") {
            payload.append("signedDocumentTypeIds", JSON.stringify(value));
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
      <DashboardSection title="الفريلانسرز القدامى">
        <DashboardToolbar>
          <form className="flex flex-wrap items-end gap-2" onSubmit={applySearch}>
            <label className="flex flex-col gap-1 text-xs">
              بحث
              <input
                className="min-w-[180px] rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="اسم، بريد، هاتف، رقم عضوية…"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              الباقة
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={filters.planId}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, planId: e.target.value }));
                }}
              >
                <option value="">الكل</option>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              الهوية
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={filters.identityComplete}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, identityComplete: e.target.value }));
                }}
              >
                <option value="">الكل</option>
                <option value="true">مكتملة</option>
                <option value="false">غير مكتملة</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              طريقة الدخول
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={filters.entryMethod}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, entryMethod: e.target.value }));
                }}
              >
                <option value="">الكل</option>
                <option value="SHARED_INVITE">دعوة مشتركة</option>
                <option value="ADMIN_MANUAL">إضافة يدوية</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              الحالة
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={filters.isActive}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, isActive: e.target.value }));
                }}
              >
                <option value="">الكل</option>
                <option value="true">نشط</option>
                <option value="false">غير نشط</option>
              </select>
            </label>
            <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
              بحث
            </button>
            <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={load}>
              تحديث
            </button>
          </form>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white"
              onClick={() => setShowCreate(true)}
            >
              إضافة فريلانسر قديم
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
              disabled={!selectedCount}
              onClick={() => setShowBulk(true)}
            >
              إسناد باقة ({selectedCount})
            </button>
          </div>
        </DashboardToolbar>

        {loading ? (
          <DashboardLoadingState />
        ) : items.length === 0 ? (
          <DashboardEmptyState title="لا يوجد فريلانسرز" description="أضف يدوياً أو عبر حملات الدعوة." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-right text-slate-500">
                    <th className="px-2 py-2">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label="تحديد الكل" />
                    </th>
                    <th className="px-2 py-2">رقم العضوية</th>
                    <th className="px-2 py-2">الاسم</th>
                    <th className="px-2 py-2">الهاتف</th>
                    <th className="px-2 py-2">البريد</th>
                    <th className="px-2 py-2">التخصص</th>
                    <th className="px-2 py-2">طريقة الدخول</th>
                    <th className="px-2 py-2">الباقة</th>
                    <th className="px-2 py-2">انتهاء الباقة</th>
                    <th className="px-2 py-2">الهوية</th>
                    <th className="px-2 py-2">الأوراق</th>
                    <th className="px-2 py-2">مبالغ تاريخية</th>
                    <th className="px-2 py-2">الحالة</th>
                    <th className="px-2 py-2">تاريخ الإنشاء</th>
                    <th className="px-2 py-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`تحديد ${row.fullName}`}
                        />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                        {row.freelancerMemberIdMasked || "—"}
                      </td>
                      <td className="px-2 py-2 font-medium">{row.fullName}</td>
                      <td className="px-2 py-2" dir="ltr">
                        {row.phone || "—"}
                      </td>
                      <td className="px-2 py-2" dir="ltr">
                        {row.email || "—"}
                      </td>
                      <td className="px-2 py-2">{categoriesLabel(row.categories)}</td>
                      <td className="px-2 py-2">{entryMethodLabel(row.legacyEntryMethod)}</td>
                      <td className="px-2 py-2">{row.plan?.title || row.plan?.name || "—"}</td>
                      <td className="px-2 py-2">{formatDate(row.plan?.expiresAt)}</td>
                      <td className="px-2 py-2">
                        <StatusBadge tone={row.identity?.complete ? "success" : "warning"}>
                          {identityStatusLabel(row.identity)}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-2">{row.signedDocuments?.count ?? 0}</td>
                      <td className="px-2 py-2">
                        {formatMoney(row.historicalMoney?.total, row.historicalMoney?.currency)}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge tone={row.isActive ? "success" : "danger"}>
                          {row.isActive ? "نشط" : "غير نشط"}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-2">{formatDate(row.createdAt)}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="rounded border px-2 py-1 text-xs"
                          onClick={() => {
                            setDetailTab("profile");
                            setDetailUserId(row.id);
                          }}
                        >
                          عرض/إدارة
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {total} نتيجة — صفحة {page} من {totalPages}
              </p>
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} isLoading={loading} />
            </div>
          </>
        )}
      </DashboardSection>

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">إضافة فريلانسر قديم</h3>
              <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => setShowCreate(false)}>
                إغلاق
              </button>
            </div>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
              <label className="flex flex-col gap-1 text-sm">
                الاسم الأول *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                اسم الأب *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  value={createForm.fatherName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fatherName: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                اسم العائلة *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  value={createForm.familyName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, familyName: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                الرقم الوطني *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  dir="ltr"
                  value={createForm.nationalId}
                  onChange={(e) => setCreateForm((f) => ({ ...f, nationalId: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                مفتاح الهاتف *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  dir="ltr"
                  value={createForm.phoneDial}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phoneDial: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                رقم الهاتف *
                <input
                  required
                  className="rounded-lg border px-3 py-2"
                  dir="ltr"
                  value={createForm.phoneNumber}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm md:col-span-2">
                البريد الإلكتروني *
                <input
                  required
                  type="email"
                  className="rounded-lg border px-3 py-2"
                  dir="ltr"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                المدينة
                <input
                  className="rounded-lg border px-3 py-2"
                  value={createForm.city}
                  onChange={(e) => setCreateForm((f) => ({ ...f, city: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                مكان الإقامة
                <input
                  className="rounded-lg border px-3 py-2"
                  value={createForm.residence}
                  onChange={(e) => setCreateForm((f) => ({ ...f, residence: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                التخصص
                <input
                  className="rounded-lg border px-3 py-2"
                  value={createForm.specialization}
                  onChange={(e) => setCreateForm((f) => ({ ...f, specialization: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                الجنسية
                <input
                  className="rounded-lg border px-3 py-2"
                  value={createForm.nationality}
                  onChange={(e) => setCreateForm((f) => ({ ...f, nationality: e.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                الباقة (اختياري)
                <select
                  className="rounded-lg border px-3 py-2"
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
              <label className="flex flex-col gap-1 text-sm">
                مدة الباقة (أشهر)
                <select
                  className="rounded-lg border px-3 py-2"
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
              <label className="flex flex-col gap-1 text-sm">
                مبلغ تاريخي (اختياري)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="rounded-lg border px-3 py-2"
                  dir="ltr"
                  value={createForm.historicalAmount}
                  onChange={(e) => setCreateForm((f) => ({ ...f, historicalAmount: e.target.value }))}
                />
              </label>
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">الأوراق الموقّعة</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {docTypes.map((t) => {
                    const checked = createForm.signedDocumentTypeIds.includes(String(t.id));
                    return (
                      <label key={t.id} className="flex items-center gap-2 text-sm">
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
                        {t.labelAr}
                      </label>
                    );
                  })}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                صورة الهوية (أمام)
                <input type="file" accept="image/*" onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)} />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                صورة الهوية (خلف)
                <input type="file" accept="image/*" onChange={(e) => setIdBackFile(e.target.files?.[0] || null)} />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {creating ? "جاري الحفظ…" : "حفظ"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showBulk ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-3 text-lg font-semibold">إسناد باقة</h3>
            <p className="mb-3 text-sm text-slate-600">
              سيتم إسناد الباقة لـ <strong>{selectedCount}</strong> فريلانسر محدد.
            </p>
            <label className="mb-3 flex flex-col gap-1 text-sm">
              الباقة
              <select
                className="rounded-lg border px-3 py-2"
                value={bulkPlanId}
                onChange={(e) => setBulkPlanId(e.target.value)}
              >
                <option value="">— اختر —</option>
                {planOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-4 flex flex-col gap-1 text-sm">
              المدة (أشهر)
              <select
                className="rounded-lg border px-3 py-2"
                value={bulkDuration}
                onChange={(e) => setBulkDuration(e.target.value)}
              >
                {PACKAGE_DURATION_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={bulkBusy || !bulkPlanId}
                onClick={onBulkAssign}
              >
                {bulkBusy ? "جاري الإسناد…" : "تأكيد"}
              </button>
              <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => setShowBulk(false)}>
                إلغاء
              </button>
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold">{detail?.fullName || "تفاصيل الفريلانسر"}</h3>
            <p className="font-mono text-xs text-slate-500" dir="ltr">
              {detail?.freelancerMemberIdMasked || "—"}
            </p>
          </div>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onClose}>
            إغلاق
          </button>
        </div>

        <nav className="flex flex-wrap gap-1 border-b bg-slate-50 px-3 py-2" role="tablist">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={detailTab === t.id}
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                detailTab === t.id ? "bg-slate-800 text-white" : "text-slate-600"
              }`}
              onClick={() => setDetailTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-4">
          {loading || !detail ? (
            <DashboardLoadingState />
          ) : detailTab === "profile" ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">الاسم</dt>
                <dd className="font-medium">{detail.fullName}</dd>
              </div>
              <div>
                <dt className="text-slate-500">رقم العضوية</dt>
                <dd className="font-mono" dir="ltr">
                  {detail.freelancerMemberIdMasked || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">البريد</dt>
                <dd dir="ltr">{detail.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الهاتف</dt>
                <dd dir="ltr">{detail.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">طريقة الدخول</dt>
                <dd>{entryMethodLabel(detail.legacyEntryMethod)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الحالة</dt>
                <dd>{detail.isActive ? "نشط" : "غير نشط"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">الباقة الحالية</dt>
                <dd>{detail.plan?.title || detail.plan?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">انتهاء الباقة</dt>
                <dd>{formatDate(detail.plan?.expiresAt)}</dd>
              </div>
            </dl>
          ) : detailTab === "identity" ? (
            <div>
              {hasFront ? (
                <LegacyIdentityImage
                  userId={detail.id}
                  side="front"
                  label="صورة الهوية الأمامية"
                  refreshKey={identityRefresh}
                />
              ) : (
                <p className="mb-3 text-sm text-slate-500">لا توجد صورة أمامية محفوظة.</p>
              )}
              <label className="mb-4 flex flex-col gap-1 text-sm">
                استبدال الأمامية
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
                <p className="mb-3 text-sm text-slate-500">لا توجد صورة خلفية محفوظة.</p>
              )}
              <label className="flex flex-col gap-1 text-sm">
                استبدال الخلفية
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
            <div className="space-y-2">
              {docTypes.length === 0 ? (
                <DashboardEmptyState title="لا أنواع مستندات" />
              ) : (
                docTypes.map((t) => {
                  const active = activeSignedIds.has(String(t.id));
                  return (
                    <label
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <span>{t.labelAr}</span>
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
            <div>
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                <p>
                  الحالية: <strong>{detail.plan?.title || detail.plan?.name || "—"}</strong>
                </p>
                <p>الانتهاء: {formatDate(detail.plan?.expiresAt)}</p>
              </div>
              <div className="mb-4 grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  باقة جديدة
                  <select
                    className="rounded-lg border px-3 py-2"
                    value={pkgPlanId}
                    onChange={(e) => setPkgPlanId(e.target.value)}
                  >
                    <option value="">— اختر —</option>
                    {planOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  المدة (أشهر)
                  <select
                    className="rounded-lg border px-3 py-2"
                    value={pkgDuration}
                    onChange={(e) => setPkgDuration(e.target.value)}
                  >
                    {PACKAGE_DURATION_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="mb-6 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
                disabled={pkgBusy || !pkgPlanId}
                onClick={assignPackage}
              >
                {pkgBusy ? "جاري الإسناد…" : "إسناد الباقة"}
              </button>
              <h4 className="mb-2 text-sm font-semibold">سجل الإسنادات</h4>
              {(detail.packageHistory || []).length === 0 ? (
                <p className="text-sm text-slate-500">لا سجل بعد.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {(detail.packageHistory || []).map((h) => (
                    <li key={h.id} className="rounded border border-slate-100 px-3 py-2">
                      <div className="font-medium">{h.planTitle || h.planName || h.planId}</div>
                      <div className="text-xs text-slate-500">
                        {formatDate(h.startsAt)} → {formatDate(h.expiresAt)} · {h.durationMonths || "—"} شهر ·{" "}
                        {h.status}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                هذه المبالغ تاريخية/إدارية فقط — لا تؤثر على رصيد المحفظة أو المدفوعات.
              </p>
              <p className="mb-3 text-sm">
                الإجمالي النشط:{" "}
                <strong>
                  {formatMoney(detail.historicalMoney?.total, detail.historicalMoney?.currency || "JOD")}
                </strong>
              </p>
              <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={addMoney}>
                <input
                  required
                  type="number"
                  min={0.01}
                  step="0.01"
                  className="rounded-lg border px-3 py-2 text-sm"
                  placeholder="المبلغ"
                  dir="ltr"
                  value={moneyAmount}
                  onChange={(e) => setMoneyAmount(e.target.value)}
                />
                <input
                  className="rounded-lg border px-3 py-2 text-sm"
                  placeholder="ملاحظة"
                  value={moneyNote}
                  onChange={(e) => setMoneyNote(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={moneyBusy}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  إضافة
                </button>
              </form>
              <ul className="space-y-2 text-sm">
                {(detail.historicalMoney?.records || []).map((r) => (
                  <li
                    key={r.id}
                    className={`flex items-center justify-between gap-2 rounded border px-3 py-2 ${
                      r.isVoided ? "border-slate-100 bg-slate-50 text-slate-400 line-through" : "border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-medium">{formatMoney(r.amount, r.currency)}</div>
                      <div className="text-xs">{r.note || "—"} · {formatDate(r.receivedAt || r.createdAt)}</div>
                    </div>
                    {!r.isVoided ? (
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                        onClick={() => voidMoney(r.id)}
                      >
                        إلغاء
                      </button>
                    ) : (
                      <span className="text-xs">ملغى</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
