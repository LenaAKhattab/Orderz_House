import { useCallback, useEffect, useState } from "react";
import {
  listLegacyDocumentTypesRequest,
  createLegacyDocumentTypeRequest,
  updateLegacyDocumentTypeRequest,
  listLegacyFreelancerInvitesRequest,
  getLegacyCampaignDocumentRequirementsRequest,
  putLegacyCampaignDocumentRequirementsRequest,
} from "../../../services/api";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardToolbar from "../../../components/dashboard/DashboardToolbar";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import StatusBadge from "../../../components/dashboard/StatusBadge";

export default function LegacyDocumentsPanel({ selectedCampaignId, onSelectedCampaignIdChange }) {
  const { pushToast } = useToast();
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [types, setTypes] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [reqs, setReqs] = useState([]);
  const [reqsBusy, setReqsBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: "", labelAr: "", description: "", sortOrder: 100 });

  const loadTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      const res = await listLegacyDocumentTypesRequest({ includeInactive: true });
      setTypes(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل أنواع المستندات") });
    } finally {
      setLoadingTypes(false);
    }
  }, [pushToast]);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await listLegacyFreelancerInvitesRequest();
      setCampaigns(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  const loadReqs = useCallback(
    async (campaignId) => {
      if (!campaignId) {
        setReqs([]);
        return;
      }
      try {
        const res = await getLegacyCampaignDocumentRequirementsRequest(campaignId);
        setReqs(Array.isArray(res?.data) ? res.data : []);
      } catch (err) {
        pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر تحميل متطلبات الحملة") });
      }
    },
    [pushToast],
  );

  useEffect(() => {
    loadTypes();
    loadCampaigns();
  }, [loadTypes, loadCampaigns]);

  useEffect(() => {
    loadReqs(selectedCampaignId);
  }, [selectedCampaignId, loadReqs]);

  const onCreateType = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createLegacyDocumentTypeRequest({
        code: form.code,
        labelAr: form.labelAr,
        description: form.description || null,
        sortOrder: Number(form.sortOrder) || 100,
        isActive: true,
      });
      setForm({ code: "", labelAr: "", description: "", sortOrder: 100 });
      pushToast({ type: "success", message: "تم إنشاء نوع المستند" });
      await loadTypes();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر إنشاء نوع المستند") });
    } finally {
      setCreating(false);
    }
  };

  const toggleTypeActive = async (row) => {
    try {
      await updateLegacyDocumentTypeRequest(row.id, { isActive: !row.isActive });
      await loadTypes();
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر التحديث") });
    }
  };

  const updateReqLocal = (documentTypeId, patch) => {
    setReqs((prev) =>
      prev.map((r) => (String(r.documentTypeId) === String(documentTypeId) ? { ...r, ...patch } : r)),
    );
  };

  const saveReqs = async () => {
    if (!selectedCampaignId) return;
    setReqsBusy(true);
    try {
      const payload = reqs.map((r, i) => ({
        documentTypeId: r.documentTypeId,
        isEnabled: Boolean(r.isEnabled),
        isRequired: Boolean(r.isEnabled) && Boolean(r.isRequired),
        sortOrder: Number(r.sortOrder) || i * 10,
      }));
      const res = await putLegacyCampaignDocumentRequirementsRequest(selectedCampaignId, payload);
      setReqs(Array.isArray(res?.data) ? res.data : []);
      pushToast({ type: "success", message: "تم حفظ متطلبات المستندات للحملة" });
    } catch (err) {
      pushToast({ type: "error", message: getSafeApiErrorMessage(err, "تعذر حفظ المتطلبات") });
    } finally {
      setReqsBusy(false);
    }
  };

  const selectedCampaign = campaigns.find((c) => String(c.id) === String(selectedCampaignId));

  return (
    <>
      <DashboardSection title="كتالوج أنواع الأوراق والعقود">
        <form className="mb-4 grid gap-3 md:grid-cols-2" onSubmit={onCreateType}>
          <label className="flex flex-col gap-1 text-sm">
            الرمز (CODE)
            <input
              required
              className="rounded-lg border border-slate-200 px-3 py-2"
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="CONTRACTOR_AGREEMENT"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الاسم بالعربية
            <input
              required
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.labelAr}
              onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            الوصف (اختياري)
            <input
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            الترتيب
            <input
              type="number"
              className="rounded-lg border border-slate-200 px-3 py-2"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {creating ? "جاري الإنشاء…" : "إضافة نوع مستند"}
            </button>
          </div>
        </form>

        <DashboardToolbar>
          <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={loadTypes}>
            تحديث
          </button>
        </DashboardToolbar>

        {loadingTypes ? (
          <DashboardLoadingState />
        ) : types.length === 0 ? (
          <DashboardEmptyState title="لا توجد أنواع مستندات" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-right text-slate-500">
                  <th className="px-2 py-2">الرمز</th>
                  <th className="px-2 py-2">الاسم</th>
                  <th className="px-2 py-2">الترتيب</th>
                  <th className="px-2 py-2">الحالة</th>
                  <th className="px-2 py-2">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {types.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-mono text-xs" dir="ltr">
                      {row.code}
                    </td>
                    <td className="px-2 py-2">{row.labelAr}</td>
                    <td className="px-2 py-2">{row.sortOrder}</td>
                    <td className="px-2 py-2">
                      <StatusBadge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? "نشط" : "معطّل"}
                      </StatusBadge>
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => toggleTypeActive(row)}
                      >
                        {row.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardSection>

      <DashboardSection title="متطلبات المستندات للحملة">
        <p className="mb-3 text-sm text-slate-600">
          عند اختيار حملة، حدّد الأوراق التي يجب على المسجّل تأكيد توقيعها أثناء التسجيل عبر الرابط.
        </p>
        <label className="mb-4 flex max-w-md flex-col gap-1 text-sm">
          الحملة
          <select
            className="rounded-lg border border-slate-200 px-3 py-2"
            value={selectedCampaignId || ""}
            onChange={(e) => onSelectedCampaignIdChange(e.target.value || null)}
          >
            <option value="">— اختر حملة —</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.slug})
              </option>
            ))}
          </select>
        </label>

        {!selectedCampaignId ? (
          <DashboardEmptyState title="اختر حملة" description="حدد حملة لعرض وتعديل متطلبات الأوراق." />
        ) : (
          <>
            <p className="mb-2 text-sm font-medium text-slate-700">{selectedCampaign?.name}</p>
            {reqs.length === 0 ? (
              <DashboardEmptyState title="لا متطلبات بعد" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-right text-slate-500">
                      <th className="px-2 py-2">المستند</th>
                      <th className="px-2 py-2">إظهار</th>
                      <th className="px-2 py-2">إلزامي</th>
                      <th className="px-2 py-2">الترتيب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r) => (
                      <tr key={r.documentTypeId} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          <div className="font-medium">{r.labelAr}</div>
                          <div className="text-xs text-slate-400" dir="ltr">
                            {r.code}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={Boolean(r.isEnabled)}
                            onChange={(e) =>
                              updateReqLocal(r.documentTypeId, {
                                isEnabled: e.target.checked,
                                isRequired: e.target.checked ? r.isRequired : false,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            disabled={!r.isEnabled}
                            checked={Boolean(r.isRequired)}
                            onChange={(e) => updateReqLocal(r.documentTypeId, { isRequired: e.target.checked })}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            className="w-20 rounded border px-2 py-1"
                            value={r.sortOrder}
                            onChange={(e) =>
                              updateReqLocal(r.documentTypeId, { sortOrder: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button
              type="button"
              className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
              disabled={reqsBusy || !reqs.length}
              onClick={saveReqs}
            >
              {reqsBusy ? "جاري الحفظ…" : "حفظ متطلبات الحملة"}
            </button>
          </>
        )}
      </DashboardSection>
    </>
  );
}
