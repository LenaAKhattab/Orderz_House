import { useEffect, useMemo, useState } from "react";
import {
  createPortalFinancialClaimRequest,
  getCategoriesRequest,
  listPortalDoneProjectsRequest,
  listPortalFinancialClaimsRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
}

function payoutWindowText(claim) {
  if (!claim?.actualCompletionDate) return "—";
  const d = new Date(claim.actualCompletionDate);
  if (!Number.isFinite(d.getTime())) return "—";
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const start = new Date(Date.UTC(ny, nm - 1, 1));
  const end = new Date(Date.UTC(ny, nm - 1, 10));
  return `${formatDate(start)} → ${formatDate(end)}`;
}

function claimGroupTitle(key) {
  if (key === "under_review") return "قيد المراجعة";
  if (key === "not_due") return "غير مستحقة بعد";
  if (key === "due") return "مستحقة للدفع";
  if (key === "paid") return "مدفوعة";
  return "مرفوضة / مجمدة / تحتاج مراجعة حضورية";
}

function mapStatusAr(status) {
  const s = String(status || "");
  if (s === "pending") return "قيد المراجعة";
  if (s === "accepted") return "مقبولة";
  if (s === "rejected") return "مرفوضة";
  if (s === "frozen") return "مجمدة";
  if (s === "requires_in_person_review") return "تحتاج مراجعة حضورية";
  if (s === "paid") return "مدفوعة";
  return s || "—";
}

function mapPayoutAr(status) {
  const s = String(status || "");
  if (s === "missing_completion_date") return "بدون تاريخ إنجاز";
  if (s === "not_due_yet") return "غير مستحقة بعد";
  if (s === "within_payout_window") return "داخل نافذة الاستحقاق";
  if (s === "late_after_payout_window") return "متأخرة بعد نافذة الاستحقاق";
  if (s === "paid") return "مدفوعة";
  return s || "—";
}

function mapPaymentStatusAr(status) {
  const s = String(status || "");
  if (s === "paid") return "مدفوع";
  if (s === "pending") return "قيد الانتظار";
  if (s === "unpaid") return "غير مدفوع";
  if (s === "not_required") return "غير مطلوب";
  if (s === "failed") return "فشل الدفع";
  if (s === "refunded") return "تم الاسترجاع";
  if (s === "skipped_by_admin") return "تم تجاوز الدفع (إدارة)";
  return s || "—";
}

function groupClaims(claims) {
  const grouped = {
    under_review: [],
    not_due: [],
    due: [],
    paid: [],
    blocked: [],
  };
  for (const c of claims) {
    if (c.status === "pending") {
      grouped.under_review.push(c);
      continue;
    }
    if (["rejected", "frozen", "requires_in_person_review"].includes(c.status)) {
      grouped.blocked.push(c);
      continue;
    }
    if (c.status === "paid" || c.payoutStatus === "paid") {
      grouped.paid.push(c);
      continue;
    }
    if (c.payoutStatus === "not_due_yet" || c.payoutStatus === "missing_completion_date") {
      grouped.not_due.push(c);
      continue;
    }
    grouped.due.push(c);
  }
  return grouped;
}

function extractDoneProjects(responseData) {
  const fromProjects = responseData?.data?.projects;
  if (Array.isArray(fromProjects)) return fromProjects;
  const fromDoneProjects = responseData?.data?.doneProjects;
  if (Array.isArray(fromDoneProjects)) return fromDoneProjects;
  return [];
}

export default function FreelancerFinancialClaimsPage() {
  const { push } = useToast();
  const [claims, setClaims] = useState([]);
  const [doneProjects, setDoneProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState("manual");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [searchDone, setSearchDone] = useState("");
  const [form, setForm] = useState({
    orderNumber: "",
    requestTitle: "",
    categoriesText: "",
    selectedCategoryIds: [],
    durationMinutes: "",
    actualCompletionDate: "",
  });

  const reload = async () => {
    setBusy(true);
    try {
      const [claimsRes, doneRes] = await Promise.all([
        listPortalFinancialClaimsRequest({}),
        listPortalDoneProjectsRequest({ q: searchDone, limit: 50 }),
      ]);
      setClaims(claimsRes?.data?.claims || []);
      setDoneProjects(extractDoneProjects(doneRes));
      const categoriesRes = await getCategoriesRequest();
      const categoryList = categoriesRes?.data?.categories || [];
      setCategories(Array.isArray(categoryList) ? categoryList : []);
    } catch (e) {
      push({ type: "error", title: "تعذر تحميل المطالبات", message: e?.response?.data?.message || e?.message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDone() {
      try {
        const res = await listPortalDoneProjectsRequest({ q: searchDone, limit: 50 });
        if (!cancelled) setDoneProjects(extractDoneProjects(res));
      } catch {
        if (!cancelled) setDoneProjects([]);
      }
    }
    loadDone();
    return () => {
      cancelled = true;
    };
  }, [searchDone]);

  const grouped = useMemo(() => groupClaims(claims), [claims]);

  const canSubmitClaim = useMemo(() => {
    if (submitting) return false;
    if (mode === "manual") {
      const hasOrderNumber = String(form.orderNumber || "").trim().length > 0;
      const hasTitle = String(form.requestTitle || "").trim().length > 0;
      const hasCategories = Array.isArray(form.selectedCategoryIds) && form.selectedCategoryIds.length > 0;
      const hasDuration = String(form.durationMinutes || "").trim().length > 0 && Number(form.durationMinutes) >= 0;
      const hasCompletionDate = String(form.actualCompletionDate || "").trim().length > 0;
      return hasOrderNumber && hasTitle && hasCategories && hasDuration && hasCompletionDate;
    }
    const hasProject = String(selectedProjectId || "").trim().length > 0;
    const hasAutoOrderNumber = String(form.orderNumber || "").trim().length > 0;
    const hasAutoTitle = String(form.requestTitle || "").trim().length > 0;
    const hasAutoCategories = String(form.categoriesText || "").trim().length > 0;
    const hasCompletionDate = String(form.actualCompletionDate || "").trim().length > 0;
    return hasProject && hasAutoOrderNumber && hasAutoTitle && hasAutoCategories && hasCompletionDate;
  }, [submitting, mode, form, selectedProjectId]);

  useEffect(() => {
    if (mode !== "done_project") return;
    const project = doneProjects.find((p) => String(p.projectId) === String(selectedProjectId));
    if (!project) return;
    setForm((prev) => ({
      ...prev,
      orderNumber: project.orderNumber || "",
      requestTitle: project.requestTitle || "",
      categoriesText: Array.isArray(project.categories) ? project.categories.join("، ") : "",
      durationMinutes:
        Number(project.durationMinutes) > 0 ? String(project.durationMinutes) : prev.durationMinutes || "",
      actualCompletionDate: project.actualCompletionDate || "",
    }));
  }, [mode, selectedProjectId, doneProjects]);

  const createClaim = async () => {
    setSubmitting(true);
    try {
      const payload =
        mode === "manual"
          ? {
              mode: "manual",
              orderNumber: form.orderNumber,
              requestTitle: form.requestTitle,
              categories: (form.selectedCategoryIds || [])
                .map((id) => categories.find((c) => String(c.id) === String(id))?.name)
                .filter(Boolean),
              durationMinutes: form.durationMinutes === "" ? 0 : Number(form.durationMinutes),
              actualCompletionDate: form.actualCompletionDate,
            }
          : {
              mode: "done_project",
              projectId: Number(selectedProjectId),
              durationMinutes: form.durationMinutes === "" ? null : Number(form.durationMinutes),
              actualCompletionDate: form.actualCompletionDate || null,
            };
      await createPortalFinancialClaimRequest(payload);
      push({ type: "success", title: "تم إنشاء المطالبة", message: "تم إرسال المطالبة المالية بنجاح." });
      setCreateOpen(false);
      setSelectedProjectId("");
      setForm({
        orderNumber: "",
        requestTitle: "",
        categoriesText: "",
        selectedCategoryIds: [],
        durationMinutes: "",
        actualCompletionDate: "",
      });
      await reload();
    } catch (e) {
      push({ type: "error", title: "تعذر إنشاء المطالبة", message: e?.response?.data?.message || e?.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="container page-content dash-shell">
      <div className="dash">
        <header className="dash-hero dash-hero--compact">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة المستقل</p>
            <h1 className="dash-hero__title">المطالبات المالية</h1>
            <p className="dash-hero__subtitle">أنشئ مطالبة جديدة، وتابع الحالات ونافذة الاستحقاق والمدفوع والمتبقي.</p>
          </div>
          <div className="dash-hero__badges">
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              مطالبة جديدة
            </button>
          </div>
        </header>

        {busy ? <div className="card">جارٍ التحميل...</div> : null}

        {!busy &&
          Object.entries(grouped).map(([groupKey, items]) => (
            <section key={groupKey} className="dash-section">
              <div className="dash-section__head">
                <h2 className="dash-section__title">{claimGroupTitle(groupKey)} ({items.length})</h2>
              </div>
              {items.length === 0 ? (
                <div className="dash-empty">
                  <div className="dash-empty__copy">
                    <h3 className="dash-empty__title">لا توجد عناصر</h3>
                  </div>
                </div>
              ) : (
                <div className="cards-grid cards-grid--max-3">
                  {items.map((claim) => (
                    <article key={claim.id} className="card">
                      <h3 style={{ marginTop: 0 }}>{claim.requestTitle}</h3>
                      <p>رقم الطلب: {claim.orderNumber}</p>
                      <p>الحالة: {mapStatusAr(claim.status)}</p>
                      <p>تاريخ الإنجاز الفعلي: {formatDate(claim.actualCompletionDate)}</p>
                      <p>تاريخ التقديم: {formatDate(claim.submittedAt)}</p>
                      <p>نافذة الاستحقاق: {payoutWindowText(claim)}</p>
                      <p>حالة الاستحقاق: {mapPayoutAr(claim.payoutStatus)}</p>
                      <p>السعر الإجمالي: {formatMoney(claim.totalPriceSnapshot)}</p>
                      <p>مستحق المستقل: {formatMoney(claim.userAmountSnapshot)}</p>
                      <p>المدفوع: {formatMoney(claim.paidAmount)}</p>
                      <p>المتبقي: {formatMoney(claim.remainingAmount)}</p>
                      {claim.adminNote ? <p>ملاحظة الإدارة: {claim.adminNote}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
      </div>

      {createOpen ? (
        <div className="client-order-modal-overlay" role="dialog" aria-modal="true">
          <div className="client-order-modal freelancer-claims-modal" style={{ width: "min(1120px,100%)" }}>
            <div className="client-order-modal__head" style={{ padding: "16px 18px", borderBottom: "1px solid rgba(56,82,180,.1)" }}>
              <h3 className="client-order-modal__title">مطالبة جديدة</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                إغلاق
              </button>
            </div>
            <div className="client-order-modal__body">
              <div className="freelancer-claims-modal__mode">
                <button
                  type="button"
                  className={`btn ${mode === "manual" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setMode("manual")}
                >
                  مطالبة لأوردر جديد يدويًا
                </button>
                <button
                  type="button"
                  className={`btn ${mode === "done_project" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setMode("done_project")}
                >
                  مطالبة من مشروع منجز
                </button>
              </div>

              {mode === "done_project" ? (
                <div className="card freelancer-claims-modal__done">
                  <label className="field">
                    <span>بحث في المشاريع المنجزة</span>
                    <input
                      className="input"
                      value={searchDone}
                      onChange={(e) => setSearchDone(e.target.value)}
                      placeholder="ابحث برقم الطلب أو العنوان..."
                    />
                  </label>
                  <label className="field" style={{ marginTop: 10 }}>
                    <span>اختر مشروعًا منجزًا</span>
                    <select
                      className="input"
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                    >
                      <option value="">اختر مشروعًا...</option>
                      {doneProjects.map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {(p.orderNumber || `#${p.projectId}`) + " — " + (p.requestTitle || "بدون عنوان")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedProjectId ? (
                    (() => {
                      const p = doneProjects.find((x) => String(x.projectId) === String(selectedProjectId));
                      if (!p) return null;
                      return (
                        <div className="help" style={{ marginTop: 8 }}>
                          {p.hasMissingCompletionDate
                            ? "هذا المشروع لا يحتوي على تاريخ إنجاز فعلي. أضف التاريخ قبل إنشاء المطالبة."
                            : `تاريخ الإنجاز: ${formatDate(p.actualCompletionDate)} | الحالة: ${p.orderStatus}`}
                          <br />
                          {`المصدر: ${p.sourceType || "—"} | الدفع: ${mapPaymentStatusAr(p.paymentStatus)} | المبلغ: ${
                            p.totalPriceSnapshot != null ? formatMoney(p.totalPriceSnapshot) : "—"
                          }${p.currencyCode ? ` ${p.currencyCode}` : ""}`}
                        </div>
                      );
                    })()
                  ) : null}
                </div>
              ) : null}

              <div className="freelancer-claims-modal__form">
                {mode === "manual" ? (
                  <label className="field">
                    <span>رقم الطلب</span>
                    <input
                      className="input"
                      value={form.orderNumber}
                      onChange={(e) => setForm((p) => ({ ...p, orderNumber: e.target.value }))}
                    />
                  </label>
                ) : (
                  <label className="field">
                    <span>رقم الطلب (من المشروع المنجز)</span>
                    <input className="input" value={form.orderNumber || "—"} readOnly disabled />
                  </label>
                )}
                {mode === "manual" ? (
                  <>
                    <label className="field">
                      <span>عنوان الطلب</span>
                      <input
                        className="input"
                        value={form.requestTitle}
                        onChange={(e) => setForm((p) => ({ ...p, requestTitle: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>التصنيفات (اختيار متعدد)</span>
                      <div className="freelancer-claims-modal__categories">
                        {categories.length === 0 ? (
                          <div className="help">لا توجد تصنيفات متاحة حالياً.</div>
                        ) : (
                          categories.map((cat) => {
                            const checked = (form.selectedCategoryIds || []).includes(String(cat.id));
                            return (
                              <label key={String(cat.id)} className="auth-category-item">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setForm((p) => {
                                      const current = Array.isArray(p.selectedCategoryIds) ? p.selectedCategoryIds : [];
                                      const next = e.target.checked
                                        ? Array.from(new Set([...current, String(cat.id)]))
                                        : current.filter((x) => String(x) !== String(cat.id));
                                      return { ...p, selectedCategoryIds: next };
                                    });
                                  }}
                                />
                                <span>{cat.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </label>
                    <label className="field">
                      <span>عدد الدقائق المنفذة</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={form.durationMinutes}
                        onChange={(e) => setForm((p) => ({ ...p, durationMinutes: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      <span>تاريخ الإنجاز الفعلي</span>
                      <input
                        className="input"
                        type="date"
                        value={form.actualCompletionDate}
                        onChange={(e) => setForm((p) => ({ ...p, actualCompletionDate: e.target.value }))}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>عنوان الطلب (من المشروع المنجز)</span>
                      <input className="input" value={form.requestTitle || "—"} readOnly disabled />
                    </label>
                    <label className="field">
                      <span>التصنيفات (من المشروع المنجز)</span>
                      <input className="input" value={form.categoriesText || "—"} readOnly disabled />
                    </label>
                    <label className="field">
                      <span>عدد الدقائق المنفذة (من المشروع المنجز)</span>
                      <input className="input" value={form.durationMinutes || "—"} readOnly disabled />
                    </label>
                    <label className="field">
                      <span>تاريخ الإنجاز الفعلي (من المشروع المنجز)</span>
                      <input className="input" value={form.actualCompletionDate || "—"} readOnly disabled />
                    </label>
                  </>
                )}
              </div>
            </div>
            <div className="client-order-modal__foot">
              <button type="button" className="btn btn-secondary" disabled={submitting} onClick={() => setCreateOpen(false)}>
                إغلاق
              </button>
              <button type="button" className="btn btn-primary" disabled={!canSubmitClaim} onClick={createClaim}>
                {submitting ? "جارٍ الإرسال..." : "إرسال المطالبة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
