import { useCallback, useEffect, useState } from "react";
import AdminInternalOrderWizard from "../../components/orders/AdminInternalOrderWizard";
import { useToast } from "../../components/ui/toastContext";
import {
  adminCreateFakeOrderRoundRequest,
  adminCreateFakeOrderTemplateRequest,
  adminDeactivateFakeOrderTemplateRequest,
  adminGetFakeOrderSettingsRequest,
  adminListFakeOrderRoundsRequest,
  adminListFakeOrderTemplatesRequest,
  adminStopFakeOrderRoundRequest,
  adminUpdateFakeOrderTemplateRequest,
  adminUpdateFakeOrderSettingsRequest,
  listAdminPlansRequest,
} from "../../services/api";

const DURATION_OPTIONS = [
  { value: "minutes", label: "دقائق" },
  { value: "hours", label: "ساعات" },
  { value: "days", label: "أيام" },
];

function parseFormDataNumber(fd, key) {
  const raw = String(fd.get(key) || "").replace(/,/g, ".").trim();
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

const PAGE_SIZE = 12;

const formatDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-JO");
};

const remainingLabel = (expiresAt) => {
  if (!expiresAt) return "—";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "منتهية";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${h} س ${m} د`;
};

export default function AdminFakeOrdersPage() {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState([]);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [templatesPagination, setTemplatesPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [templatePage, setTemplatePage] = useState(1);
  const [openSettingsModal, setOpenSettingsModal] = useState(false);
  const [openCreateWizard, setOpenCreateWizard] = useState(false);
  const [viewingTemplate, setViewingTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [roundTitle, setRoundTitle] = useState("");
  const [activeRound, setActiveRound] = useState(null);
  const categoryDistribution = settingsDraft?.categoryDistribution || { content: 30, programming: 50, design: 20 };
  const distributionTotal =
    Number(categoryDistribution.content || 0) +
    Number(categoryDistribution.programming || 0) +
    Number(categoryDistribution.design || 0);
  const distributionInvalid = distributionTotal !== 100;

  const loadBase = useCallback(async (page = templatePage) => {
    setBusy(true);
    try {
      const [pln, stg, tpl, roundsRes] = await Promise.all([
        listAdminPlansRequest(true),
        adminGetFakeOrderSettingsRequest(),
        adminListFakeOrderTemplatesRequest({ includeInactive: true, page, pageSize: PAGE_SIZE }),
        adminListFakeOrderRoundsRequest(),
      ]);
      setPlans(pln?.data?.plans || []);
      setSettingsDraft(stg?.data?.settings || null);
      setTemplates(tpl?.data?.templates || []);
      setTemplatesPagination(tpl?.data?.pagination || { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
      const rounds = roundsRes?.data?.rounds || [];
      const active = rounds.find((r) => String(r.status) === "active") || null;
      setActiveRound(active);
    } catch (e) {
      push({ type: "error", title: "تعذر تحميل إعدادات الطلبات التجريبية", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  }, [push, templatePage]);

  useEffect(() => {
    void loadBase(templatePage);
  }, [loadBase, templatePage]);

  const onSaveSettings = async () => {
    if (!settingsDraft) return;
    try {
      setBusy(true);
      await adminUpdateFakeOrderSettingsRequest({
        minOrders: Number(settingsDraft.minOrders),
        maxOrders: Number(settingsDraft.maxOrders),
        durationValue: Number(settingsDraft.durationValue),
        durationUnit: String(settingsDraft.durationUnit || "hours"),
        planIds: (settingsDraft.planIds || []).map(Number),
        showToAllFreelancers: Boolean(settingsDraft.showToAllFreelancers),
        categoryDistribution: {
          content: Number(categoryDistribution.content || 0),
          programming: Number(categoryDistribution.programming || 0),
          design: Number(categoryDistribution.design || 0),
        },
      });
      push({ type: "success", title: "تم حفظ الإعدادات" });
      setOpenSettingsModal(false);
      await loadBase(templatePage);
    } catch (e2) {
      push({ type: "error", title: "تعذر حفظ الإعدادات", message: e2?.response?.data?.message || e2?.message });
    } finally {
      setBusy(false);
    }
  };

  const onStartRound = async () => {
    if (distributionInvalid) {
      push({ type: "error", title: "نسب التصنيفات غير صحيحة", message: "يجب أن يكون مجموع النسب 100%." });
      return;
    }
    try {
      setBusy(true);
      const res = await adminCreateFakeOrderRoundRequest({
        title: String(roundTitle || "").trim() || undefined,
      });
      const generated = res?.data?.round?.generatedCount || res?.data?.generatedCount || "—";
      push({ type: "success", title: "تم بدء الجولة", message: `تم تفعيل ${generated} طلب تجريبي.` });
      await loadBase(templatePage);
    } catch (e) {
      push({ type: "error", title: "تعذر بدء الجولة", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onStopRound = async () => {
    if (!activeRound?.id) return;
    try {
      setBusy(true);
      await adminStopFakeOrderRoundRequest(activeRound.id);
      push({ type: "success", title: "تم إيقاف الجولة" });
      await loadBase(templatePage);
    } catch (e) {
      push({ type: "error", title: "تعذر إيقاف الجولة", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onCreateTemplateFromWizard = async (fd) => {
    const title = String(fd.get("title") || "").trim();
    const description = String(fd.get("description") || "").trim();
    const categoryId = Number(fd.get("categoryId"));
    const subSubcategoryId = fd.get("subSubcategoryId") ? Number(fd.get("subSubcategoryId")) : null;
    const durationValue = parseFormDataNumber(fd, "durationValue");
    const durationUnit = String(fd.get("durationUnit") || "days");
    const minBudget = parseFormDataNumber(fd, "bidBudgetMin");
    const maxBudget = parseFormDataNumber(fd, "bidBudgetMax");

    let skills = [];
    try {
      skills = JSON.parse(String(fd.get("preferredSkills") || "[]"));
    } catch {
      skills = [];
    }

    if (!title || !description || !(categoryId > 0) || !(durationValue > 0) || !(minBudget > 0) || !(maxBudget > 0)) {
      throw new Error("البيانات الأساسية غير مكتملة.");
    }
    if (maxBudget < minBudget) throw new Error("حد الميزانية الأعلى يجب أن يكون أكبر أو يساوي الحد الأدنى.");

    try {
      setBusy(true);
      await adminCreateFakeOrderTemplateRequest({
        title,
        description,
        categoryId,
        subSubcategoryId,
        minBudget,
        maxBudget,
        minDuration: Math.max(1, Math.floor(durationValue)),
        maxDuration: Math.max(1, Math.ceil(durationValue)),
        durationUnit,
        skills: Array.isArray(skills) ? skills : [],
      });
      push({ type: "success", title: "تم إنشاء الطلب التجريبي" });
      setOpenCreateWizard(false);
      setTemplatePage(1);
      await loadBase(1);
    } catch (e2) {
      push({ type: "error", title: "تعذر إنشاء الطلب التجريبي", message: e2?.response?.data?.message || e2?.message });
    } finally {
      setBusy(false);
    }
  };

  const onEditTemplateFromWizard = async (fd) => {
    if (!editingTemplate?.id) return;
    const payload = {
      title: String(fd.get("title") || "").trim(),
      description: String(fd.get("description") || "").trim(),
      categoryId: Number(fd.get("categoryId")),
      subSubcategoryId: fd.get("subSubcategoryId") ? Number(fd.get("subSubcategoryId")) : null,
      minBudget: Number(String(fd.get("bidBudgetMin") || "0").replace(/,/g, ".")),
      maxBudget: Number(String(fd.get("bidBudgetMax") || "0").replace(/,/g, ".")),
      minDuration: Math.max(1, Number(fd.get("durationValue") || 1)),
      maxDuration: Math.max(1, Number(fd.get("durationValue") || 1)),
      durationUnit: String(fd.get("durationUnit") || "days"),
    };
    let skills = [];
    try {
      skills = JSON.parse(String(fd.get("preferredSkills") || "[]"));
    } catch {
      skills = [];
    }
    payload.skills = Array.isArray(skills) ? skills : [];
    try {
      setBusy(true);
      await adminUpdateFakeOrderTemplateRequest(editingTemplate.id, payload);
      push({ type: "success", title: "تم تعديل الطلب التجريبي" });
      setEditingTemplate(null);
      await loadBase(templatePage);
    } catch (e) {
      push({ type: "error", title: "تعذر تعديل الطلب التجريبي", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onDeleteTemplate = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا الطلب التجريبي؟")) return;
    try {
      setBusy(true);
      await adminDeactivateFakeOrderTemplateRequest(id);
      push({ type: "success", title: "تم حذف الطلب التجريبي" });
      await loadBase(templatePage);
    } catch (e) {
      push({ type: "error", title: "تعذر حذف الطلب التجريبي", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onToggleTemplateActive = async (tpl) => {
    try {
      setBusy(true);
      await adminUpdateFakeOrderTemplateRequest(tpl.id, { isActive: !tpl.isActive });
      push({ type: "success", title: tpl.isActive ? "تم تعطيل الطلب التجريبي" : "تم تفعيل الطلب التجريبي" });
      await loadBase(templatePage);
    } catch (e) {
      push({ type: "error", title: "تعذر تحديث حالة الطلب التجريبي", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dash" dir="rtl">
      <header className="dash-hero">
        <h1>إدارة الطلبات التجريبية</h1>
      </header>

      <div className="dash-section">
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>إنشاء طلب تجريبي جديد</h3>
            <p style={{ margin: "8px 0 0" }}>نفس نموذج الطلب الحقيقي، بنوع مزايدة، ويتم تخزينه كطلب تجريبي فقط.</p>
          </div>
          <button className="btn btn-primary" type="button" onClick={() => setOpenCreateWizard(true)} disabled={busy}>
            إنشاء طلب تجريبي جديد
          </button>
        </div>
      </div>

      <div className="dash-section">
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>التحكم بجولة الطلبات التجريبية</h3>
            {activeRound ? (
              <p style={{ margin: "8px 0 0" }}>
                الجولة النشطة: {activeRound.title || `#${activeRound.id}`} — الوقت المتبقي: {remainingLabel(activeRound.expiresAt)}
              </p>
            ) : (
              <p style={{ margin: "8px 0 0" }}>لا توجد جولة نشطة الآن.</p>
            )}
          </div>
          {activeRound ? (
            <button className="btn btn-secondary" type="button" onClick={onStopRound} disabled={busy}>
              إيقاف جولة الطلبات التجريبية
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={onStartRound} disabled={busy}>
              بدء جولة الطلبات التجريبية
            </button>
          )}
        </div>
      </div>

      <div className="dash-section">
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>إعدادات الطلبات التجريبية</h3>
            <p style={{ margin: "8px 0 0" }}>ضبط إعدادات الجولة ثم بدء جولة لإظهار الطلبات التجريبية في الحوض.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => setOpenSettingsModal(true)} disabled={busy || !settingsDraft}>
            إعدادات الجولة / بدء جولة
          </button>
        </div>
      </div>

      <div className="dash-section">
        <div className="card fake-orders-table-wrap">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>جدول الطلبات التجريبية</h3>
            <span className="help">إجمالي: {templatesPagination.total || 0}</span>
          </div>
          <div className="fake-orders-table-scroll">
          <table className="table fake-orders-table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العنوان</th>
                <th>التصنيف</th>
                <th>التصنيف الفرعي</th>
                <th>الميزانية</th>
                <th>المدة</th>
                <th>الحالة</th>
                <th>تاريخ الإنشاء</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: "center" }}>لا توجد طلبات تجريبية حتى الآن.</td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.title}</td>
                    <td>{t.categoryName || `#${t.categoryId}`}</td>
                    <td>{t.subSubcategoryName || (t.subSubcategoryId ? `#${t.subSubcategoryId}` : "—")}</td>
                    <td dir="ltr">{`${t.minBudget} - ${t.maxBudget} JOD`}</td>
                    <td>{`${t.minDuration}${t.maxDuration !== t.minDuration ? ` - ${t.maxDuration}` : ""} ${t.durationUnit}`}</td>
                    <td>{t.isActive ? "نشط" : "غير نشط"}</td>
                    <td>{formatDateTime(t.createdAt)}</td>
                    <td>
                      <div className="fake-orders-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setViewingTemplate(t)}>عرض</button>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingTemplate(t)}>تعديل</button>
                      <button type="button" className="btn btn-secondary" onClick={() => onDeleteTemplate(t.id)}>حذف</button>
                      <button type="button" className="btn btn-secondary" onClick={() => onToggleTemplateActive(t)}>
                        {t.isActive ? "إيقاف" : "تفعيل"}
                      </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
            <button className="btn btn-secondary" type="button" disabled={templatePage <= 1} onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}>السابق</button>
            <span className="help">{`صفحة ${templatesPagination.page || 1} من ${templatesPagination.totalPages || 1}`}</span>
            <button className="btn btn-secondary" type="button" disabled={templatePage >= (templatesPagination.totalPages || 1)} onClick={() => setTemplatePage((p) => p + 1)}>التالي</button>
          </div>
        </div>
      </div>

      {openSettingsModal && settingsDraft ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpenSettingsModal(false)}>
          <div className="client-order-modal" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head"><h2 className="client-order-modal__title">إعدادات الطلبات التجريبية</h2></header>
            <div className="client-order-modal__body">
              <div className="auth-form-grid">
                <label className="auth-field"><span>الحد الأدنى للطلبات</span><input value={settingsDraft.minOrders || ""} onChange={(e) => setSettingsDraft((p) => ({ ...p, minOrders: e.target.value }))} /></label>
                <label className="auth-field"><span>الحد الأعلى للطلبات</span><input value={settingsDraft.maxOrders || ""} onChange={(e) => setSettingsDraft((p) => ({ ...p, maxOrders: e.target.value }))} /></label>
                <div className="auth-field" style={{ gridColumn: "1 / -1" }}>
                  <span>توزيع التصنيفات (%)</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                    <label>
                      <span className="help">المحتوى</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={categoryDistribution.content ?? 0}
                        onChange={(e) =>
                          setSettingsDraft((p) => ({
                            ...p,
                            categoryDistribution: { ...(p.categoryDistribution || {}), content: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="help">البرمجة</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={categoryDistribution.programming ?? 0}
                        onChange={(e) =>
                          setSettingsDraft((p) => ({
                            ...p,
                            categoryDistribution: { ...(p.categoryDistribution || {}), programming: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span className="help">التصميم</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={categoryDistribution.design ?? 0}
                        onChange={(e) =>
                          setSettingsDraft((p) => ({
                            ...p,
                            categoryDistribution: { ...(p.categoryDistribution || {}), design: Number(e.target.value || 0) },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="help" style={{ color: distributionInvalid ? "#b42318" : undefined }}>
                    المجموع الحالي: {distributionTotal}% {distributionInvalid ? "(يجب أن يساوي 100%)" : ""}
                  </div>
                </div>
                <label className="auth-field">
                  <span>مدة الظهور</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      type="number"
                      min="1"
                      value={settingsDraft.durationValue || 12}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, durationValue: Number(e.target.value || 1) }))}
                    />
                    <select value={String(settingsDraft.durationUnit || "hours")} onChange={(e) => setSettingsDraft((p) => ({ ...p, durationUnit: e.target.value }))}>
                      {DURATION_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                </label>
                <label className="auth-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.showToAllFreelancers)}
                    onChange={(e) => setSettingsDraft((p) => ({ ...p, showToAllFreelancers: e.target.checked }))}
                  />
                  <span>إظهار لجميع المستقلين (بدون تقييد الخطط)</span>
                </label>
                <div className="auth-field">
                  <span>الخطط المؤهلة</span>
                  <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid #ddd", borderRadius: 8, padding: 8, opacity: settingsDraft.showToAllFreelancers ? 0.55 : 1 }}>
                    {plans.map((p) => (
                      <label key={p.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          disabled={Boolean(settingsDraft.showToAllFreelancers)}
                          checked={(settingsDraft.planIds || []).includes(String(p.id))}
                          onChange={(e) =>
                            setSettingsDraft((prev) => ({
                              ...prev,
                              planIds: e.target.checked
                                ? [...new Set([...(prev.planIds || []), String(p.id)])]
                                : (prev.planIds || []).filter((x) => x !== String(p.id)),
                            }))
                          }
                        />
                        <span>{p.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <label className="auth-field">
                  <span>اسم الجولة (اختياري)</span>
                  <input value={roundTitle} onChange={(e) => setRoundTitle(e.target.value)} placeholder="مثال: جولة تدريب صباحية" />
                </label>
              </div>
            </div>
            <footer className="client-order-modal__foot">
              <button className="btn btn-secondary" type="button" onClick={() => setOpenSettingsModal(false)}>إغلاق</button>
              <button className="btn btn-primary" type="button" onClick={onSaveSettings} disabled={busy || distributionInvalid}>حفظ الإعدادات</button>
            </footer>
          </div>
        </div>
      ) : null}

      {openCreateWizard ? (
        <div
          className="client-order-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenCreateWizard(false);
          }}
        >
          <div
            className="client-order-modal client-order-modal--admin-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fake-order-create-title"
            dir="rtl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="client-order-modal__head">
              <h2 id="fake-order-create-title" className="client-order-modal__title">
                إنشاء طلب تجريبي جديد
              </h2>
              <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => setOpenCreateWizard(false)}>
                إغلاق
              </button>
            </header>
            <div className="client-order-modal__body client-order-modal__body--admin-wizard">
              <AdminInternalOrderWizard
                variant="modal"
                mode="fake_training"
                onSubmitFormData={onCreateTemplateFromWizard}
                onCreated={loadBase}
              />
            </div>
          </div>
        </div>
      ) : null}

      {viewingTemplate ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setViewingTemplate(null)}>
          <div className="client-order-modal" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head"><h2 className="client-order-modal__title">تفاصيل الطلب التجريبي</h2></header>
            <div className="client-order-modal__body" style={{ display: "grid", gap: 8 }}>
              <div><strong>ID:</strong> {viewingTemplate.id}</div>
              <div><strong>Title:</strong> {viewingTemplate.title}</div>
              <div><strong>Description:</strong> {viewingTemplate.description}</div>
              <div><strong>Category:</strong> {viewingTemplate.categoryName || `#${viewingTemplate.categoryId}`}</div>
              <div><strong>Subcategory:</strong> {viewingTemplate.subSubcategoryName || (viewingTemplate.subSubcategoryId ? `#${viewingTemplate.subSubcategoryId}` : "—")}</div>
              <div><strong>Budget:</strong> <span dir="ltr">{`${viewingTemplate.minBudget} - ${viewingTemplate.maxBudget} JOD`}</span></div>
              <div><strong>Duration:</strong> {`${viewingTemplate.minDuration}${viewingTemplate.maxDuration !== viewingTemplate.minDuration ? ` - ${viewingTemplate.maxDuration}` : ""} ${viewingTemplate.durationUnit}`}</div>
              <div><strong>Status:</strong> {viewingTemplate.isActive ? "نشط" : "غير نشط"}</div>
              <div><strong>Created:</strong> {formatDateTime(viewingTemplate.createdAt)}</div>
            </div>
            <footer className="client-order-modal__foot">
              <button className="btn btn-secondary" type="button" onClick={() => setViewingTemplate(null)}>إغلاق</button>
            </footer>
          </div>
        </div>
      ) : null}

      {editingTemplate ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setEditingTemplate(null)}>
          <div className="client-order-modal client-order-modal--admin-wizard" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head">
              <h2 className="client-order-modal__title">تعديل الطلب التجريبي</h2>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingTemplate(null)}>إغلاق</button>
            </header>
            <div className="client-order-modal__body client-order-modal__body--admin-wizard">
              <AdminInternalOrderWizard
                key={editingTemplate.id}
                variant="modal"
                mode="fake_training"
                initialValues={{
                  title: editingTemplate.title,
                  description: editingTemplate.description,
                  categoryId: editingTemplate.categoryId,
                  subSubcategoryId: editingTemplate.subSubcategoryId || "",
                  preferredSkills: editingTemplate.skills || [],
                  bidBudgetMin: editingTemplate.minBudget,
                  bidBudgetMax: editingTemplate.maxBudget,
                  durationValue: editingTemplate.minDuration,
                  durationUnit: editingTemplate.durationUnit || "days",
                }}
                onSubmitFormData={onEditTemplateFromWizard}
                onCreated={() => loadBase(templatePage)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
