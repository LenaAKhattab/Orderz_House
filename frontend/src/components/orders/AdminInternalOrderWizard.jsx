import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../ui/toastContext";
import {
  adminCreateInternalOrderRequest,
  createClientOrderRequest,
  getCategoriesRequest,
  getCategorySubSubcategoriesRequest,
} from "../../services/api";
import AdminFreelancerSelector from "./AdminFreelancerSelector";
import { getDashboardPath } from "../../constants/authRoutes";
import { SelectPanelBusySkeleton } from "../ui/Skeleton";
import { CreateOrderReviewRow } from "./CreateOrderReviewRow";
import {
  ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR,
  ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR,
  validateOrderFilesSize,
} from "../../utils/orderUploadLimits";

const ADMIN_STEPS = [
  { key: "core", label: "بيانات الطلب" },
  { key: "assignment", label: "الإسناد" },
  { key: "files", label: "الملفات" },
  { key: "review", label: "مراجعة وإرسال" },
];

const CLIENT_STEPS = [
  { key: "core", label: "بيانات الطلب" },
  { key: "files", label: "الملفات" },
  { key: "review", label: "مراجعة وإرسال" },
];

/** Same step keys/labels as admin internal order flow; used for fake training templates only. */
const FAKE_TEMPLATE_STEPS = [
  { key: "core", label: "بيانات الطلب" },
  { key: "assignment", label: "الإسناد" },
  { key: "files", label: "الملفات" },
  { key: "review", label: "مراجعة وإرسال" },
];

/** Skills used before on this browser — suggestions only; not auto-filled on new orders. */
const SKILLS_HISTORY_STORAGE_KEY = "orderz_admin_skills_history_v1";
const LEGACY_PREFERRED_SKILLS_KEY = "orderz_admin_preferred_skills_v1";

function readSkillHistoryFromStorage() {
  try {
    const parseUnique = (raw) => {
      if (!raw) return [];
      const p = JSON.parse(raw);
      if (!Array.isArray(p)) return [];
      return Array.from(new Set(p.map((x) => String(x).trim()).filter(Boolean))).slice(0, 200);
    };
    let hist = parseUnique(localStorage.getItem(SKILLS_HISTORY_STORAGE_KEY));
    if (hist.length) return hist;
    const legacy = parseUnique(localStorage.getItem(LEGACY_PREFERRED_SKILLS_KEY));
    if (legacy.length) {
      localStorage.setItem(SKILLS_HISTORY_STORAGE_KEY, JSON.stringify(legacy));
      localStorage.removeItem(LEGACY_PREFERRED_SKILLS_KEY);
      return legacy;
    }
  } catch {
    // ignore
  }
  return [];
}

function SkillsTagsInput({ value, onChange, placeholder, historySkills }) {
  const [draft, setDraft] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapRef = useRef(null);
  const tags = useMemo(() => (Array.isArray(value) ? value : []), [value]);

  const tagSet = useMemo(() => new Set(tags.map((t) => String(t).trim()).filter(Boolean)), [tags]);

  const matches = useMemo(() => {
    const q = String(draft || "").trim().toLowerCase();
    const src = Array.isArray(historySkills) ? historySkills : [];
    if (q.length < 1) return [];
    return src
      .filter((s) => {
        const t = String(s).trim();
        return t && !tagSet.has(t) && t.toLowerCase().includes(q);
      })
      .slice(0, 15);
  }, [draft, historySkills, tagSet]);

  useEffect(() => {
    const onDoc = (e) => {
      const el = wrapRef.current;
      if (!el || el.contains(e.target)) return;
      setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("touchstart", onDoc, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("touchstart", onDoc, true);
    };
  }, []);

  const add = (raw) => {
    const v = String(raw || "").trim();
    if (!v) return;
    const next = [...new Set([...tags, v])].slice(0, 50);
    onChange(next);
    setDraft("");
    setSuggestOpen(false);
  };

  const remove = (t) => {
    onChange(tags.filter((x) => x !== t));
  };

  const showSuggestions = suggestOpen && matches.length > 0;

  return (
    <div className="field" ref={wrapRef}>
      <div className="chips">
        {tags.map((t) => (
          <span className="chip" key={t}>
            {t}
            <button type="button" className="btn btn-secondary" style={{ padding: "4px 10px" }} onClick={() => remove(t)}>
              حذف
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0, width: "100%" }}>
        <div style={{ flex: "1 1 0", minWidth: 0, position: "relative" }}>
          <input
            className="input"
            value={draft}
            placeholder={placeholder || "اكتب مهارة أو اختر من الاقتراحات…"}
            onChange={(e) => {
              setDraft(e.target.value);
              setHighlightIdx(0);
              setSuggestOpen(true);
            }}
            onFocus={() => {
              setHighlightIdx(0);
              setSuggestOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && showSuggestions) {
                e.preventDefault();
                setHighlightIdx((i) => Math.min(i + 1, matches.length - 1));
                return;
              }
              if (e.key === "ArrowUp" && showSuggestions) {
                e.preventDefault();
                setHighlightIdx((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setSuggestOpen(false);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (showSuggestions && matches[highlightIdx]) {
                  add(matches[highlightIdx]);
                } else {
                  add(draft);
                }
              }
            }}
          />
          {showSuggestions ? (
            <div
              className="oh-select__panel"
              role="listbox"
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 30,
                marginTop: 4,
                maxHeight: 220,
                overflowY: "auto",
              }}
            >
              {matches.map((s, i) => (
                <button
                  key={String(s)}
                  type="button"
                  className={`oh-select__opt ${i === highlightIdx ? "oh-select__opt--active" : ""}`.trim()}
                  role="option"
                  aria-selected={i === highlightIdx}
                  onMouseEnter={() => setHighlightIdx(i)}
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => add(s)}
                >
                  <div className="oh-select__opt-label">{s}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => add(draft)}>
          إضافة
        </button>
      </div>
      <div className="help">أثناء الكتابة تظهر مهارات مستخدمة سابقاً في نفس الحقل للاختيار السريع.</div>
    </div>
  );
}

function FieldError({ message }) {
  return (
    <div className={`field-error-slot ${message ? "field-error-slot--show" : ""}`.trim()} aria-live="polite">
      {message || ""}
    </div>
  );
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  // Force English digits everywhere in UI
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function SearchableSelect({
  value,
  onChange,
  placeholder,
  options,
  busy,
  query,
  onQueryChange,
  searchPlaceholder,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      const el = wrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("touchstart", onDown, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("touchstart", onDown, true);
    };
  }, []);

  const selected = options.find((o) => String(o.value) === String(value)) || null;
  const filtered = useMemo(() => {
    const s = String(query || "").trim().toLowerCase();
    if (!s) return options;
    return options.filter(
      (o) => String(o.label).toLowerCase().includes(s) || String(o.meta || "").toLowerCase().includes(s),
    );
  }, [query, options]);

  return (
    <div className="oh-select" ref={wrapRef}>
      <button
        type="button"
        className={`oh-select__btn ${open ? "oh-select__btn--open" : ""}`.trim()}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={`oh-select__value ${selected ? "" : "oh-select__value--placeholder"}`.trim()}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="oh-select__chev" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="oh-select__panel" role="listbox">
          <div className="oh-select__search">
            <input
              className="input"
              value={query}
              placeholder={searchPlaceholder || "ابحث داخل القائمة…"}
              onChange={(e) => onQueryChange?.(e.target.value)}
              autoFocus
            />
            {busy ? <SelectPanelBusySkeleton /> : null}
          </div>
          <div className="oh-select__options">
            {filtered.length === 0 ? (
              <div className="oh-select__empty">لا توجد نتائج</div>
            ) : (
              filtered.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  className={`oh-select__opt ${String(value) === String(opt.value) ? "oh-select__opt--active" : ""}`.trim()}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <div className="oh-select__opt-label">{opt.label}</div>
                  {opt.meta ? <div className="oh-select__opt-meta">{opt.meta}</div> : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * @param {{ variant?: "page" | "modal"; onCreated?: (res: unknown) => void; audience?: "admin" | "client"; initialValues?: Record<string, unknown>; onSubmitFormData?: (fd: FormData, ctx: { form: Record<string, unknown>, files: File[] }) => Promise<unknown> }} props
 * - page: full layout with back links (default admin create route).
 * - modal: compact shell for header popup; call onCreated after successful API response instead of staying on form.
 */
function makeInitialForm(initialValues = {}) {
  return {
    orderCode: String(initialValues.orderCode || ""),
    title: String(initialValues.title || ""),
    description: String(initialValues.description || ""),
    preferredSkills: Array.isArray(initialValues.preferredSkills) ? initialValues.preferredSkills : [],
    categoryId: String(initialValues.categoryId || ""),
    extraCategoryIds: Array.isArray(initialValues.extraCategoryIds) ? initialValues.extraCategoryIds : [],
    subSubcategoryId: String(initialValues.subSubcategoryId || ""),
    projectType: String(initialValues.projectType || "fixed"),
    budget: String(initialValues.budget || ""),
    bidBudgetMin: String(initialValues.bidBudgetMin || ""),
    bidBudgetMax: String(initialValues.bidBudgetMax || ""),
    durationValue: String(initialValues.durationValue || ""),
    durationMin: String(initialValues.durationMin || ""),
    durationMax: String(initialValues.durationMax || ""),
    durationUnit: String(initialValues.durationUnit || "days"),
    assignedFreelancerId: String(initialValues.assignedFreelancerId || ""),
    isActiveTemplate: initialValues.isActiveTemplate !== false,
  };
}

export default function AdminInternalOrderWizard({
  variant = "page",
  onCreated,
  audience = "admin",
  initialValues = {},
  onSubmitFormData,
  mode = "real",
  onSubmitFakeTemplate,
  resetToken = 0,
} = {}) {
  const { user } = useAuth();
  const { push } = useToast();
  const role = user?.primaryRole || user?.role;
  const isClientAudience = audience === "client";
  const isFakeTemplate = mode === "fake-template";
  const steps = isFakeTemplate ? FAKE_TEMPLATE_STEPS : isClientAudience ? CLIENT_STEPS : ADMIN_STEPS;
  const base = role ? getDashboardPath(role) : "/dashboard";
  const listPath = role === "super_admin" ? "/dashboard/super-admin/orders" : "/dashboard/admin/orders";

  const [busy, setBusy] = useState(false);
  const [categories, setCategories] = useState([]);
  const [subSubcategories, setSubSubcategories] = useState([]);
  const [subSubBusy, setSubSubBusy] = useState(false);
  const [archiveOnCreate, setArchiveOnCreate] = useState(false);
  const [extraCategoryQuery, setExtraCategoryQuery] = useState("");
  const [extraCategoryDetails, setExtraCategoryDetails] = useState({});
  const [extraSubSubsByCat, setExtraSubSubsByCat] = useState({});
  const [extraSubBusyByCat, setExtraSubBusyByCat] = useState({});
  const [extraSubQueryByCat, setExtraSubQueryByCat] = useState({});
  const [extraCategoryPickerOpen, setExtraCategoryPickerOpen] = useState(false);

  const [assignedFreelancer, setAssignedFreelancer] = useState(null);
  const [skillHistory, setSkillHistory] = useState(readSkillHistoryFromStorage);

  const fileInputRef = useRef(null);
  const explicitSubmitClickRef = useRef(false);
  const [files, setFiles] = useState([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [attempted, setAttempted] = useState({});

  const [form, setForm] = useState(() => makeInitialForm(initialValues));

  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!isFakeTemplate) return;
    setForm(makeInitialForm(initialValues));
    setStepIdx(0);
    setFiles([]);
    setAttempted({});
    setArchiveOnCreate(false);
    setAssignedFreelancer(null);
  }, [resetToken, isFakeTemplate, initialValues]);

  // Remember skill *names* for searchable suggestions; each new order starts with empty skills.
  useEffect(() => {
    try {
      const cur = Array.isArray(form.preferredSkills)
        ? form.preferredSkills.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (!cur.length) return;
      setSkillHistory((prev) => {
        const merged = Array.from(new Set([...prev, ...cur])).slice(0, 200);
        localStorage.setItem(SKILLS_HISTORY_STORAGE_KEY, JSON.stringify(merged));
        return merged;
      });
    } catch {
      // ignore
    }
  }, [form.preferredSkills]);

  const errorsByStep = useMemo(() => {
    const out = {};

    // Step 1 (merged): Basic + Classification + Pricing/Type + Duration
    out.core = {};
    if (!isClientAudience && !isFakeTemplate && String(form.orderCode || "").trim().length < 2) out.core.orderCode = "رقم الطلب مطلوب.";
    if (form.title.trim().length < 2) out.core.title = "عنوان المشروع مطلوب.";
    if (form.description.trim().length < 10) out.core.description = "وصف المشروع مطلوب (10 أحرف على الأقل).";
    if (!String(form.categoryId).trim()) out.core.categoryId = "يرجى اختيار التصنيف.";
    if (!["fixed", "bidding"].includes(form.projectType)) out.core.projectType = "يرجى اختيار نوع المشروع.";
    if (form.projectType === "fixed") {
      if (!(Number(form.budget) > 0)) out.core.budget = "يرجى إدخال ميزانية صحيحة أكبر من 0.";
    } else {
      if (!(Number(form.bidBudgetMin) > 0)) out.core.bidBudgetMin = "يرجى إدخال حد أدنى صحيح.";
      if (!(Number(form.bidBudgetMax) > 0)) out.core.bidBudgetMax = "يرجى إدخال حد أعلى صحيح.";
      if (Number(form.bidBudgetMax) < Number(form.bidBudgetMin)) out.core.bidBudgetMax = "الحد الأعلى يجب أن يكون >= الحد الأدنى.";
    }
    if (isFakeTemplate && form.projectType === "bidding") {
      if (!(Number(form.durationMin) > 0)) out.core.durationMin = "يرجى إدخال أدنى مدة صحيحة أكبر من 0.";
      if (!(Number(form.durationMax) > 0)) out.core.durationMax = "يرجى إدخال أقصى مدة صحيحة أكبر من 0.";
      if (Number(form.durationMax) < Number(form.durationMin)) out.core.durationMax = "أقصى المدة يجب أن يكون >= الأدنى.";
    } else if (!(Number(form.durationValue) > 0)) {
      out.core.durationValue = "يرجى إدخال مدة صحيحة أكبر من 0.";
    }
    if (!["days", "hours", "minutes"].includes(form.durationUnit)) out.core.durationUnit = "يرجى اختيار وحدة الزمن.";

    // Step 5: Assignment (optional)
    out.assignment = {};

    // Step 6: Files
    out.files = {};
    if (files.length > 5) out.files.files = "الحد الأقصى 5 ملفات.";
    else if (!validateOrderFilesSize(files).ok) out.files.files = ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR;

    // Step 7: Review
    out.review = {};

    return out;
  }, [form, files, isClientAudience, isFakeTemplate]);

  useEffect(() => {
    if (form.projectType === "bidding" && form.budget) {
      setForm((p) => ({ ...p, budget: "" }));
    }
  }, [form.projectType, form.budget]);

  const currentStepKey = steps[stepIdx]?.key;
  const currentErrors = useMemo(() => {
    return currentStepKey ? errorsByStep[currentStepKey] || {} : {};
  }, [currentStepKey, errorsByStep]);
  const stepValid = Object.keys(currentErrors).length === 0;
  const stepFirstErrorMessage = useMemo(() => {
    const keys = Object.keys(currentErrors);
    if (keys.length === 0) return "";
    if (keys.length > 1) return "يرجى إكمال جميع الحقول المطلوبة في هذه الخطوة.";
    return currentErrors[keys[0]] || "";
  }, [currentErrors]);

  const canSubmit = useMemo(() => {
    // Full-form validity (same rules as before)
    return Object.keys(errorsByStep.core).length === 0 && Object.keys(errorsByStep.files).length === 0;
  }, [errorsByStep]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await getCategoriesRequest();
        if (!cancelled) setCategories(res?.data || []);
      } catch (e) {
        if (!cancelled) push({ type: "error", title: "تعذر تحميل التصنيفات", message: e?.response?.data?.message || e?.message });
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [push]);

  useEffect(() => {
    // Category change resets detailed selection; detailed list is fetched below.
    setSubSubcategories([]);
    setSubSubBusy(false);
    setForm((prev) => ({ ...prev, subSubcategoryId: "" }));
  }, [form.categoryId]);

  useEffect(() => {
    // If the admin assigns a freelancer, archiving no longer applies.
    if (form.assignedFreelancerId) setArchiveOnCreate(false);
  }, [form.assignedFreelancerId]);

  useEffect(() => {
    let cancelled = false;
    async function loadSubSubs() {
      setSubSubcategories([]);
      setForm((prev) => ({ ...prev, subSubcategoryId: "" }));
      if (!form.categoryId) return;
      setSubSubBusy(true);
      try {
        // New behavior: fetch detailed list by category directly (no subcategory select)
        const res = await getCategorySubSubcategoriesRequest(form.categoryId);
        if (!cancelled) setSubSubcategories(res?.data?.subSubcategories || []);
      } catch {
        if (!cancelled) setSubSubcategories([]);
      } finally {
        if (!cancelled) setSubSubBusy(false);
      }
    }
    loadSubSubs();
    return () => {
      cancelled = true;
    };
  }, [form.categoryId]);

  const addFiles = (incoming) => {
    const list = Array.from(incoming || []);
    const next = [...files, ...list].slice(0, 5);
    if (!validateOrderFilesSize(next).ok) {
      push({ type: "error", title: "حجم الملفات", message: ORDER_UPLOAD_TOTAL_SIZE_MESSAGE_AR });
      return;
    }
    setFiles(next);
    if (list.length + files.length > 5) {
      push({ type: "error", title: "حد الملفات", message: "يمكنك رفع 5 ملفات كحد أقصى." });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const submitter = e?.nativeEvent?.submitter;
    if (!submitter || submitter.getAttribute("data-explicit-submit") !== "true" || !explicitSubmitClickRef.current) {
      explicitSubmitClickRef.current = false;
      return;
    }
    explicitSubmitClickRef.current = false;
    if (!canSubmit) {
      push({ type: "error", title: "تحقق من الحقول", message: "يرجى إكمال البيانات المطلوبة بشكل صحيح." });
      return;
    }
    if (isFakeTemplate) {
      if (typeof onSubmitFakeTemplate !== "function") {
        push({ type: "error", title: "إعدادات القالب", message: "لم يتم تهيئة حفظ القالب." });
        return;
      }
      setBusy(true);
      try {
        const finalDescription = form.description.trim();
        const selectedSs = subSubcategories.find((ss) => String(ss.id) === String(form.subSubcategoryId));
        const inferredSubcat = selectedSs?.subcategoryId != null ? Number(selectedSs.subcategoryId) : null;
        let minB;
        let maxB;
        let minD;
        let maxD;
        if (form.projectType === "fixed") {
          minB = maxB = Number(String(form.budget).replace(/,/g, "."));
          minD = maxD = Number(String(form.durationValue).replace(/,/g, "."));
        } else {
          minB = Number(String(form.bidBudgetMin).replace(/,/g, "."));
          maxB = Number(String(form.bidBudgetMax).replace(/,/g, "."));
          minD = Number(String(form.durationMin).replace(/,/g, "."));
          maxD = Number(String(form.durationMax).replace(/,/g, "."));
        }
        const payload = {
          title: form.title.trim(),
          description: finalDescription,
          categoryId: Number(form.categoryId),
          subcategoryId: Number.isFinite(inferredSubcat) && inferredSubcat > 0 ? inferredSubcat : null,
          subSubcategoryId: form.subSubcategoryId ? Number(form.subSubcategoryId) : null,
          skills: form.preferredSkills || [],
          minBudget: minB,
          maxBudget: maxB,
          minDuration: minD,
          maxDuration: maxD,
          durationUnit: form.durationUnit,
          isActive: form.isActiveTemplate !== false,
        };
        await onSubmitFakeTemplate(payload);
        push({ type: "success", title: "تم حفظ القالب", message: "تم تحديث قالب الطلبات التجريبية." });
        if (typeof onCreated === "function") onCreated({ ok: true });
      } catch (e2) {
        push({ type: "error", title: "تعذر حفظ القالب", message: e2?.response?.data?.message || e2?.message });
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (!isClientAudience) {
        fd.append("orderCode", String(form.orderCode).trim());
      }
      fd.append("title", form.title.trim());
      fd.append("description", form.description.trim());
      fd.append("categoryId", String(form.categoryId));
      fd.append("extraCategoryIds", JSON.stringify(form.extraCategoryIds || []));
      fd.append("extraCategoryDetails", JSON.stringify(extraCategoryDetails || {}));
      if (form.subSubcategoryId) fd.append("subSubcategoryId", String(form.subSubcategoryId));
      fd.append("projectType", form.projectType);
      if (form.projectType === "fixed") {
        fd.append("budget", String(Number(String(form.budget).replace(/,/g, "."))));
      } else {
        fd.append("bidBudgetMin", String(Number(String(form.bidBudgetMin).replace(/,/g, "."))));
        fd.append("bidBudgetMax", String(Number(String(form.bidBudgetMax).replace(/,/g, "."))));
      }
      fd.append("durationValue", String(Number(form.durationValue)));
      fd.append("durationUnit", form.durationUnit);
      fd.append("preferredSkills", JSON.stringify(form.preferredSkills || []));
      if (!isClientAudience) {
        if (form.assignedFreelancerId) fd.append("assignedFreelancerId", String(form.assignedFreelancerId));
        fd.append("archive", String(!form.assignedFreelancerId && archiveOnCreate));
      }
      files.forEach((f) => fd.append("files", f));

      const res = onSubmitFormData
        ? await onSubmitFormData(fd, { form, files })
        : isClientAudience
          ? await createClientOrderRequest(fd)
          : await adminCreateInternalOrderRequest(fd);
      const checkoutUrl = res?.data?.checkoutUrl || res?.checkoutUrl;
      if (isClientAudience && checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }
      const created = res?.data?.order ?? res?.order;
      push({
        type: "success",
        title: "تم إنشاء الطلب",
        message: isClientAudience
          ? `تم إنشاء الطلب «${form.title.trim()}».`
          : `رقم الطلب: ${created?.orderCode || ""}`.trim(),
      });
      if (typeof onCreated === "function") {
        onCreated(res);
        return;
      }
      // Reset for next order; skill names stay in local history for the searchable list only.
      setFiles([]);
      setStepIdx(0);
      setAttempted({});
      setForm((p) => ({
        ...p,
        ...makeInitialForm(),
      }));
      setAssignedFreelancer(null);
      // Stay on the create page to allow fast creation of the next order.
    } catch (e2) {
      push({ type: "error", title: "تعذر إنشاء الطلب", message: e2?.response?.data?.message || e2?.message });
    } finally {
      setBusy(false);
    }
  };

  const categoryOptions = useMemo(() => {
    return (Array.isArray(categories) ? categories : []).map((c) => ({
      value: String(c.id),
      label: c.name,
      meta: c.slug ? String(c.slug) : "",
    }));
  }, [categories]);

  const extraCategoryOptions = useMemo(() => {
    const primary = String(form.categoryId || "");
    const selected = new Set((form.extraCategoryIds || []).map((x) => String(x)));
    return categoryOptions.filter((o) => o.value !== primary && !selected.has(String(o.value)));
  }, [categoryOptions, form.categoryId, form.extraCategoryIds]);

  useEffect(() => {
    if (!extraCategoryOptions.length) setExtraCategoryPickerOpen(false);
  }, [extraCategoryOptions.length]);

  useEffect(() => {
    // Keep details map in sync: drop removed categories and load options for new ones.
    const ids = (form.extraCategoryIds || []).map((x) => String(x));
    setExtraCategoryDetails((prev) => {
      const next = {};
      for (const id of ids) {
        next[id] = prev[id] || "";
      }
      return next;
    });
    setExtraSubQueryByCat((prev) => {
      const next = {};
      for (const id of ids) next[id] = prev[id] || "";
      return next;
    });
    // fetch sub-subcategories for each extra category (small list, <=10)
    (async () => {
      for (const id of ids) {
        if (extraSubSubsByCat[id]) continue;
        setExtraSubBusyByCat((p) => ({ ...p, [id]: true }));
        try {
          const res = await getCategorySubSubcategoriesRequest(id);
          setExtraSubSubsByCat((p) => ({ ...p, [id]: res?.data?.subSubcategories || [] }));
        } catch {
          setExtraSubSubsByCat((p) => ({ ...p, [id]: [] }));
        } finally {
          setExtraSubBusyByCat((p) => ({ ...p, [id]: false }));
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.extraCategoryIds]);

  const subSubcategoryOptions = useMemo(() => {
    return (Array.isArray(subSubcategories) ? subSubcategories : []).map((ss) => ({
      value: String(ss.id),
      label: ss.name,
      meta: ss.slug ? String(ss.slug) : "",
    }));
  }, [subSubcategories]);

  const selectedFreelancerLabel = useMemo(() => {
    if (!form.assignedFreelancerId) return "غير معين";
    if (assignedFreelancer && String(assignedFreelancer.id) === String(form.assignedFreelancerId)) {
      return assignedFreelancer.displayName || assignedFreelancer.fullName || "مستقل";
    }
    return `مستقل #${form.assignedFreelancerId}`;
  }, [form.assignedFreelancerId, assignedFreelancer]);

  const goNext = () => {
    if (!stepValid) return;
    setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  };

  const goPrev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const markAttempted = () => {
    if (!currentStepKey) return;
    setAttempted((p) => ({ ...p, [currentStepKey]: true }));
  };

  useEffect(() => {
    if (!currentStepKey) return;
    // reset attempted flag when entering a step
    setAttempted((p) => ({ ...p, [currentStepKey]: false }));
  }, [currentStepKey]);

  const isModal = variant === "modal";

  const shell = (
    <>
      {!isModal ? (
        <section
          className="card co-create-order-page__head"
          style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
        >
          <div style={{ minWidth: 0, flex: "1 1 280px" }}>
            <h1 style={{ marginBottom: 6 }}>{isClientAudience ? "إنشاء طلب" : "إنشاء طلب (إداري)"}</h1>
            <p style={{ margin: 0 }}>
              {isClientAudience
                ? "نفس واجهة إنشاء الطلب مع صلاحيات العميل فقط وبدون تعيين مستقل."
                : "سيتم نشر الطلب مباشرةً بدون دفع. ويمكن إسناده لفريلانسر أثناء الإنشاء."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link className="btn btn-secondary" to={base}>
              العودة
            </Link>
            <Link className="btn btn-secondary" to={listPath}>
              كل الطلبات
            </Link>
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="form-grid form-co-flow" style={{ marginTop: isModal ? 0 : 14 }}>
        <section className="card" style={{ gridColumn: "span 12" }}>
          <div className="oh-stepper">
            {steps.map((s, idx) => (
              <button
                key={s.key}
                type="button"
                className={`oh-step ${idx === stepIdx ? "oh-step--active" : idx < stepIdx ? "oh-step--done" : ""}`.trim()}
                onClick={() => {
                  // Only allow jumping back freely; forward requires current step valid
                  if (idx <= stepIdx) setStepIdx(idx);
                }}
              >
                <span className="oh-step__num">{idx + 1}</span>
                <span className="oh-step__label">{s.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card" style={{ gridColumn: "span 12" }}>
          {currentStepKey === "core" ? (
            <div className="admin-co-fields">
              <div className="field admin-co-fields__span2">
                <span className="label">نوع الطلب</span>
                <div className="client-co-type-row">
                  <button
                    type="button"
                    className={form.projectType === "fixed" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => set("projectType", "fixed")}
                  >
                    سعر ثابت
                  </button>
                  <button
                    type="button"
                    className={form.projectType === "bidding" ? "btn btn-primary" : "btn btn-secondary"}
                    onClick={() => set("projectType", "bidding")}
                  >
                    مزايدة
                  </button>
                </div>
                <div className="help">
                  {isFakeTemplate
                    ? form.projectType === "fixed"
                      ? "سعر ثابت: ميزانية واحدة ومدة واحدة تُستخدم كنموذج للطلب التجريبي."
                      : "مزايدة: نطاق ميزانية ونطاق مدة يُستخدمان عند توليد الطلب الوهمي."
                    : form.projectType === "fixed"
                      ? "سعر ثابت: يُنشر في المعرض ويستلمه المستقل حسب تدفق الموافقات."
                      : isClientAudience
                        ? "مزايدة: يُنشر الطلب لاستقبال العروض، والدفع يتم لاحقًا عند اختيار عرض."
                        : "مزايدة: بدون نطاق سعر عند الإنشاء؛ المستقلون يقدّمون العروض وتدار العملية من لوحة الطلبات."}
                </div>
                <FieldError message={attempted.core ? errorsByStep.core.projectType : ""} />
              </div>

              {!isClientAudience && !isFakeTemplate ? (
                <div className="field admin-co-fields__span2">
                  <label className="label" htmlFor="adm-order-code">
                    رقم الطلب
                  </label>
                  <input
                    id="adm-order-code"
                    className="input"
                    value={form.orderCode}
                    placeholder="مثال: ORD-1001"
                    onChange={(e) => set("orderCode", e.target.value)}
                  />
                  <FieldError message={attempted.core ? errorsByStep.core.orderCode : ""} />
                </div>
              ) : null}

              <div className="field admin-co-fields__span2">
                <label className="label" htmlFor="adm-co-title">
                  عنوان المشروع
                </label>
                <input
                  id="adm-co-title"
                  className="input"
                  value={form.title}
                  placeholder="أدخل عنوان المشروع"
                  maxLength={200}
                  onChange={(e) => set("title", e.target.value)}
                />
                <FieldError message={attempted.core ? errorsByStep.core.title : ""} />
              </div>

              <div className="field admin-co-fields__span2">
                <label className="label" htmlFor="adm-co-desc">
                  وصف المطلوب
                </label>
                <textarea
                  id="adm-co-desc"
                  className="input"
                  rows={3}
                  value={form.description}
                  placeholder="اكتب وصف المشروع بشكل واضح ومفصل"
                  onChange={(e) => set("description", e.target.value)}
                />
                <FieldError message={attempted.core ? errorsByStep.core.description : ""} />
              </div>

              <div className="admin-co-fields__row4 admin-co-fields__span2">
                <div className="field" style={{ order: 10, gridColumn: "span 2" }}>
                  <label className="label" htmlFor="adm-co-cat">
                    التصنيف
                  </label>
                  <select
                    id="adm-co-cat"
                    className="input"
                    value={form.categoryId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSubSubcategories([]);
                      setSubSubBusy(false);
                      setExtraCategoryPickerOpen(false);
                      setForm((p) => ({
                        ...p,
                        categoryId: v,
                        subSubcategoryId: "",
                      }));
                    }}
                  >
                    <option value="">— اختر —</option>
                    {categoryOptions.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <FieldError message={attempted.core ? errorsByStep.core.categoryId : ""} />
                </div>

                {!isFakeTemplate ? (
                  <div className="field admin-co-fields__row4-span4" style={{ order: 30 }}>
                    <label className="label" style={{ display: "block", marginBottom: 6 }}>
                      تصنيفات إضافية (اختياري)
                    </label>

                    <div style={{ display: "grid", gap: 12 }}>
                      {(form.extraCategoryIds || []).map((id) => {
                      const catLabel = categoryOptions.find((o) => String(o.value) === String(id))?.label || id;
                      const list = Array.isArray(extraSubSubsByCat[String(id)]) ? extraSubSubsByCat[String(id)] : [];
                      const detailOptions = list.map((ss) => ({
                        value: String(ss.id),
                        label: ss.name,
                        meta: ss.slug ? String(ss.slug) : "",
                      }));
                      return (
                        <div
                          key={String(id)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                            gap: 12,
                            alignItems: "start",
                          }}
                        >
                          <div className="field">
                            <span className="label">التصنيف</span>
                            <div className="input" style={{ display: "flex", alignItems: "center", minHeight: 40, fontWeight: 700 }}>
                              {catLabel}
                            </div>
                          </div>
                          <div className="field">
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <span className="label" style={{ margin: 0 }}>
                                التصنيف التفصيلي
                              </span>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                style={{ padding: "6px 10px", whiteSpace: "nowrap", fontSize: "0.78rem" }}
                                onClick={() =>
                                  setForm((p) => ({
                                    ...p,
                                    extraCategoryIds: (p.extraCategoryIds || []).filter((x) => String(x) !== String(id)),
                                  }))
                                }
                              >
                                إزالة
                              </button>
                            </div>
                            <SearchableSelect
                              value={extraCategoryDetails[String(id)] || ""}
                              onChange={(v) =>
                                setExtraCategoryDetails((p) => ({
                                  ...p,
                                  [String(id)]: String(v || ""),
                                }))
                              }
                              placeholder="اختر التصنيف التفصيلي (اختياري)"
                              options={detailOptions}
                              busy={Boolean(extraSubBusyByCat[String(id)])}
                              query={extraSubQueryByCat[String(id)] || ""}
                              onQueryChange={(q) =>
                                setExtraSubQueryByCat((p) => ({
                                  ...p,
                                  [String(id)]: q,
                                }))
                              }
                              searchPlaceholder="ابحث عن التصنيف التفصيلي…"
                              disabled={Boolean(extraSubBusyByCat[String(id)])}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {!(form.extraCategoryIds || []).length ? <span className="help">لا توجد تصنيفات إضافية.</span> : null}
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 8, justifyItems: "stretch" }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: "6px 14px", fontSize: "0.82rem", fontWeight: 700, width: "fit-content" }}
                      disabled={!form.categoryId || !extraCategoryOptions.length}
                      title={
                        !form.categoryId
                          ? "اختر التصنيف الرئيسي أولاً"
                          : !extraCategoryOptions.length
                            ? "لا يوجد تصنيف إضافي متاح"
                            : ""
                      }
                      onClick={() => setExtraCategoryPickerOpen((o) => !o)}
                    >
                      {extraCategoryPickerOpen ? "إغلاق" : "إضافة تصنيف إضافي"}
                    </button>
                    {extraCategoryPickerOpen ? (
                      <div className="field" style={{ marginBottom: 0 }}>
                        <SearchableSelect
                          value=""
                          onChange={(v) => {
                            if (!v) return;
                            setForm((p) => ({
                              ...p,
                              extraCategoryIds: Array.from(new Set([...(p.extraCategoryIds || []), String(v)])).slice(0, 10),
                            }));
                            setExtraCategoryQuery("");
                            setExtraCategoryPickerOpen(false);
                          }}
                          placeholder="اختر تصنيفاً إضافياً"
                          options={extraCategoryOptions}
                          busy={false}
                          query={extraCategoryQuery}
                          onQueryChange={setExtraCategoryQuery}
                          searchPlaceholder="ابحث عن تصنيف…"
                          disabled={!form.categoryId}
                        />
                      </div>
                    ) : null}
                  </div>
                  </div>
                ) : null}

                <div className="field" style={{ order: 11, gridColumn: "span 2" }}>
                  <label className="label" htmlFor="adm-co-ss">
                    تفصيلي
                  </label>
                  <select
                    id="adm-co-ss"
                    className="input"
                    value={form.subSubcategoryId}
                    onChange={(e) => set("subSubcategoryId", e.target.value)}
                    disabled={!form.categoryId || subSubBusy}
                  >
                    <option value="">{subSubBusy ? "…" : "— بدون —"}</option>
                    {subSubcategoryOptions.map((ss) => (
                      <option key={ss.value} value={ss.value}>
                        {ss.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.projectType === "fixed" ? (
                  <div className="field" style={{ order: 41, gridColumn: "span 2" }}>
                    <label className="label" htmlFor="adm-co-budget">
                      الميزانية
                    </label>
                    <div className="oh-price-with-unit">
                      <input
                        id="adm-co-budget"
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        type="text"
                        value={form.budget}
                        placeholder="250"
                        onChange={(e) => set("budget", e.target.value)}
                      />
                      <span className="oh-price-with-unit__suffix" dir="ltr">
                        JOD
                      </span>
                    </div>
                    <FieldError message={attempted.core ? errorsByStep.core.budget : ""} />
                  </div>
                ) : (
                  <div className="field" style={{ order: 41, gridColumn: "span 2" }}>
                    <span className="label">نطاق الميزانية</span>
                    <div className="client-order-modal__bid-pair client-order-modal__bid-pair--with-currency">
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        type="text"
                        value={form.bidBudgetMin}
                        placeholder="الحد الأدنى"
                        onChange={(e) => set("bidBudgetMin", e.target.value)}
                      />
                      <span className="client-order-modal__bid-sep">–</span>
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="decimal"
                        type="text"
                        value={form.bidBudgetMax}
                        placeholder="الحد الأعلى"
                        onChange={(e) => set("bidBudgetMax", e.target.value)}
                      />
                      <span className="oh-price-with-unit__suffix" dir="ltr">
                        JOD
                      </span>
                    </div>
                    <FieldError message={attempted.core ? errorsByStep.core.bidBudgetMin || errorsByStep.core.bidBudgetMax : ""} />
                  </div>
                )}
              </div>

              {isFakeTemplate && form.projectType === "bidding" ? (
                <>
                  <div className="field admin-co-fields__span2">
                    <span className="label">نطاق مدة التسليم</span>
                    <div className="client-order-modal__bid-pair">
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="numeric"
                        type="text"
                        value={form.durationMin}
                        placeholder="الأدنى"
                        onChange={(e) => set("durationMin", e.target.value)}
                      />
                      <span className="client-order-modal__bid-sep">–</span>
                      <input
                        className="input"
                        dir="ltr"
                        inputMode="numeric"
                        type="text"
                        value={form.durationMax}
                        placeholder="الأعلى"
                        onChange={(e) => set("durationMax", e.target.value)}
                      />
                    </div>
                    <FieldError
                      message={
                        attempted.core
                          ? errorsByStep.core.durationMin || errorsByStep.core.durationMax || errorsByStep.core.durationValue
                          : ""
                      }
                    />
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="adm-co-unit-tpl">
                      الوحدة
                    </label>
                    <select
                      id="adm-co-unit-tpl"
                      className="input"
                      value={form.durationUnit}
                      onChange={(e) => set("durationUnit", e.target.value)}
                    >
                      <option value="days">أيام</option>
                      <option value="hours">ساعات</option>
                      <option value="minutes">دقائق</option>
                    </select>
                    <FieldError message={attempted.core ? errorsByStep.core.durationUnit : ""} />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label className="label" htmlFor="adm-co-dur">
                      مدة التسليم
                    </label>
                    <input
                      id="adm-co-dur"
                      className="input"
                      dir="ltr"
                      inputMode="numeric"
                      type="text"
                      value={form.durationValue}
                      placeholder="7"
                      onChange={(e) => set("durationValue", e.target.value)}
                    />
                    <FieldError message={attempted.core ? errorsByStep.core.durationValue : ""} />
                  </div>

                  <div className="field">
                    <label className="label" htmlFor="adm-co-unit">
                      الوحدة
                    </label>
                    <select id="adm-co-unit" className="input" value={form.durationUnit} onChange={(e) => set("durationUnit", e.target.value)}>
                      <option value="days">أيام</option>
                      <option value="hours">ساعات</option>
                      <option value="minutes">دقائق</option>
                    </select>
                    <FieldError message={attempted.core ? errorsByStep.core.durationUnit : ""} />
                  </div>
                </>
              )}

              <div className="field admin-co-fields__span2">
                <span className="label">المهارات المطلوبة</span>
                <SkillsTagsInput
                  value={form.preferredSkills}
                  onChange={(v) => set("preferredSkills", v)}
                  placeholder="أضف المهارات المطلوبة"
                  historySkills={skillHistory}
                />
              </div>
            </div>
          ) : null}

          {!isClientAudience && currentStepKey === "assignment" && !isFakeTemplate ? (
            <>
              <h2 style={{ marginBottom: 10 }}>5) الإسناد (اختياري)</h2>
              <div className="form-grid">
                <div className="field" style={{ gridColumn: "span 12" }}>
                  <label>اختيار المستقل</label>
                  <div className="help" style={{ marginBottom: 8 }}>
                    يتم عرض المستقلون النشطون وغير النشطين؛ يمكن الإسناد فقط للمستقل المؤهل (حساب نشط، بريد موثّق، اشتراك يسمح باستلام
                    الطلبات).
                  </div>
                  <AdminFreelancerSelector
                    active={currentStepKey === "assignment"}
                    value={form.assignedFreelancerId}
                    selectedFreelancer={assignedFreelancer}
                    disabled={busy}
                    onChange={({ assignedFreelancerId: nextId, assignedFreelancer: nextFl }) => {
                      set("assignedFreelancerId", nextId || "");
                      setAssignedFreelancer(nextFl);
                    }}
                  />
                </div>
              </div>
            </>
          ) : null}

          {isFakeTemplate && currentStepKey === "assignment" ? (
            <>
              <h2 style={{ marginBottom: 10 }}>5) الإسناد</h2>
              <div className="form-grid">
                <div className="field" style={{ gridColumn: "span 12" }}>
                  <p className="help" style={{ marginBottom: 12 }}>
                    قوالب الطلبات التجريبية لا تدعم إسناد مستقل؛ تُستخدم فقط كأساس لتوليد طلبات وهمية في الجولات.
                  </p>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.isActiveTemplate !== false}
                      onChange={(e) => set("isActiveTemplate", e.target.checked)}
                    />
                    القالب نشط ويُستخدم عند توليد الجولات
                  </label>
                </div>
              </div>
            </>
          ) : null}

          {currentStepKey === "files" ? (
            <>
              <h2 style={{ marginBottom: 10 }}>6) الملفات (اختياري)</h2>
              {isFakeTemplate ? (
                <p className="help" style={{ marginBottom: 12 }}>
                  المرفقات لا تُخزَّن مع قوالب الطلبات التجريبية حالياً؛ يمكنك تجاوز هذه الخطوة.
                </p>
              ) : null}
              <div
                className="dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="co-dropzone-title">
                  اسحب الملفات هنا أو اضغط للاختيار (حد أقصى 5 ملفات)
                </div>
                <div className="help">يمكنك إضافة ملفات المشروع (اختياري).</div>
                <div className="help" style={{ marginTop: 6 }}>
                  {ORDER_UPLOAD_TOTAL_SIZE_HELPER_AR}
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => addFiles(e.target.files)}
                />

                <FieldError message={errorsByStep.files.files || ""} />

                {files.length ? (
                  <div style={{ marginTop: 12 }}>
                    <div className="help">الملفات المختارة:</div>
                    <ul className="co-dropzone-files">
                      {files.map((f, idx) => (
                        <li key={`${f.name}-${idx}`} className="co-dropzone-files__item">
                          <span className="co-dropzone-files__name">{f.name}</span>
                          <span className="co-dropzone-files__meta" dir="ltr">
                            ({(Math.round((f.size / 1024) * 10) / 10).toLocaleString("en-US")} KB)
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                        disabled={files.length >= 5}
                        title={files.length >= 5 ? "وصلت إلى الحد الأقصى (5 ملفات)" : "إضافة ملفات أخرى"}
                      >
                        إضافة ملفات أخرى
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => setFiles([])}>
                        مسح الملفات
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {currentStepKey === "review" ? (
            <>
              <h2 style={{ marginBottom: 10 }}>7) مراجعة وإرسال</h2>
              <div className="oh-review">
                <CreateOrderReviewRow label="العنوان">{form.title.trim() || "—"}</CreateOrderReviewRow>
                <CreateOrderReviewRow label="الوصف" multiline>
                  {form.description.trim() || "—"}
                </CreateOrderReviewRow>
                <div className="oh-review__2col">
                  <CreateOrderReviewRow label="التصنيف">
                    {categories.find((c) => String(c.id) === String(form.categoryId))?.name || "—"}
                  </CreateOrderReviewRow>
                  <CreateOrderReviewRow label="التصنيف التفصيلي">
                    {form.subSubcategoryId
                      ? subSubcategories.find((ss) => String(ss.id) === String(form.subSubcategoryId))?.name || "—"
                      : "—"}
                  </CreateOrderReviewRow>
                </div>
                <CreateOrderReviewRow label="المهارات المطلوبة">
                  {Array.isArray(form.preferredSkills) && form.preferredSkills.length
                    ? form.preferredSkills.join("، ")
                    : "لا توجد مهارات محددة مطلوبة"}
                </CreateOrderReviewRow>
                <div className="oh-review__2col">
                  <CreateOrderReviewRow label="نوع المشروع">
                    {form.projectType === "fixed" ? "سعر ثابت" : form.projectType === "bidding" ? "مزايدة" : "—"}
                  </CreateOrderReviewRow>
                  <CreateOrderReviewRow label="الميزانية">
                    <span dir="ltr" style={{ display: "inline-block", textAlign: "right", width: "100%" }}>
                      {form.projectType === "bidding"
                        ? isClientAudience || isFakeTemplate
                          ? `${formatMoney(form.bidBudgetMin)} – ${formatMoney(form.bidBudgetMax)} JOD`
                          : "—"
                        : `${formatMoney(form.budget)} JOD`}
                    </span>
                  </CreateOrderReviewRow>
                </div>
                <CreateOrderReviewRow label="مدة التسليم">
                  {isFakeTemplate && form.projectType === "bidding"
                    ? form.durationMin && form.durationMax
                      ? `${form.durationMin} – ${form.durationMax} ${
                          form.durationUnit === "days" ? "أيام" : form.durationUnit === "hours" ? "ساعات" : "دقائق"
                        }`
                      : "—"
                    : form.durationValue
                      ? `${form.durationValue} ${
                          form.durationUnit === "days"
                            ? form.durationValue >= 3 && form.durationValue <= 10
                              ? "أيام"
                              : form.durationValue === 2
                                ? "يومين"
                                : "يوم"
                            : form.durationUnit === "hours"
                              ? form.durationValue >= 3 && form.durationValue <= 10
                                ? "ساعات"
                                : form.durationValue === 2
                                  ? "ساعتين"
                                  : "ساعة"
                              : form.durationValue >= 3 && form.durationValue <= 10
                                ? "دقائق"
                                : form.durationValue === 2
                                  ? "دقيقتين"
                                  : "دقيقة"
                        }`
                      : "—"}
                </CreateOrderReviewRow>
                {!isClientAudience && !isFakeTemplate ? (
                  <CreateOrderReviewRow label="المستقل">{selectedFreelancerLabel || "غير معين"}</CreateOrderReviewRow>
                ) : null}
                {isFakeTemplate ? (
                  <CreateOrderReviewRow label="حالة القالب">
                    {form.isActiveTemplate !== false ? "نشط" : "معطّل"}
                  </CreateOrderReviewRow>
                ) : null}
                <CreateOrderReviewRow label="الملفات">
                  {files.length ? `${files.length} ملفات` : "لا توجد ملفات مضافة"}
                </CreateOrderReviewRow>

                <div className="oh-review__note">
                  {isFakeTemplate
                    ? "سيتم حفظ القالب في قوالب الطلبات التجريبية فقط — دون إنشاء طلب حقيقي."
                    : isClientAudience
                      ? form.projectType === "fixed"
                        ? "بعد المتابعة للدفع، سيتم تفعيل الطلب ونشره في المعرض."
                        : "سيتم نشر الطلب لاستقبال العروض، والدفع يتم عند اختيار عرض."
                      : form.assignedFreelancerId
                        ? "سيتم تعيين الطلب مباشرة لهذا المستقل"
                        : archiveOnCreate
                          ? "سيتم حفظ الطلب في الأرشيف (غير نشط الآن). يمكنك تفعيله لاحقاً من لوحة التحكم."
                          : "سيتم نشر الطلب في قائمة الطلبات المتاحة"}
                </div>

                {!isClientAudience && !form.assignedFreelancerId && !isFakeTemplate ? (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={archiveOnCreate}
                        onChange={(e) => setArchiveOnCreate(e.target.checked)}
                      />
                      حفظ في الأرشيف (غير نشط الآن)
                    </label>
                    <div className="help" style={{ marginTop: 6 }}>
                      عند تفعيل هذا الخيار لن يظهر الطلب في قائمة الطلبات المتاحة. يمكنك تفعيله لاحقاً.
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <section
          className="card"
          style={{
            gridColumn: "span 12",
            display: "flex",
            gap: 10,
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn btn-secondary" onClick={goPrev} disabled={stepIdx === 0 || busy}>
              السابق
            </button>
            {currentStepKey !== "review" ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  markAttempted();
                  if (!stepValid) return;
                  goNext();
                }}
                disabled={busy}
              >
                التالي
              </button>
            ) : (
              <button
                className="btn btn-primary"
                type="submit"
                data-explicit-submit="true"
                onClick={() => {
                  explicitSubmitClickRef.current = true;
                }}
                disabled={!canSubmit || busy}
              >
                {busy
                  ? isFakeTemplate
                    ? "جارٍ الحفظ…"
                    : "جارٍ الإنشاء…"
                  : isFakeTemplate
                    ? "حفظ القالب"
                    : isClientAudience
                      ? form.projectType === "fixed"
                        ? "المتابعة إلى الدفع"
                        : "نشر الطلب لاستقبال العروض"
                      : "إنشاء الطلب"}
              </button>
            )}
          </div>

          {!stepValid && currentStepKey !== "review" && attempted[currentStepKey] ? (
            <div className="oh-inline-alert" role="status" aria-live="polite">
              {stepFirstErrorMessage || "أكمل الحقول المطلوبة في هذه الخطوة للمتابعة."}
            </div>
          ) : null}
        </section>
      </form>
    </>
  );

  if (isModal) {
    return <div className="admin-internal-wizard admin-internal-wizard--modal">{shell}</div>;
  }

  return (
    <main className="container page-content co-create-order-page">{shell}</main>
  );
}

