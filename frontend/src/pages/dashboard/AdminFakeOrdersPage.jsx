import { useCallback, useEffect, useMemo, useState } from "react";
import AdminInternalOrderWizard from "../../components/orders/AdminInternalOrderWizard";
import { useToast } from "../../components/ui/toastContext";
import {
  adminCreateFakeOrderRoundRequest,
  adminCreateFakeOrderTemplateRequest,
  adminDeactivateFakeOrderTemplateRequest,
  adminGetFakeOrderRoundAnalyticsRequest,
  adminGetFakeOrderSettingsRequest,
  adminListFakeOrderRoundsRequest,
  adminListFakeOrderTemplatesRequest,
  adminStopFakeOrderRoundRequest,
  adminUpdateFakeOrderSettingsRequest,
  adminUpdateFakeOrderTemplateRequest,
  listAdminPlansRequest,
} from "../../services/api";

const PAGE_SIZE = 20;

const DURATION_OPTIONS = [
  { value: 1, label: "ساعة واحدة" },
  { value: 3, label: "3 ساعات" },
  { value: 6, label: "6 ساعات" },
  { value: 12, label: "12 ساعة" },
  { value: 24, label: "24 ساعة" },
];

const nf = new Intl.NumberFormat("en-US");
const formatNum = (v) => (Number.isFinite(Number(v)) ? nf.format(Number(v)) : "—");
const formatDateTime = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-JO");
};
const durationLabel = (count, unit) => {
  const n = Number(count) || 0;
  if (unit === "hours") return `المدة: ${formatNum(n)} ساعة`;
  if (unit === "minutes") return `المدة: ${formatNum(n)} دقيقة`;
  return `المدة: ${formatNum(n)} يوم`;
};
const remainingLabel = (expiresAt) => {
  if (!expiresAt) return "—";
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "منتهية";
  const h = Math.floor(diff / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${formatNum(h)} س ${formatNum(m)} د`;
};

export default function AdminFakeOrdersPage() {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templatesPagination, setTemplatesPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
  const [templatePage, setTemplatePage] = useState(1);
  const [rounds, setRounds] = useState([]);
  const [plans, setPlans] = useState([]);
  const [selectedRoundAnalytics, setSelectedRoundAnalytics] = useState(null);
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [openSettingsModal, setOpenSettingsModal] = useState(false);
  const [openTemplateWizard, setOpenTemplateWizard] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [openStartRoundModal, setOpenStartRoundModal] = useState(false);
  const [startRound, setStartRound] = useState({ title: "", templateIds: [] });

  const loadBase = useCallback(async (page = templatePage) => {
    setBusy(true);
    try {
      const [tpl, rnd, pln, stg] = await Promise.all([
        adminListFakeOrderTemplatesRequest({ includeInactive: true, page, pageSize: PAGE_SIZE }),
        adminListFakeOrderRoundsRequest(),
        listAdminPlansRequest(true),
        adminGetFakeOrderSettingsRequest(),
      ]);
      setTemplates(tpl?.data?.templates || []);
      setTemplatesPagination(tpl?.data?.pagination || { page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });
      setRounds(rnd?.data?.rounds || []);
      setPlans(pln?.data?.plans || []);
      setSettingsDraft(stg?.data?.settings || null);
    } catch (e) {
      push({ type: "error", title: "تعذر تحميل بيانات الطلبات التجريبية", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  }, [push, templatePage]);

  useEffect(() => {
    loadBase(templatePage);
  }, [loadBase, templatePage]);

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
      push({ type: "success", title: "تم إنشاء قالب تدريبي" });
      setOpenTemplateWizard(false);
      await loadBase();
    } catch (e2) {
      push({ type: "error", title: "تعذر إنشاء القالب", message: e2?.response?.data?.message || e2?.message });
    } finally {
      setBusy(false);
    }
  };

  const onSaveSettings = async () => {
    if (!settingsDraft) return;
    try {
      setBusy(true);
      await adminUpdateFakeOrderSettingsRequest({
        minOrders: Number(settingsDraft.minOrders),
        maxOrders: Number(settingsDraft.maxOrders),
        durationHours: Number(settingsDraft.durationHours),
        planIds: (settingsDraft.planIds || []).map(Number),
        showFakeBadgeToFreelancers: Boolean(settingsDraft.showFakeBadgeToFreelancers),
        expiryBehavior: settingsDraft.expiryBehavior || "expire",
      });
      push({ type: "success", title: "تم حفظ الإعدادات" });
      setOpenSettingsModal(false);
      await loadBase();
    } catch (e2) {
      push({ type: "error", title: "تعذر حفظ الإعدادات", message: e2?.response?.data?.message || e2?.message });
    } finally {
      setBusy(false);
    }
  };

  const onStartRound = async () => {
    if (!startRound.templateIds.length) {
      push({ type: "error", title: "اختر القوالب", message: "يرجى اختيار قالب واحد على الأقل." });
      return;
    }
    try {
      setBusy(true);
      const res = await adminCreateFakeOrderRoundRequest({
        title: String(startRound.title || "").trim() || undefined,
        templateIds: startRound.templateIds.map(Number),
      });
      const generated = res?.data?.round?.generatedCount || res?.data?.generatedCount || "—";
      push({ type: "success", title: "تم بدء الجولة", message: `تم توليد ${generated} طلب` });
      setOpenStartRoundModal(false);
      setStartRound({ title: "", templateIds: [] });
      await loadBase();
    } catch (e) {
      push({ type: "error", title: "تعذر بدء الجولة", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onStopRound = async (id) => {
    try {
      setBusy(true);
      await adminStopFakeOrderRoundRequest(id);
      await loadBase();
    } catch (e) {
      push({ type: "error", title: "تعذر إيقاف الجولة", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const groupedRounds = useMemo(() => {
    const active = rounds.filter((r) => r.status === "active");
    const ended = rounds.filter((r) => r.status !== "active");
    return { active, ended };
  }, [rounds]);

  const fetchRoundAnalytics = useCallback(
    async (roundId) => {
      try {
        const res = await adminGetFakeOrderRoundAnalyticsRequest(roundId);
        setSelectedRoundAnalytics(res?.data || null);
      } catch (e) {
        push({ type: "error", title: "تعذر تحميل التحليلات", message: e?.response?.data?.message || e?.message });
      }
    },
    [push],
  );

  const onToggleTemplateActive = async (tpl) => {
    try {
      setBusy(true);
      await adminUpdateFakeOrderTemplateRequest(tpl.id, { isActive: !tpl.isActive });
      await loadBase();
    } catch (e) {
      push({ type: "error", title: "تعذر تحديث حالة القالب", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  const onDeleteTemplate = async (id) => {
    if (!window.confirm("هل أنت متأكد من حذف هذا القالب؟")) return;
    try {
      setBusy(true);
      await adminDeactivateFakeOrderTemplateRequest(id);
      await loadBase();
    } catch (e) {
      push({ type: "error", title: "تعذر حذف القالب", message: e?.response?.data?.message || e?.message });
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
      push({ type: "success", title: "تم تعديل القالب" });
      setEditingTemplate(null);
      await loadBase();
    } catch (e) {
      push({ type: "error", title: "تعذر تعديل القالب", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="dash">
      <header className="dash-hero">
        <h1>إدارة الطلبات التجريبية</h1>
        <p>إدارة جولات المزايدة التدريبية المنفصلة عن الطلبات الحقيقية.</p>
      </header>

      <div className="dash-section">
        <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>أ) الإعدادات العامة</h3>
            <p style={{ margin: "8px 0 0" }}>الإعدادات الافتراضية لكل الجولات: العدد، المدة، الخطط، الشارة، وسلوك الانتهاء.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" type="button" onClick={() => setOpenSettingsModal(true)} disabled={busy}>
              إعدادات الطلبات التجريبية
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setOpenStartRoundModal(true)} disabled={busy}>
              بدء جولة جديدة
            </button>
          </div>
        </div>
      </div>

      <div className="dash-section">
        <h3>ب) القوالب المحفوظة</h3>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <button className="btn btn-primary" type="button" onClick={() => setOpenTemplateWizard(true)}>إضافة قالب طلب تجريبي</button>
            <div>الإجمالي: {formatNum(templatesPagination.total)}</div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th><th>العنوان</th><th>التصنيف</th><th>الميزانية</th><th>المدة</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.title}</td>
                    <td>{t.categoryName || `#${t.categoryId}`}</td>
                    <td><span dir="ltr">{`${formatNum(t.minBudget)} - ${formatNum(t.maxBudget)} JOD`}</span></td>
                    <td>{durationLabel(t.minDuration, t.durationUnit).replace("المدة: ", "")}</td>
                    <td>{t.isActive ? "نشط" : "معطل"}</td>
                    <td>{formatDateTime(t.createdAt)}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <button className="btn btn-secondary" type="button" onClick={() => setEditingTemplate(t)}>تعديل</button>
                      <button className="btn btn-secondary" type="button" onClick={() => onDeleteTemplate(t.id)}>حذف</button>
                      <button className="btn btn-secondary" type="button" onClick={() => onToggleTemplateActive(t)}>
                        {t.isActive ? "تعطيل" : "تفعيل"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
            <button className="btn btn-secondary" type="button" disabled={templatePage <= 1} onClick={() => setTemplatePage((p) => Math.max(1, p - 1))}>السابق</button>
            <span>{`صفحة ${templatesPagination.page} من ${templatesPagination.totalPages}`}</span>
            <button className="btn btn-secondary" type="button" disabled={templatePage >= templatesPagination.totalPages} onClick={() => setTemplatePage((p) => p + 1)}>التالي</button>
          </div>
        </div>
      </div>

      <div className="dash-section">
        <h3>ج) الجولات النشطة</h3>
        <div className="cards-grid">
          {groupedRounds.active.map((r) => (
            <article className="card" key={r.id}>
              <strong>{r.title}</strong>
              <div>عدد الطلبات المولدة: {formatNum(r.generatedCount)}</div>
              <div>المدة: {formatNum(r.durationHours)} ساعة</div>
              <div>الوقت المتبقي: {remainingLabel(r.expiresAt)}</div>
              <div>الحالة: {r.status}</div>
              <div>إجمالي العروض: {formatNum(r.totalBids)}</div>
              <div>عدد المستقلين المشاركين: {formatNum(r.uniqueFreelancers)}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" type="button" onClick={() => fetchRoundAnalytics(r.id)}>عرض التفاصيل</button>
                <button className="btn btn-secondary" type="button" onClick={() => fetchRoundAnalytics(r.id)}>التحليلات</button>
                <button className="btn btn-primary" type="button" onClick={() => onStopRound(r.id)} disabled={busy}>إيقاف الجولة</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="dash-section">
        <h3>الجولات المنتهية/الموقوفة</h3>
        <div className="cards-grid">
          {groupedRounds.ended.map((r) => (
            <article className="card" key={r.id}>
              <strong>{r.title}</strong>
              <div>الحالة: {r.status}</div>
              <div>الطلبات المولدة: {formatNum(r.generatedCount)}</div>
              <div>انتهت عند: {formatDateTime(r.expiresAt)}</div>
              <button className="btn btn-secondary" type="button" onClick={() => fetchRoundAnalytics(r.id)}>عرض التفاصيل</button>
            </article>
          ))}
        </div>
      </div>

      {selectedRoundAnalytics?.round ? (
        <div className="dash-section">
          <h3>د) التحليلات: {selectedRoundAnalytics.round.title}</h3>
          <div className="cards-grid">
            <div className="card">
              <strong>الإحصائيات</strong>
              <div>العروض الكلية: {formatNum(selectedRoundAnalytics.analytics?.totalBids ?? 0)}</div>
              <div>مستقلون فريدون: {formatNum(selectedRoundAnalytics.analytics?.uniqueFreelancers ?? 0)}</div>
              <div>متوسط العرض: {formatNum(selectedRoundAnalytics.analytics?.averageBid)} JOD</div>
              <div>أعلى عرض: {formatNum(selectedRoundAnalytics.analytics?.maxBid)} JOD</div>
              <div>أدنى عرض: {formatNum(selectedRoundAnalytics.analytics?.minBid)} JOD</div>
            </div>
          </div>
          <h4 style={{ marginTop: 16 }}>طلبات الجولة</h4>
          <div className="cards-grid">
            {(selectedRoundAnalytics.orders || []).map((o) => (
              <article className="card" key={o.id}>
                <strong>{o.title}</strong>
                <div>{o.orderCode}</div>
                <div>العروض: {o.bidsCount}</div>
                <div>الحالة: {o.fakeStatus}</div>
                <div style={{ marginTop: 10 }}>
                  <strong>تفاصيل العروض</strong>
                  {(selectedRoundAnalytics.analytics?.bidsByOrder?.[o.id] || []).map((bid) => (
                    <div key={bid.bidId} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                      <div>{`${bid.freelancer?.firstName || ""} ${bid.freelancer?.fatherName || ""} ${bid.freelancer?.familyName || ""}`.trim()}</div>
                      <div>{bid.freelancer?.email || "—"} • {bid.freelancer?.accountId || bid.freelancer?.id}</div>
                      <div>المبلغ: {bid.amount} JOD</div>
                      <div>الرسالة: {bid.message || "—"}</div>
                      <div>التاريخ: {formatDate(bid.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {openSettingsModal && settingsDraft ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpenSettingsModal(false)}>
          <div className="client-order-modal" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head"><h2 className="client-order-modal__title">إعدادات الطلبات التجريبية</h2></header>
            <div className="client-order-modal__body">
              <div className="auth-form-grid">
                <label className="auth-field"><span>الحد الأدنى للطلبات</span><input value={settingsDraft.minOrders || ""} onChange={(e) => setSettingsDraft((p) => ({ ...p, minOrders: e.target.value }))} /></label>
                <label className="auth-field"><span>الحد الأعلى للطلبات</span><input value={settingsDraft.maxOrders || ""} onChange={(e) => setSettingsDraft((p) => ({ ...p, maxOrders: e.target.value }))} /></label>
                <label className="auth-field">
                  <span>مدة الظهور</span>
                  <select value={String(settingsDraft.durationHours || 12)} onChange={(e) => setSettingsDraft((p) => ({ ...p, durationHours: Number(e.target.value) }))}>
                    {DURATION_OPTIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                </label>
                <label className="auth-field">
                  <span>سلوك الانتهاء</span>
                  <select value={settingsDraft.expiryBehavior || "expire"} onChange={(e) => setSettingsDraft((p) => ({ ...p, expiryBehavior: e.target.value }))}>
                    <option value="expire">منتهية</option>
                    <option value="stop">موقوفة</option>
                  </select>
                </label>
                <div className="auth-field">
                  <span>الخطط المؤهلة</span>
                  <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8, background: "var(--background)" }}>
                    {plans.map((p) => (
                      <label key={p.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                        <input
                          type="checkbox"
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
                <label className="auth-field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={Boolean(settingsDraft.showFakeBadgeToFreelancers)}
                    onChange={(e) => setSettingsDraft((p) => ({ ...p, showFakeBadgeToFreelancers: e.target.checked }))}
                  />
                  <span>إظهار شارة فرصة تدريبية للمستقلين</span>
                </label>
              </div>
            </div>
            <footer className="client-order-modal__foot">
              <button className="btn btn-secondary" type="button" onClick={() => setOpenSettingsModal(false)}>إغلاق</button>
              <button className="btn btn-primary" type="button" onClick={onSaveSettings} disabled={busy}>حفظ الإعدادات</button>
            </footer>
          </div>
        </div>
      ) : null}

      {openStartRoundModal ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpenStartRoundModal(false)}>
          <div className="client-order-modal" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head"><h2 className="client-order-modal__title">بدء جولة جديدة</h2></header>
            <div className="client-order-modal__body">
              <label className="auth-field"><span>اسم الجولة (اختياري)</span><input value={startRound.title} onChange={(e) => setStartRound((p) => ({ ...p, title: e.target.value }))} /></label>
              <div className="auth-field">
                <span>القوالب المستخدمة</span>
                <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8, background: "var(--background)" }}>
                  {templates.filter((t) => t.isActive).map((t) => (
                    <label key={t.id} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={startRound.templateIds.includes(String(t.id))}
                        onChange={(e) =>
                          setStartRound((prev) => ({
                            ...prev,
                            templateIds: e.target.checked
                              ? [...new Set([...prev.templateIds, String(t.id)])]
                              : prev.templateIds.filter((x) => x !== String(t.id)),
                          }))
                        }
                      />
                      <span>{t.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <footer className="client-order-modal__foot">
              <button className="btn btn-secondary" type="button" onClick={() => setOpenStartRoundModal(false)}>إغلاق</button>
              <button className="btn btn-primary" type="button" onClick={onStartRound} disabled={busy}>بدء جولة جديدة</button>
            </footer>
          </div>
        </div>
      ) : null}

      {openTemplateWizard ? (
        <div
          className="client-order-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpenTemplateWizard(false);
          }}
        >
          <div
            className="client-order-modal client-order-modal--admin-wizard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fake-order-template-title"
            dir="rtl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="client-order-modal__head">
              <h2 id="fake-order-template-title" className="client-order-modal__title">
                إنشاء قالب طلب تجريبي
              </h2>
              <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => setOpenTemplateWizard(false)}>
                إغلاق
              </button>
            </header>
            <div className="client-order-modal__body client-order-modal__body--admin-wizard">
              <AdminInternalOrderWizard variant="modal" mode="fake_training" onCreated={loadBase} onSubmitFormData={onCreateTemplateFromWizard} />
            </div>
          </div>
        </div>
      ) : null}

      {editingTemplate ? (
        <div className="client-order-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setEditingTemplate(null)}>
          <div className="client-order-modal client-order-modal--admin-wizard" role="dialog" aria-modal="true" dir="rtl" onMouseDown={(e) => e.stopPropagation()}>
            <header className="client-order-modal__head">
              <h2 className="client-order-modal__title">تعديل قالب طلب تجريبي</h2>
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
                onCreated={loadBase}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
