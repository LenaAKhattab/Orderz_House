import { useCallback, useEffect, useState } from "react";
import {
  listLegacyDocumentTypesRequest,
  createLegacyDocumentTypeRequest,
  updateLegacyDocumentTypeRequest,
  listLegacyFreelancerInvitesRequest,
  getLegacyCampaignDocumentRequirementsRequest,
  putLegacyCampaignDocumentRequirementsRequest,
} from "../../../services/api";
import Button from "../../../components/ui/Button";
import { useToast } from "../../../components/ui/toastContext";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import DashboardSection from "../../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../../components/dashboard/DashboardLoadingState";
import DashboardTable from "../../../components/dashboard/DashboardTable";
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
      <DashboardSection
        title="كتالوج أنواع الأوراق والعقود"
        description="أنواع المستندات الافتراضية والمخصصة التي يمكن ربطها بالحملات وتأكيد توقيعها للفريلانسر."
        actions={
          <Button type="button" variant="secondary" onClick={loadTypes} disabled={loadingTypes}>
            تحديث
          </Button>
        }
      >
        <form className="oh-legacy-admin__form-grid oh-legacy-admin__form-grid--2" onSubmit={onCreateType} style={{ marginBottom: "1.25rem" }}>
          <label className="oh-sa-users-field">
            <span>الرمز (CODE)</span>
            <input
              required
              dir="ltr"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="CONTRACTOR_AGREEMENT"
            />
          </label>
          <label className="oh-sa-users-field">
            <span>الاسم بالعربية</span>
            <input
              required
              value={form.labelAr}
              onChange={(e) => setForm((f) => ({ ...f, labelAr: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field oh-legacy-admin__form-span">
            <span>الوصف (اختياري)</span>
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="oh-sa-users-field">
            <span>الترتيب</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
            />
          </label>
          <div className="oh-sa-users-filters__actions">
            <Button type="submit" disabled={creating}>
              {creating ? "جاري الإنشاء…" : "إضافة نوع مستند"}
            </Button>
          </div>
        </form>

        {loadingTypes ? (
          <DashboardLoadingState />
        ) : types.length === 0 ? (
          <DashboardEmptyState title="لا توجد أنواع مستندات" />
        ) : (
          <div className="oh-sa-users-table-wrap">
            <DashboardTable caption="أنواع المستندات">
              <thead>
                <tr>
                  <th scope="col">الرمز</th>
                  <th scope="col">الاسم</th>
                  <th scope="col">الترتيب</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {types.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">
                      <span className="oh-legacy-admin__member-id">{row.code}</span>
                    </td>
                    <td>
                      <div className="oh-sa-users-user">
                        <strong>{row.labelAr}</strong>
                        {row.description ? <span>{row.description}</span> : null}
                      </div>
                    </td>
                    <td>{row.sortOrder}</td>
                    <td>
                      <StatusBadge tone={row.isActive ? "success" : "danger"}>
                        {row.isActive ? "نشط" : "معطّل"}
                      </StatusBadge>
                    </td>
                    <td>
                      <Button type="button" variant="secondary" onClick={() => toggleTypeActive(row)}>
                        {row.isActive ? "تعطيل" : "تفعيل"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DashboardTable>
          </div>
        )}
      </DashboardSection>

      <DashboardSection
        title="متطلبات المستندات للحملة"
        description="عند اختيار حملة، حدّد الأوراق التي يجب على المسجّل تأكيد توقيعها أثناء التسجيل عبر الرابط."
        actions={
          selectedCampaignId ? (
            <Button type="button" disabled={reqsBusy || !reqs.length} onClick={saveReqs}>
              {reqsBusy ? "جاري الحفظ…" : "حفظ متطلبات الحملة"}
            </Button>
          ) : null
        }
      >
        <label className="oh-sa-users-field" style={{ maxWidth: "28rem", marginBottom: "1rem" }}>
          <span>الحملة</span>
          <select
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
            <p className="oh-legacy-admin__notice oh-legacy-admin__notice--info">
              الحملة المحددة: <strong>{selectedCampaign?.name || "—"}</strong>
            </p>
            {reqs.length === 0 ? (
              <DashboardEmptyState title="لا متطلبات بعد" />
            ) : (
              <div className="oh-sa-users-table-wrap">
                <DashboardTable caption="متطلبات الحملة">
                  <thead>
                    <tr>
                      <th scope="col">المستند</th>
                      <th scope="col">إظهار</th>
                      <th scope="col">إلزامي</th>
                      <th scope="col">الترتيب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r) => (
                      <tr key={r.documentTypeId}>
                        <td>
                          <div className="oh-sa-users-user">
                            <strong>{r.labelAr}</strong>
                            <span dir="ltr">{r.code}</span>
                          </div>
                        </td>
                        <td>
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
                        <td>
                          <input
                            type="checkbox"
                            disabled={!r.isEnabled}
                            checked={Boolean(r.isRequired)}
                            onChange={(e) => updateReqLocal(r.documentTypeId, { isRequired: e.target.checked })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            style={{ width: "5rem", padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(91,102,132,0.22)" }}
                            value={r.sortOrder}
                            onChange={(e) =>
                              updateReqLocal(r.documentTypeId, { sortOrder: Number(e.target.value) || 0 })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DashboardTable>
              </div>
            )}
          </>
        )}
      </DashboardSection>
    </>
  );
}
