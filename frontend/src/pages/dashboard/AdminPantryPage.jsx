import { useCallback, useEffect, useMemo, useState } from "react";
import {
  acceptAdminPantryBidRequest,
  approveAdminPantryDeliveryRequest,
  createAdminPantryRequestRequest,
  getAdminPantryRequestRequest,
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
  listAdminPantryDeliveriesRequest,
  listAdminPantryRequestsRequest,
  publishAdminPantryRequestRequest,
  rejectAdminPantryBidRequest,
  requestRevisionAdminPantryDeliveryRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import "./pantryPages.css";

const STATUS_LABELS = {
  draft: "مسودة",
  open_for_bids: "مفتوح للعروض",
  assigned: "مُسند",
  in_progress: "قيد التنفيذ",
  submitted: "بانتظار المراجعة",
  revision_requested: "طلب تعديل",
  approved: "جاهز في بيت المونة",
  archived: "مؤرشف",
};

const EMPTY_FORM = {
  title: "",
  description: "",
  categoryId: "",
  subSubcategoryId: "",
  pricingType: "fixed",
  fixedBudget: "",
  budgetMin: "",
  budgetMax: "",
  deliveryDays: "",
  skillsText: "",
  requirements: "",
  attachmentUrl: "",
  attachmentName: "",
  internalNotes: "",
  publish: true,
  applicationBidCost: "1",
  targetApplicantCount: "",
  applicationDeadlineAt: "",
  eligibleTiers: { starter: false, silver: false, pro: false, elite: false },
};

function formatBudget(row) {
  if (row.pricingType === "bidding" || (row.budgetMin != null || row.budgetMax != null)) {
    if (row.fixedBudget != null && row.pricingType !== "bidding") return `${row.fixedBudget}`;
    return `${row.budgetMin ?? "—"} – ${row.budgetMax ?? "—"}`;
  }
  if (row.fixedBudget != null) return `${row.fixedBudget}`;
  return "—";
}

function apiErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (data?.fieldErrors && typeof data.fieldErrors === "object") {
    const first = Object.values(data.fieldErrors).find(Boolean);
    if (first) return String(first);
  }
  return data?.message || fallback;
}

export default function AdminPantryPage() {
  const toast = useToast();
  const [tab, setTab] = useState("requests");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [requestsError, setRequestsError] = useState(null);
  const [deliveriesError, setDeliveriesError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [categories, setCategories] = useState([]);
  const [subSubs, setSubSubs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [integrationActive, setIntegrationActive] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setRequestsError(null);
    setDeliveriesError(null);
    const reqPromise = listAdminPantryRequestsRequest()
      .then((reqRes) => {
        setRequests(reqRes?.data?.requests || []);
        setStats(reqRes?.data?.stats || null);
        setIntegrationActive(Boolean(reqRes?.data?.pantryMembershipBidIntegrationActive));
      })
      .catch((err) => {
        setRequests([]);
        setStats(null);
        const msg = apiErrorMessage(err, "تعذر تحميل طلبات بيت المونة");
        setRequestsError(msg);
        toast?.error?.(msg);
      });

    const delPromise = listAdminPantryDeliveriesRequest()
      .then((delRes) => {
        setDeliveries(delRes?.data?.deliveries || []);
      })
      .catch((err) => {
        setDeliveries([]);
        const msg = apiErrorMessage(err, "تعذر تحميل منجزات بيت المونة");
        setDeliveriesError(msg);
        // Do not toast again if requests already failed with same schema message
      });

    await Promise.allSettled([reqPromise, delPromise]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategoriesRequest();
        if (!cancelled) setCategories(res?.data || []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate]);

  useEffect(() => {
    if (!form.categoryId) {
      setSubSubs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategorySubSubcategoriesRequest(form.categoryId);
        const list = res?.data || res?.subSubcategories || res || [];
        if (!cancelled) setSubSubs(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setSubSubs([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.categoryId]);

  const openDetail = async (id) => {
    setSelectedId(id);
    try {
      const res = await getAdminPantryRequestRequest(id);
      setDetail(res?.data || null);
      if (res?.data?.pantryMembershipBidIntegrationActive != null) {
        setIntegrationActive(Boolean(res.data.pantryMembershipBidIntegrationActive));
      }
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "تعذر فتح الطلب"));
    }
  };

  const validateClient = () => {
    const errors = {};
    if (String(form.title || "").trim().length < 2) {
      errors.title = "عنوان المشروع مطلوب (حرفان على الأقل).";
    }
    if (String(form.description || "").trim().length < 10) {
      errors.description = "وصف المشروع مطلوب (10 أحرف على الأقل).";
    }
    if (!String(form.categoryId || "").trim()) {
      errors.categoryId = "يرجى اختيار التصنيف.";
    }
    if (!["fixed", "bidding"].includes(form.pricingType)) {
      errors.pricingType = "اختر نوع الطلب.";
    }
    if (form.pricingType === "fixed") {
      if (!(Number(form.fixedBudget) > 0)) {
        errors.fixedBudget = "يرجى إدخال ميزانية ثابتة صحيحة أكبر من 0.";
      }
      if (!(Number(form.deliveryDays) > 0)) {
        errors.deliveryDays = "مدة التنفيذ مطلوبة لطلبات الميزانية الثابتة.";
      }
    } else {
      const min = form.budgetMin === "" ? null : Number(form.budgetMin);
      const max = form.budgetMax === "" ? null : Number(form.budgetMax);
      if (min != null && !(Number.isFinite(min) && min >= 0)) {
        errors.budgetMin = "الحد الأدنى للميزانية غير صالح.";
      }
      if (max != null && !(Number.isFinite(max) && max >= 0)) {
        errors.budgetMax = "الحد الأعلى للميزانية غير صالح.";
      }
      if (min != null && max != null && min > max) {
        errors.budgetMax = "الحد الأعلى يجب أن يكون أكبر من أو يساوي الحد الأدنى.";
      }
    }
    return errors;
  };

  const createRequest = async (e) => {
    e.preventDefault();
    const errors = validateClient();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      toast?.error?.(Object.values(errors)[0]);
      return;
    }

    const selectedSs = subSubs.find((ss) => String(ss.id) === String(form.subSubcategoryId));
    const inferredSubcat =
      selectedSs?.subcategoryId != null
        ? Number(selectedSs.subcategoryId)
        : selectedSs?.subcategory_id != null
          ? Number(selectedSs.subcategory_id)
          : null;

    const attachments = [];
    if (String(form.attachmentUrl || "").trim()) {
      attachments.push({
        fileUrl: String(form.attachmentUrl).trim(),
        fileName: String(form.attachmentName || "").trim() || "file",
      });
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      categoryId: Number(form.categoryId),
      subcategoryId: Number.isFinite(inferredSubcat) && inferredSubcat > 0 ? inferredSubcat : null,
      subSubcategoryId: form.subSubcategoryId ? Number(form.subSubcategoryId) : null,
      pricingType: form.pricingType,
      fixedBudget: form.pricingType === "fixed" ? Number(form.fixedBudget) : null,
      budgetMin: form.pricingType === "bidding" && form.budgetMin !== "" ? Number(form.budgetMin) : null,
      budgetMax: form.pricingType === "bidding" && form.budgetMax !== "" ? Number(form.budgetMax) : null,
      deliveryDays: form.deliveryDays !== "" ? Number(form.deliveryDays) : null,
      skills: form.skillsText,
      requirements: form.requirements.trim() || null,
      attachments,
      internalNotes: form.internalNotes.trim() || null,
      publish: Boolean(form.publish),
    };
    if (integrationActive) {
      payload.applicationBidCost = form.applicationBidCost !== "" ? Number(form.applicationBidCost) : null;
      payload.targetApplicantCount =
        form.targetApplicantCount !== "" ? Number(form.targetApplicantCount) : null;
      payload.applicationDeadlineAt = form.applicationDeadlineAt || null;
      const codes = Object.entries(form.eligibleTiers || {})
        .filter(([, on]) => on)
        .map(([code]) => code);
      payload.eligibleTierCodes = codes.length ? codes : null;
    }

    setSaving(true);
    try {
      await createAdminPantryRequestRequest(payload);
      toast?.success?.("تم إنشاء الطلب");
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setFieldErrors({});
      await loadList();
    } catch (err) {
      const fe = err?.response?.data?.fieldErrors;
      if (fe && typeof fe === "object") setFieldErrors(fe);
      toast?.error?.(apiErrorMessage(err, "فشل الإنشاء"));
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async (id) => {
    try {
      await publishAdminPantryRequestRequest(id);
      toast?.success?.("تم نشر الطلب للعروض");
      await loadList();
      if (selectedId === id) await openDetail(id);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "فشل النشر"));
    }
  };

  const onAcceptBid = async (bidId) => {
    try {
      await acceptAdminPantryBidRequest(selectedId, bidId);
      toast?.success?.("تم قبول العرض");
      await loadList();
      await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "فشل قبول العرض"));
    }
  };

  const onRejectBid = async (bidId) => {
    try {
      await rejectAdminPantryBidRequest(selectedId, bidId);
      toast?.success?.("تم رفض العرض");
      await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "فشل رفض العرض"));
    }
  };

  const onApproveDelivery = async (deliveryId, archive = false) => {
    try {
      await approveAdminPantryDeliveryRequest(deliveryId, { archive });
      toast?.success?.(archive ? "تمت الأرشفة" : "تم الاعتماد — جاهز في بيت المونة");
      await loadList();
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "فشل الاعتماد"));
    }
  };

  const onRequestRevision = async (deliveryId) => {
    const feedback = window.prompt("ملاحظات التعديل للأدمن:") || "";
    try {
      await requestRevisionAdminPantryDeliveryRequest(deliveryId, { feedback });
      toast?.success?.("تم طلب التعديل");
      await loadList();
      if (selectedId) await openDetail(selectedId);
    } catch (err) {
      toast?.error?.(apiErrorMessage(err, "فشل طلب التعديل"));
    }
  };

  const statsCards = useMemo(
    () => [
      { label: "مفتوحة للعروض", value: stats?.openCount ?? 0 },
      { label: "قيد التنفيذ", value: stats?.inProgressCount ?? 0 },
      { label: "بانتظار المراجعة", value: stats?.pendingReviewCount ?? 0 },
      { label: "منجزات معتمدة", value: stats?.approvedCount ?? 0 },
    ],
    [stats],
  );

  const categoryOptions = useMemo(
    () =>
      (categories || []).map((c) => ({
        id: String(c.id),
        label: c.nameAr || c.name_ar || c.name || c.title || `#${c.id}`,
      })),
    [categories],
  );

  return (
    <div className="pantry-page" dir="rtl">
      <header className="pantry-page__header">
        <div>
          <h1>بيت المونة</h1>
          <p>طلبات داخلية متكررة تُخزَّن بعد الاعتماد لاستخدامها لاحقاً. بدون دفع Stripe وبدون طلب عميل.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setShowCreate(true)}>
          إنشاء طلب جديد
        </button>
      </header>

      <div className="pantry-page__tabs">
        <button
          type="button"
          className={tab === "requests" ? "is-active" : ""}
          onClick={() => setTab("requests")}
        >
          طلبات بيت المونة
        </button>
        <button
          type="button"
          className={tab === "deliveries" ? "is-active" : ""}
          onClick={() => setTab("deliveries")}
        >
          منجزات بيت المونة
        </button>
      </div>

      {tab === "requests" && (
        <>
          <div className="pantry-stats">
            {statsCards.map((c) => (
              <div key={c.label} className="pantry-stats__card">
                <span>{c.label}</span>
                <strong>{c.value}</strong>
              </div>
            ))}
          </div>

          {requestsError && (
            <div className="pantry-banner pantry-banner--warn" role="alert">
              {requestsError}
            </div>
          )}

          {loading ? (
            <p>جاري التحميل…</p>
          ) : (
            <div className="pantry-table-wrap">
              <table className="pantry-table">
                <thead>
                  <tr>
                    <th>العنوان</th>
                    <th>النوع</th>
                    <th>الحالة</th>
                    <th>الميزانية</th>
                    <th>عدد العروض</th>
                    {integrationActive ? <th>تكلفة التقديم</th> : null}
                    <th>الفريلانسر</th>
                    <th>تاريخ الإنشاء</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((row) => (
                    <tr key={row.id}>
                      <td>{row.title}</td>
                      <td>{row.pricingType === "bidding" ? "عروض" : "ثابت"}</td>
                      <td>{STATUS_LABELS[row.status] || row.status}</td>
                      <td>{formatBudget(row)}</td>
                      <td>
                        {integrationActive && row.targetApplicantCount != null
                          ? `${row.validApplicantCount ?? 0} / ${row.targetApplicantCount}`
                          : row.bidsCount ?? 0}
                      </td>
                      {integrationActive ? <td>{row.applicationBidCost ?? 1}</td> : null}
                      <td>{row.assignedFreelancerName || "—"}</td>
                      <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString("ar") : "—"}</td>
                      <td className="pantry-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openDetail(row.id)}>
                          عرض
                        </button>
                        {row.status === "draft" && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onPublish(row.id)}>
                            نشر
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!requests.length && (
                    <tr>
                      <td colSpan={integrationActive ? 9 : 8}>{requestsError ? "—" : "لا توجد طلبات بعد."}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "deliveries" && (
        <>
          {deliveriesError && (
            <div className="pantry-banner pantry-banner--warn" role="alert">
              {deliveriesError}
            </div>
          )}
          <div className="pantry-table-wrap">
            <table className="pantry-table">
              <thead>
                <tr>
                  <th>عنوان الطلب</th>
                  <th>الفريلانسر</th>
                  <th>الحالة</th>
                  <th>تاريخ التسليم</th>
                  <th>الملفات</th>
                  <th>ملاحظات الأدمن</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.requestTitle}</td>
                    <td>{d.freelancerName || d.freelancerId}</td>
                    <td>{STATUS_LABELS[d.status] || d.status}</td>
                    <td>{d.createdAt ? new Date(d.createdAt).toLocaleString("ar") : "—"}</td>
                    <td>
                      {(d.files || []).map((f) => (
                        <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                      ))}
                      {!d.files?.length && "—"}
                    </td>
                    <td>{d.adminFeedback || "—"}</td>
                    <td className="pantry-actions">
                      {d.status === "submitted" && (
                        <>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => onApproveDelivery(d.id)}>
                            اعتماد التسليم
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRequestRevision(d.id)}>
                            طلب تعديل
                          </button>
                        </>
                      )}
                      {d.status === "approved" && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onApproveDelivery(d.id, true)}>
                          أرشفة المنجز
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!deliveries.length && (
                  <tr>
                    <td colSpan={7}>{deliveriesError ? "—" : "لا توجد منجزات بعد."}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showCreate && (
        <div className="pantry-modal" role="dialog">
          <form className="pantry-modal__card pantry-modal__card--wide" onSubmit={createRequest}>
            <h2>إنشاء طلب بيت المونة</h2>
            <p className="muted">نفس بيانات طلب العميل الأساسية — بدون دفع وبدون عميل حقيقي.</p>

            <section className="pantry-form-section">
              <h3>بيانات الخدمة</h3>
              <label>
                التصنيف
                <select
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryId: e.target.value, subSubcategoryId: "" }))
                  }
                >
                  <option value="">اختر التصنيف</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {fieldErrors.categoryId && <span className="pantry-field-error">{fieldErrors.categoryId}</span>}
              </label>
              <label>
                التصنيف الفرعي (اختياري)
                <select
                  value={form.subSubcategoryId}
                  onChange={(e) => setForm((f) => ({ ...f, subSubcategoryId: e.target.value }))}
                  disabled={!form.categoryId}
                >
                  <option value="">بدون</option>
                  {subSubs.map((ss) => (
                    <option key={ss.id} value={ss.id}>
                      {ss.nameAr || ss.name_ar || ss.name || `#${ss.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="pantry-form-section">
              <h3>تفاصيل الطلب</h3>
              <label>
                العنوان
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                {fieldErrors.title && <span className="pantry-field-error">{fieldErrors.title}</span>}
              </label>
              <label>
                الوصف
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                {fieldErrors.description && (
                  <span className="pantry-field-error">{fieldErrors.description}</span>
                )}
              </label>
              <label>
                المهارات المطلوبة (افصل بفاصلة)
                <input
                  value={form.skillsText}
                  onChange={(e) => setForm((f) => ({ ...f, skillsText: e.target.value }))}
                  placeholder="مثال: كتابة، ترجمة، تصميم"
                />
              </label>
              <label>
                متطلبات إضافية
                <textarea
                  rows={3}
                  value={form.requirements}
                  onChange={(e) => setForm((f) => ({ ...f, requirements: e.target.value }))}
                />
              </label>
              <div className="pantry-form-row">
                <label>
                  رابط مرفق (اختياري)
                  <input
                    value={form.attachmentUrl}
                    onChange={(e) => setForm((f) => ({ ...f, attachmentUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  اسم المرفق
                  <input
                    value={form.attachmentName}
                    onChange={(e) => setForm((f) => ({ ...f, attachmentName: e.target.value }))}
                  />
                </label>
              </div>
            </section>

            <section className="pantry-form-section">
              <h3>الميزانية والمدة</h3>
              <div className="pantry-type-row">
                <button
                  type="button"
                  className={form.pricingType === "fixed" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, pricingType: "fixed" }))}
                >
                  ميزانية ثابتة
                </button>
                <button
                  type="button"
                  className={form.pricingType === "bidding" ? "is-active" : ""}
                  onClick={() => setForm((f) => ({ ...f, pricingType: "bidding" }))}
                >
                  استقبال عروض
                </button>
              </div>
              {form.pricingType === "fixed" ? (
                <label>
                  الميزانية الثابتة
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.fixedBudget}
                    onChange={(e) => setForm((f) => ({ ...f, fixedBudget: e.target.value }))}
                  />
                  {fieldErrors.fixedBudget && (
                    <span className="pantry-field-error">{fieldErrors.fixedBudget}</span>
                  )}
                </label>
              ) : (
                <div className="pantry-form-row">
                  <label>
                    الحد الأدنى للميزانية
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.budgetMin}
                      onChange={(e) => setForm((f) => ({ ...f, budgetMin: e.target.value }))}
                    />
                    {fieldErrors.budgetMin && (
                      <span className="pantry-field-error">{fieldErrors.budgetMin}</span>
                    )}
                  </label>
                  <label>
                    الحد الأعلى للميزانية
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.budgetMax}
                      onChange={(e) => setForm((f) => ({ ...f, budgetMax: e.target.value }))}
                    />
                    {fieldErrors.budgetMax && (
                      <span className="pantry-field-error">{fieldErrors.budgetMax}</span>
                    )}
                  </label>
                </div>
              )}
              <label>
                مدة التنفيذ (أيام)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.deliveryDays}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryDays: e.target.value }))}
                />
                {fieldErrors.deliveryDays && (
                  <span className="pantry-field-error">{fieldErrors.deliveryDays}</span>
                )}
              </label>
            </section>

            {integrationActive ? (
            <section className="pantry-form-section">
              <h3>شروط التقديم</h3>
              <div className="pantry-form-row">
                <label>
                  تكلفة التقديم (عروض متاحة)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.applicationBidCost}
                    onChange={(e) => setForm((f) => ({ ...f, applicationBidCost: e.target.value }))}
                  />
                </label>
                <label>
                  العدد المستهدف للمتقدمين
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.targetApplicantCount}
                    onChange={(e) => setForm((f) => ({ ...f, targetApplicantCount: e.target.value }))}
                    placeholder="اختياري"
                  />
                </label>
              </div>
              <label>
                موعد إغلاق التقديم (اختياري)
                <input
                  type="datetime-local"
                  value={form.applicationDeadlineAt}
                  onChange={(e) => setForm((f) => ({ ...f, applicationDeadlineAt: e.target.value }))}
                />
              </label>
              <div>
                <span className="muted">الباقات المؤهلة (اتركها فارغة للكل)</span>
                <div className="pantry-type-row">
                  {["starter", "silver", "pro", "elite"].map((code) => (
                    <label key={code} className="pantry-check">
                      <input
                        type="checkbox"
                        checked={Boolean(form.eligibleTiers?.[code])}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            eligibleTiers: { ...f.eligibleTiers, [code]: e.target.checked },
                          }))
                        }
                      />
                      {code.toUpperCase()}
                    </label>
                  ))}
                </div>
              </div>
            </section>
            ) : null}

            <section className="pantry-form-section">
              <h3>ملاحظات داخلية</h3>
              <label>
                ملاحظات للأدمن فقط
                <textarea
                  rows={2}
                  value={form.internalNotes}
                  onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                />
              </label>
            </section>

            <section className="pantry-form-section">
              <h3>النشر</h3>
              <label className="pantry-check">
                <input
                  type="checkbox"
                  checked={form.publish}
                  onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
                />
                نشر فوراً للعروض
              </label>
            </section>

            <div className="pantry-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "جاري الحفظ…" : "حفظ"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowCreate(false);
                  setFieldErrors({});
                }}
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {detail?.request && (
        <div className="pantry-modal" role="dialog">
          <div className="pantry-modal__card pantry-modal__card--wide">
            <h2>{detail.request.title}</h2>
            <p>{detail.request.description}</p>
            <p className="muted">
              النوع: {detail.request.pricingType === "bidding" ? "استقبال عروض" : "ميزانية ثابتة"}
              {detail.request.deliveryDays != null ? ` · المدة: ${detail.request.deliveryDays} يوم` : ""}
              {detail.request.skills?.length ? ` · مهارات: ${detail.request.skills.join("، ")}` : ""}
            </p>
            {detail.request.requirements && <p className="muted">متطلبات: {detail.request.requirements}</p>}
            <p>
              الحالة: <strong>{STATUS_LABELS[detail.request.status] || detail.request.status}</strong>
            </p>
            {integrationActive ? (
            <p className="muted">
              تكلفة التقديم: {detail.request.applicationBidCost ?? 1} عرض متاح
              {detail.request.targetApplicantCount != null
                ? ` · المتقدمون: ${detail.request.validApplicantCount ?? 0} / ${detail.request.targetApplicantCount}`
                : ` · المتقدمون: ${detail.request.validApplicantCount ?? detail.bids?.length ?? 0}`}
              {detail.request.remainingApplicantSlots != null
                ? ` · المتبقي: ${detail.request.remainingApplicantSlots}`
                : ""}
            </p>
            ) : null}
            {integrationActive && !!detail.request.eligibleTierCodes?.length && (
              <p className="muted">
                الباقات المؤهلة: {detail.request.eligibleTierCodes.map((t) => String(t).toUpperCase()).join("، ")}
              </p>
            )}
            <h3>العروض</h3>
            <ul className="pantry-bid-list">
              {(detail.bids || []).map((b) => (
                <li key={b.id}>
                  <div>
                    <strong>{b.freelancerName || b.freelancerId}</strong> — {b.amount}
                    {b.durationDays ? ` / ${b.durationDays} يوم` : ""}
                    <div className="muted">{b.message || ""}</div>
                    <span className="muted">{b.status}</span>
                  </div>
                  {b.status === "pending" && detail.request.status === "open_for_bids" && (
                    <div className="pantry-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onAcceptBid(b.id)}>
                        قبول العرض
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRejectBid(b.id)}>
                        رفض العرض
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {!detail.bids?.length && <li>لا توجد عروض.</li>}
            </ul>
            <h3>التسليمات</h3>
            <ul className="pantry-bid-list">
              {(detail.deliveries || []).map((d) => (
                <li key={d.id}>
                  <div>
                    {STATUS_LABELS[d.status] || d.status}
                    <div className="muted">{d.message}</div>
                    {(d.files || []).map((f) => (
                      <div key={f.id}>
                        <a href={f.fileUrl} target="_blank" rel="noreferrer">
                          {f.fileName}
                        </a>
                      </div>
                    ))}
                  </div>
                  {d.status === "submitted" && (
                    <div className="pantry-actions">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => onApproveDelivery(d.id)}>
                        اعتماد التسليم
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRequestRevision(d.id)}>
                        طلب تعديل
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {!detail.deliveries?.length && <li>لا توجد تسليمات.</li>}
            </ul>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setDetail(null);
                setSelectedId(null);
              }}
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
