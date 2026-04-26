import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../ui/toastContext";
import {
  createClientOrderRequest,
  createClientFixedOrderStripeCheckoutRequest,
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
} from "../../services/api";

const CURRENCIES = [
  { code: "JOD", label: "JOD" },
  { code: "SAR", label: "SAR" },
  { code: "USD", label: "USD" },
  { code: "AED", label: "AED" },
  { code: "EUR", label: "EUR" },
  { code: "KWD", label: "KWD" },
  { code: "QAR", label: "QAR" },
  { code: "BHD", label: "BHD" },
  { code: "OMR", label: "OMR" },
];

function parseSkills(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  return s
    .split(/[,،\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 50);
}

const STEPS = [
  { n: 1, label: "البيانات" },
  { n: 2, label: "المرفقات" },
  { n: 3, label: "التأكيد" },
];

export default function ClientCreateOrderModal({ open, onClose }) {
  const navigate = useNavigate();
  const { push } = useToast();

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [subSubcategories, setSubSubcategories] = useState([]);
  const [subSubBusy, setSubSubBusy] = useState(false);

  const [projectType, setProjectType] = useState("fixed");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subSubcategoryId, setSubSubcategoryId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [budget, setBudget] = useState("");
  const [bidMin, setBidMin] = useState("");
  const [bidMax, setBidMax] = useState("");
  const [durationValue, setDurationValue] = useState("7");
  const [durationUnit, setDurationUnit] = useState("days");
  const [skillsText, setSkillsText] = useState("");
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setStep(1);
    setProjectType("fixed");
    setTitle("");
    setDescription("");
    setCategoryId("");
    setSubSubcategoryId("");
    setCurrencyCode("USD");
    setBudget("");
    setBidMin("");
    setBidMax("");
    setDurationValue("7");
    setDurationUnit("days");
    setSkillsText("");
    setFiles([]);
  };

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    let cancelled = false;
    (async () => {
      try {
        const res = await getCategoriesRequest();
        if (!cancelled) setCategories(res?.data || []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: "تعذر تحميل التصنيفات", message: e?.response?.data?.message || e?.message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, push]);

  useEffect(() => {
    setSubSubcategories([]);
    setSubSubcategoryId("");
  }, [categoryId]);

  useEffect(() => {
    if (!open || !categoryId) {
      setSubSubcategories([]);
      return;
    }
    let cancelled = false;
    setSubSubBusy(true);
    (async () => {
      try {
        const res = await getCategorySubSubcategoriesRequest(categoryId);
        if (!cancelled) setSubSubcategories(res?.data?.subSubcategories || []);
      } catch {
        if (!cancelled) setSubSubcategories([]);
      } finally {
        if (!cancelled) setSubSubBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoryId]);

  const clientErrors = useMemo(() => {
    const e = {};
    if (!String(title).trim() || String(title).trim().length < 2) e.title = true;
    if (!String(description).trim() || String(description).trim().length < 10) e.description = true;
    if (!categoryId) e.categoryId = true;
    if (projectType === "fixed") {
      const n = Number(String(budget).replace(/,/g, "."));
      if (!Number.isFinite(n) || n <= 0) e.budget = true;
    } else {
      const mn = Number(String(bidMin).replace(/,/g, "."));
      const mx = Number(String(bidMax).replace(/,/g, "."));
      if (!Number.isFinite(mn) || mn <= 0) e.bidMin = true;
      if (!Number.isFinite(mx) || mx <= 0) e.bidMax = true;
      if (Number.isFinite(mn) && Number.isFinite(mx) && mx < mn) e.bidMax = true;
    }
    const dv = Number(durationValue);
    if (!Number.isInteger(dv) || dv < 1) e.duration = true;
    return e;
  }, [title, description, categoryId, projectType, budget, bidMin, bidMax, durationValue]);

  const canStep1 = useMemo(() => Object.keys(clientErrors).length === 0, [clientErrors]);

  const onOverlayMouseDown = (e) => {
    if (e.target === e.currentTarget && !saving) onClose();
  };

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const next = [...files, ...incoming].slice(0, 5);
    setFiles(next);
    if (incoming.length + files.length > 5) {
      push({ type: "error", title: "حد الملفات", message: "يمكنك إرفاق 5 ملفات كحد أقصى (حتى 10 ميجابايت لكل ملف)." });
    }
  };

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const buildFormData = () => {
    const fd = new FormData();
    fd.append("title", String(title).trim());
    fd.append("description", String(description).trim());
    fd.append("categoryId", String(Number(categoryId)));
    if (subSubcategoryId) fd.append("subSubcategoryId", String(Number(subSubcategoryId)));
    fd.append("projectType", projectType);
    fd.append("currencyCode", String(currencyCode).trim().toUpperCase());
    fd.append("durationValue", String(Number(durationValue)));
    fd.append("durationUnit", durationUnit);
    const skills = parseSkills(skillsText);
    fd.append("preferredSkills", JSON.stringify(skills));
    if (projectType === "fixed") {
      fd.append("budget", String(Number(String(budget).replace(/,/g, "."))));
    } else {
      fd.append("bidBudgetMin", String(Number(String(bidMin).replace(/,/g, "."))));
      fd.append("bidBudgetMax", String(Number(String(bidMax).replace(/,/g, "."))));
    }
    files.forEach((f) => fd.append("files", f));
    return fd;
  };

  const submit = async () => {
    if (!canStep1) {
      push({ type: "error", title: "تحقق من الحقول", message: "يرجى تصحيح الأخطاء في الخطوة الأولى." });
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const created = await createClientOrderRequest(buildFormData());
      const order = created?.data?.order;
      const oid = order?.id;
      const type = order?.projectType;
      if (type === "fixed" && oid) {
        try {
          const payRes = await createClientFixedOrderStripeCheckoutRequest(oid);
          const url = payRes?.data?.checkoutUrl;
          if (url) {
            window.location.href = url;
            return;
          }
          push({
            type: "warning",
            title: "تم إنشاء الطلب",
            message: "لم يُرجع الخادم رابط الدفع. أكمل الدفع من «طلباتي».",
          });
          onClose();
          navigate("/dashboard/client/my-orders");
          return;
        } catch (e) {
          push({
            type: "warning",
            title: "تم إنشاء الطلب",
            message:
              e?.response?.data?.message ||
              e?.message ||
              "تعذر فتح صفحة الدفع الآن — يمكنك إكمال الدفع من «طلباتي».",
          });
          onClose();
          navigate("/dashboard/client/my-orders");
          return;
        }
      }
      push({
        type: "success",
        title: "تم إنشاء الطلب",
        message: type === "bidding" ? "طلبك مفتوح لاستقبال العروض." : "تم حفظ الطلب.",
      });
      onClose();
      navigate("/dashboard/client/my-orders");
    } catch (e) {
      push({ type: "error", title: "تعذر إنشاء الطلب", message: e?.response?.data?.message || e?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const typeHelp =
    projectType === "fixed"
      ? "سعر ثابت: يُنشأ الطلب بانتظار الدفع، ثم بعد تأكيد Stripe يصبح متاحاً للمستقلين (الويب هوك على الخادم هو المصدر الرسمي لحالة الدفع)."
      : "مزايدة: نطاق ميزانية؛ المستقلون يقدّمون عروضاً ضمن النطاق.";

  return (
    <div className="client-order-modal-overlay" role="presentation" onMouseDown={onOverlayMouseDown}>
      <div className="client-order-modal" role="dialog" aria-modal="true" aria-labelledby="client-order-modal-title" dir="rtl">
        <header className="client-order-modal__head">
          <div>
            <h2 id="client-order-modal-title" className="client-order-modal__title">
              إنشاء طلب
            </h2>
            <p className="client-order-modal__lead">ثلاث خطوات: البيانات، المرفقات الاختيارية، ثم التأكيد.</p>
          </div>
          <button type="button" className="btn btn-secondary client-order-modal__close" onClick={() => !saving && onClose()} disabled={saving}>
            إغلاق
          </button>
        </header>

        <nav className="client-order-modal__steps" aria-label="خطوات إنشاء الطلب">
          {STEPS.map((s) => (
            <button
              key={s.n}
              type="button"
              className={`client-order-modal__step ${step === s.n ? "client-order-modal__step--active" : ""} ${step > s.n ? "client-order-modal__step--done" : ""}`.trim()}
              onClick={() => {
                if (s.n === 2 && !canStep1) return;
                if (s.n === 3 && !canStep1) return;
                if (s.n === 3 && step < 2) return;
                setStep(s.n);
              }}
              disabled={saving || (s.n > 1 && !canStep1)}
            >
              <span className="client-order-modal__step-num">{s.n}</span>
              {s.label}
            </button>
          ))}
        </nav>

        <div className="client-order-modal__body">
          {step === 1 ? (
            <div className="client-order-modal__grid">
              <div className="field client-order-modal__span2">
                <span className="label">نوع الطلب</span>
                <div className="client-co-type-row">
                  <button
                    type="button"
                    className={projectType === "fixed" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => setProjectType("fixed")}
                  >
                    سعر ثابت
                  </button>
                  <button
                    type="button"
                    className={projectType === "bidding" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => setProjectType("bidding")}
                  >
                    مزايدة
                  </button>
                </div>
                <div className="help">{typeHelp}</div>
              </div>

              <div className="field client-order-modal__span2">
                <label className="label" htmlFor="m-co-title">
                  عنوان المشروع
                </label>
                <input id="m-co-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>

              <div className="field client-order-modal__span2">
                <label className="label" htmlFor="m-co-desc">
                  وصف المطلوب
                </label>
                <textarea id="m-co-desc" className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="client-order-modal__row4 client-order-modal__span2">
                <div className="field">
                  <label className="label" htmlFor="m-co-cat">
                    التصنيف
                  </label>
                  <select id="m-co-cat" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">— اختر —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor="m-co-ss">
                    تفصيلي (اختياري)
                  </label>
                  <select id="m-co-ss" className="input" value={subSubcategoryId} onChange={(e) => setSubSubcategoryId(e.target.value)} disabled={!categoryId || subSubBusy}>
                    <option value="">{subSubBusy ? "…" : "— بدون —"}</option>
                    {subSubcategories.map((ss) => (
                      <option key={ss.id} value={String(ss.id)}>
                        {ss.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label className="label" htmlFor="m-co-cur">
                    العملة
                  </label>
                  <select id="m-co-cur" className="input" dir="ltr" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>

                {projectType === "fixed" ? (
                  <div className="field">
                    <label className="label" htmlFor="m-co-budget">
                      الميزانية
                    </label>
                    <input id="m-co-budget" className="input" dir="ltr" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="250" />
                  </div>
                ) : (
                  <div className="field client-order-modal__bid-pair-field">
                    <span className="label" id="m-co-bid-range-label">
                      نطاق السعر
                    </span>
                    <div className="client-order-modal__bid-pair" role="group" aria-labelledby="m-co-bid-range-label">
                      <input
                        id="m-co-bmin"
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        value={bidMin}
                        onChange={(e) => setBidMin(e.target.value)}
                        placeholder="من"
                        aria-label="الحد الأدنى للميزانية"
                      />
                      <span className="client-order-modal__bid-sep" aria-hidden="true">
                        –
                      </span>
                      <input
                        id="m-co-bmax"
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        value={bidMax}
                        onChange={(e) => setBidMax(e.target.value)}
                        placeholder="إلى"
                        aria-label="الحد الأعلى للميزانية"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="field">
                <label className="label" htmlFor="m-co-dur">
                  مدة التسليم
                </label>
                <input id="m-co-dur" className="input" dir="ltr" inputMode="numeric" value={durationValue} onChange={(e) => setDurationValue(e.target.value)} />
              </div>

              <div className="field">
                <label className="label" htmlFor="m-co-unit">
                  الوحدة
                </label>
                <select id="m-co-unit" className="input" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
                  <option value="days">أيام</option>
                  <option value="hours">ساعات</option>
                  <option value="minutes">دقائق</option>
                </select>
              </div>

              <div className="field client-order-modal__span2">
                <label className="label" htmlFor="m-co-skills">
                  مهارات (اختياري)
                </label>
                <textarea id="m-co-skills" className="input" rows={2} value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="React، Node.js" />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="client-order-modal__attach">
              <p className="help" style={{ marginTop: 0 }}>
                أرفق حتى 5 ملفات (صور أو مستندات)، 10 ميجابايت لكل ملف. يمكنك التخطي والمتابعة.
              </p>
              <label className="client-order-modal__file-btn">
                <input type="file" multiple className="client-order-modal__file-input" onChange={(e) => addFiles(e.target.files)} accept="image/*,.pdf,.doc,.docx,.zip,.txt" />
                <span>اختيار ملفات</span>
              </label>
              {files.length ? (
                <ul className="client-order-modal__file-list">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      <span className="client-order-modal__file-name">{f.name}</span>
                      <button type="button" className="btn btn-secondary" style={{ padding: "2px 8px", fontSize: "0.75rem" }} onClick={() => removeFile(i)}>
                        حذف
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="help">لا توجد ملفات مرفوعة بعد.</p>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="client-order-modal__review">
              <div className="client-order-modal__review-block">
                <div className="client-order-modal__review-row">
                  <span>النوع</span>
                  <strong dir="ltr">{projectType === "fixed" ? "سعر ثابت" : "مزايدة"}</strong>
                </div>
                <div className="client-order-modal__review-row">
                  <span>العنوان</span>
                  <strong>{title || "—"}</strong>
                </div>
                <div className="client-order-modal__review-row">
                  <span>التصنيف</span>
                  <strong>{categories.find((c) => String(c.id) === String(categoryId))?.name || "—"}</strong>
                </div>
                <div className="client-order-modal__review-row">
                  <span>العملة / السعر</span>
                  <strong dir="ltr">
                    {currencyCode}
                    {projectType === "fixed" ? ` — ${budget}` : ` — ${bidMin}–${bidMax}`}
                  </strong>
                </div>
                <div className="client-order-modal__review-row">
                  <span>المدة</span>
                  <strong dir="ltr">
                    {durationValue}{" "}
                    {durationUnit === "days" ? "يوم" : durationUnit === "hours" ? "ساعة" : "دقيقة"}
                  </strong>
                </div>
                <div className="client-order-modal__review-row">
                  <span>المرفقات</span>
                  <strong>{files.length ? `${files.length} ملف(ات)` : "لا يوجد"}</strong>
                </div>
              </div>

              <div className="client-order-modal__pay-note">
                {projectType === "fixed" ? (
                  <>
                    <strong>الدفع</strong>
                    <p className="help" style={{ margin: "6px 0 0" }}>
                      طلبات السعر الثابت ستُربط لاحقاً بـ Stripe لخصم المبلغ عند النشر أو عند الإسناد حسب سياسة المنتج. حالياً لا يُخصم أي مبلغ.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>الدفع</strong>
                    <p className="help" style={{ margin: "6px 0 0" }}>
                      طلبات المزايدة: الدفع يكون بعد اختيار عرض مستقل. التكامل مع Stripe يُضاف لاحقاً.
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="client-order-modal__foot">
          <div className="client-order-modal__foot-left">
            <button type="button" className="btn btn-secondary" onClick={() => !saving && onClose()} disabled={saving}>
              إلغاء
            </button>
            {step > 1 ? (
              <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={saving}>
                السابق
              </button>
            ) : null}
          </div>
          <div className="client-order-modal__foot-right">
            {step < 3 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (step === 1 && !canStep1) {
                    push({ type: "error", title: "حقول ناقصة", message: "أكمل البيانات المطلوبة قبل المتابعة." });
                    return;
                  }
                  setStep((s) => s + 1);
                }}
                disabled={saving}
              >
                التالي
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={submit} disabled={saving || !canStep1}>
                {saving ? "جارٍ النشر…" : "تأكيد ونشر الطلب"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
