import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FilePlus2, X } from "lucide-react";
import AdminInternalOrderWizard from "../../../components/orders/AdminInternalOrderWizard";
import ConfirmDialog from "../../../components/dashboard/ConfirmDialog";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { useToast } from "../../../components/ui/toastContext";
import { adminCreateInstitutionWorkRequest, getCategoriesRequest } from "../../../services/api";
import { getSafeApiErrorMessage } from "../../../utils/apiErrorMessage";
import {
  ARTICLE_TARGET_PLAN_OPTIONS,
  formatDerivedPlanRequirementsSummaryAr,
  getInitialMarketplaceArticleFormState,
  normalizeMarketplaceArticlePayload,
} from "../../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import "../../../styles/createOrderModal.css";

const STEPS = [
  { id: 1, label: "نوع العمل" },
  { id: 2, label: "بيانات العمل" },
  { id: 3, label: "مراجعة ونشر" },
];

function InstitutionArticleFields({ form, setField, categories, errors }) {
  return (
    <div className="grid gap-4" dir="rtl">
      <p className="m-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        نفس حقول إنشاء المقال القياسية. المقال يُنشأ مباشرةً كنطاق مؤسسة (بدون ظهور في السوق العام). الاعتماد النهائي
        لا يُنشئ تسوية سوقية.
      </p>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">عنوان المقال</span>
        <input
          type="text"
          className="form-control"
          value={form.title}
          onChange={(e) => setField("title", e.target.value)}
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title ? <span className="text-sm text-red-700">{errors.title}</span> : null}
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">الوصف / الموجز</span>
        <textarea
          className="form-control min-h-[120px]"
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description ? <span className="text-sm text-red-700">{errors.description}</span> : null}
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">خطة المقال / المستوى</span>
        <select
          className="form-control"
          value={form.targetPlanCode || ""}
          onChange={(e) => setField("targetPlanCode", e.target.value)}
        >
          {ARTICLE_TARGET_PLAN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.labelAr}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-600">{formatDerivedPlanRequirementsSummaryAr(form.targetPlanCode)}</span>
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">نمط الكتابة</span>
        <select
          className="form-control"
          value={form.writingMode || "either"}
          onChange={(e) => setField("writingMode", e.target.value)}
        >
          <option value="either">لا يفرق</option>
          <option value="manual">يدوي</option>
          <option value="ai">بالذكاء الاصطناعي</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">حد المتقدمين المطلوب</span>
        <input
          type="number"
          min={1}
          max={100}
          className="form-control"
          value={form.requiredBidCount ?? 10}
          onChange={(e) => setField("requiredBidCount", e.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">مدة جمع المتقدمين (ساعات)</span>
        <select
          className="form-control"
          value={form.bidCollectionDurationHours ?? 24}
          onChange={(e) => setField("bidCollectionDurationHours", Number(e.target.value))}
        >
          <option value={24}>24 ساعة</option>
          <option value={48}>48 ساعة</option>
          <option value={72}>3 أيام</option>
          <option value={168}>7 أيام</option>
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium text-slate-800">التصنيف (اختياري)</span>
        <select
          className="form-control"
          value={form.categoryId || ""}
          onChange={(e) => setField("categoryId", e.target.value)}
        >
          <option value="">—</option>
          {(categories || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * Stepped create flow for institution work (order | article).
 */
export default function InstitutionCreateWorkModal({
  open,
  institutionId,
  institutionName = "",
  onClose,
  onSuccess = null,
  triggerRef = null,
}) {
  const { t } = useTranslation();
  const { push } = useToast();
  const titleId = useId();
  const subtitleId = useId();
  const panelRef = useRef(null);
  const pendingOrderFormRef = useRef(null);
  const pendingOrderSummaryRef = useRef(null);

  const [step, setStep] = useState(1);
  const [workType, setWorkType] = useState("order");
  const [wizardKey, setWizardKey] = useState(0);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [wizardDirty, setWizardDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

  const [articleForm, setArticleForm] = useState(() => getInitialMarketplaceArticleFormState());
  const [articleErrors, setArticleErrors] = useState({});
  const [articleReview, setArticleReview] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setWorkType("order");
    setWizardKey((k) => k + 1);
    setWizardBusy(false);
    setWizardDirty(false);
    setDiscardOpen(false);
    setPublishBusy(false);
    pendingOrderFormRef.current = null;
    pendingOrderSummaryRef.current = null;
    setArticleForm(getInitialMarketplaceArticleFormState());
    setArticleErrors({});
    setArticleReview(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getCategoriesRequest()
      .then((res) => {
        if (cancelled) return;
        const cats = res?.data?.categories || res?.data || res?.categories || [];
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const finishClose = useCallback(() => {
    setDiscardOpen(false);
    onClose?.();
    window.requestAnimationFrame(() => {
      const el = triggerRef?.current;
      if (el && typeof el.focus === "function") el.focus();
    });
  }, [onClose, triggerRef]);

  const requestClose = useCallback(() => {
    if (wizardBusy || publishBusy) return;
    if (wizardDirty || step > 1) {
      setDiscardOpen(true);
      return;
    }
    finishClose();
  }, [wizardBusy, publishBusy, wizardDirty, step, finishClose]);

  const setArticleField = (key, value) => {
    setArticleForm((prev) => ({ ...prev, [key]: value }));
    setArticleErrors((prev) => ({ ...prev, [key]: null }));
  };

  const validateArticle = () => {
    const next = {};
    if (!String(articleForm.title || "").trim()) next.title = "العنوان مطلوب.";
    if (!String(articleForm.description || "").trim()) next.description = "الوصف مطلوب.";
    setArticleErrors(next);
    return Object.keys(next).length === 0;
  };

  const onOrderWizardSubmit = async (fd, ctx) => {
    pendingOrderFormRef.current = fd;
    pendingOrderSummaryRef.current = {
      title: ctx?.form?.title?.trim() || "",
      projectType: ctx?.form?.projectType || "",
    };
    setStep(3);
    return { data: { order: { title: ctx?.form?.title?.trim() || "" } } };
  };

  const onOrderWizardCreated = () => {
    setStep(3);
  };

  const goArticleReview = () => {
    if (!validateArticle()) return;
    const payload = normalizeMarketplaceArticlePayload(articleForm);
    setArticleReview(payload);
    setStep(3);
  };

  const publishWork = async () => {
    if (!institutionId || publishBusy) return;
    setPublishBusy(true);
    try {
      if (workType === "order") {
        const fd = pendingOrderFormRef.current;
        if (!fd) throw new Error("لا توجد بيانات الطلب.");
        fd.append("workType", "order");
        fd.append("publish", "true");
        await adminCreateInstitutionWorkRequest(institutionId, fd);
      } else {
        const payload = { ...(articleReview || normalizeMarketplaceArticlePayload(articleForm)), publish: true };
        await adminCreateInstitutionWorkRequest(institutionId, payload);
      }
      push({ type: "success", message: "تم إنشاء العمل ونشره للمؤسسة." });
      finishClose();
      if (typeof onSuccess === "function") {
        void Promise.resolve(onSuccess()).catch(() => {});
      }
    } catch (err) {
      push({
        type: "error",
        message: getSafeApiErrorMessage(err) || "تعذر نشر العمل.",
      });
    } finally {
      setPublishBusy(false);
    }
  };

  if (!open) return null;

  const subtitle = institutionName
    ? `إضافة عمل جديد للمؤسسة «${institutionName}»`
    : "إضافة طلب أو مقال ضمن نطاق المؤسسة";

  return createPortal(
    <>
      <div
        className="client-order-modal-overlay oh-ios-create-order-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          ref={panelRef}
          className={[
            "client-order-modal",
            step === 2 && workType === "order" ? "client-order-modal--admin-wizard client-order-modal--institutional" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={subtitleId}
          dir="rtl"
          style={step === 2 && workType === "order" ? undefined : { maxWidth: 640, width: "min(96vw, 640px)" }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <header className="client-order-modal__head co-modal-ref__head">
            <div className="co-modal-ref__head-main">
              <span className="co-modal-ref__head-icon" aria-hidden="true">
                <FilePlus2 size={22} strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="client-order-modal__title co-modal-ref__title">
                  إضافة طلب للمؤسسة
                </h2>
                <p id={subtitleId} className="oh-ios-create-order-subtitle">
                  {subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="co-modal-ref__close"
              onClick={requestClose}
              disabled={wizardBusy || publishBusy}
              aria-label={t("dashboard.institutionalOrderStorage.cancel")}
            >
              <X size={20} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </header>

          <nav className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3" aria-label="خطوات الإنشاء">
            {STEPS.map((s) => (
              <span
                key={s.id}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium",
                  step === s.id
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : step > s.id
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-slate-200 text-slate-500",
                ].join(" ")}
              >
                {s.id}. {s.label}
              </span>
            ))}
          </nav>

          <div
            className={
              step === 2 && workType === "order"
                ? "client-order-modal__body client-order-modal__body--admin-wizard"
                : "client-order-modal__body p-4"
            }
          >
            {step === 1 ? (
              <div className="grid gap-3">
                <p className="m-0 text-sm text-slate-700">اختر نوع العمل الذي تريد إضافته للمؤسسة.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: "order", label: "طلب عادي", hint: "نفس حقول إنشاء الطلب الداخلي (معرّف، ميزانية، مدة…)" },
                    { id: "article", label: "مقال", hint: "مقال معرض ضمن نطاق المؤسسة فقط" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={[
                        "rounded-xl border p-4 text-right transition",
                        workType === opt.id
                          ? "border-emerald-400 bg-emerald-50 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                      onClick={() => setWorkType(opt.id)}
                    >
                      <div className="font-semibold text-slate-900">{opt.label}</div>
                      <div className="mt-1 text-xs text-slate-600">{opt.hint}</div>
                    </button>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" className="btn btn-secondary" onClick={requestClose}>
                    إلغاء
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                    متابعة
                  </button>
                </div>
              </div>
            ) : null}

            {step === 2 && workType === "order" ? (
              <AdminInternalOrderWizard
                key={wizardKey}
                variant="modal"
                mode="institutional"
                resetToken={wizardKey}
                onSubmitFormData={onOrderWizardSubmit}
                onCreated={onOrderWizardCreated}
                modalOnClose={requestClose}
                modalCloseLabel={t("dashboard.institutionalOrderStorage.cancel")}
                onBusyChange={setWizardBusy}
                onDirtyChange={setWizardDirty}
              />
            ) : null}

            {step === 2 && workType === "article" ? (
              <div className="grid gap-4">
                <InstitutionArticleFields
                  form={articleForm}
                  setField={setArticleField}
                  categories={categories}
                  errors={articleErrors}
                />
                <div className="flex justify-between gap-2 pt-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>
                    رجوع
                  </button>
                  <button type="button" className="btn btn-primary" onClick={goArticleReview}>
                    متابعة للمراجعة
                  </button>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="grid gap-4">
                <p className="m-0 text-sm text-slate-700">
                  راجع البيانات ثم أكّد النشر. سيكون العمل مرئياً ضمن نطاق المؤسسة (بدون دفع Stripe).
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="mb-2 font-semibold text-slate-900">
                    {workType === "order" ? "طلب عادي" : "مقال"}
                  </div>
                  {workType === "order" ? (
                    <ul className="m-0 grid list-none gap-1 p-0 text-slate-800">
                      <li>
                        <span className="text-slate-600">العنوان: </span>
                        {pendingOrderSummaryRef.current?.title || "—"}
                      </li>
                      <li>
                        <span className="text-slate-600">نوع التسعير: </span>
                        {pendingOrderSummaryRef.current?.projectType === "bidding" ? "مزايدة" : "ثابت"}
                      </li>
                    </ul>
                  ) : (
                    <ul className="m-0 grid list-none gap-1 p-0 text-slate-800">
                      <li>
                        <span className="text-slate-600">العنوان: </span>
                        {articleReview?.title || articleForm.title}
                      </li>
                      <li>
                        <span className="text-slate-600">الخطة: </span>
                        {articleReview?.targetPlanCode || articleForm.targetPlanCode}
                      </li>
                    </ul>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={publishBusy}
                    onClick={() => setStep(2)}
                  >
                    رجوع
                  </button>
                  <button type="button" className="btn btn-primary" disabled={publishBusy} onClick={() => void publishWork()}>
                    {publishBusy ? "جارٍ النشر…" : "تأكيد ونشر"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={discardOpen}
        title={t("dashboard.institutionalOrderStorage.discardCreateTitle")}
        body={t("dashboard.institutionalOrderStorage.discardCreateBody")}
        confirmLabel={t("dashboard.institutionalOrderStorage.discardCreateConfirm")}
        cancelLabel={t("dashboard.institutionalOrderStorage.cancel")}
        confirmVariant="danger"
        onCancel={() => setDiscardOpen(false)}
        onConfirm={finishClose}
      />
    </>,
    document.body,
  );
}
