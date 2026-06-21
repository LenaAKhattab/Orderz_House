import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import PlanCollapsibleSection from "./PlanCollapsibleSection";
import PlanFormSection from "./PlanFormSection";
import PlanToggle from "./PlanToggle";
import { PLAN_FORM_SECTIONS, getPlanFormCopy } from "./planFormUiCopy";
import { getPlanFormWarnings } from "./planFormWarnings";

function Field({ label, hint, children, style }) {
  return (
    <div className="oh-sapl-field" style={style}>
      <span className="oh-sapl-field__label">{label}</span>
      {hint ? <p className="oh-sapl-field__hint">{hint}</p> : null}
      {children}
    </div>
  );
}

function Grid({ children, className = "", style }) {
  return (
    <div className={`oh-sapl-grid ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

function useMobileAccordionLayout() {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return mobile;
}

/**
 * Tabbed (desktop) / accordion (mobile) plan form — all fields, same payload keys.
 * @param {{
 *   form: Record<string, unknown>;
 *   setForm: import("react").Dispatch<import("react").SetStateAction<Record<string, unknown>>>;
 *   submitting?: boolean;
 *   mode: "create" | "edit";
 * }} p
 */
export default function PlanFormModalBody({
  form,
  setForm,
  submitting = false,
  mode,
}) {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const copy = useMemo(() => getPlanFormCopy(isEn), [isEn]);
  const warnings = useMemo(() => getPlanFormWarnings(form), [form]);
  const mobileAccordion = useMobileAccordionLayout();
  const [activeTab, setActiveTab] = useState("basic");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const sectionLabel = (section) => (isEn ? section.labelEn : section.labelAr);

  const sections = {
    basic: (
      <PlanFormSection
        hint={
          isEn
            ? "Title and description shown to freelancers."
            : "العنوان والوصف كما يظهران للمستقلين."
        }
      >
        <Field label={isEn ? "Title" : "العنوان"}>
          <input
            className="oh-sapl-input"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder={isEn ? "Professional freelancer plan" : "باقة احترافية للمستقلين"}
            disabled={submitting}
          />
        </Field>
        <Field label={isEn ? "Short description" : "وصف مختصر"}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={isEn ? "Optional" : "اختياري"}
            disabled={submitting}
          />
        </Field>
        <Field label={isEn ? "Duration (days)" : "المدة (أيام)"} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            type="number"
            min={1}
            max={3650}
            value={form.durationDays}
            onChange={(e) => set("durationDays", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    pricing: (
      <PlanFormSection
        hint={
          isEn
            ? "Prices shown to freelancers and used for Stripe when applicable."
            : "الأسعار كما تُعرض للمستقلين وتُستخدم في Stripe عند الحاجة."
        }
      >
        <Grid className="oh-sapl-grid--2">
          <Field label={isEn ? "Total price (JOD)" : "السعر الإجمالي (د.أ)"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.priceJod}
              onChange={(e) => set("priceJod", e.target.value)}
              placeholder={isEn ? "0 = free" : "0 = مجاني"}
              disabled={submitting}
            />
          </Field>
          <Field
            label={isEn ? "Stripe checkout amount (JOD)" : "المبلغ المحصّل عبر Stripe (د.أ)"}
            hint={copy.stripeAmountHelper}
          >
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.stripeCheckoutAmountJod}
              onChange={(e) => set("stripeCheckoutAmountJod", e.target.value)}
              placeholder={isEn ? "Empty = total price" : "فارغ = السعر الإجمالي"}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field label={isEn ? "Payment notes" : "ملاحظات الدفع"} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.paymentNotes}
            onChange={(e) => set("paymentNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>
        <p className="oh-sapl-form-subhint">{copy.installmentsHint}</p>
        <Grid className="oh-sapl-grid--3" style={{ marginTop: 8 }}>
          <Field label={isEn ? "Upfront installment (JOD)" : "قسط أول (د.أ)"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.installmentUpfrontJod}
              onChange={(e) => set("installmentUpfrontJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Monthly installment (JOD)" : "قسط شهري (د.أ)"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.installmentMonthlyJod}
              onChange={(e) => set("installmentMonthlyJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Number of months" : "عدد الأشهر"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={1}
              max={120}
              value={form.installmentMonths}
              onChange={(e) => set("installmentMonths", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field label={isEn ? "Installment notes" : "ملاحظات الأقساط"} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            value={form.installmentNotes}
            onChange={(e) => set("installmentNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    limits: (
      <PlanFormSection
        hint={
          isEn
            ? "Order value band and user-facing activation/refund text."
            : "نطاق قيمة الطلبات ونصوص التفعيل والاسترداد للمستخدم."
        }
      >
        <Grid className="oh-sapl-grid--2">
          <Field label={isEn ? "Minimum order value (JOD)" : "حد أدنى لقيمة الطلب (د.أ)"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.orderValueMinJod}
              onChange={(e) => set("orderValueMinJod", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Maximum order value (JOD)" : "حد أقصى لقيمة الطلب (د.أ)"}>
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.orderValueMaxJod}
              onChange={(e) => set("orderValueMaxJod", e.target.value)}
              placeholder={isEn ? "Empty = no upper limit" : "فارغ = بدون حد أعلى"}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field
          label={isEn ? "Activation conditions (display text)" : "شروط التفعيل المعروضة للمستخدم"}
          hint={copy.activationHelper}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.activationRequirements}
            onChange={(e) => set("activationRequirements", e.target.value)}
            disabled={submitting}
          />
        </Field>
        <Field label={isEn ? "Refund policy" : "سياسة الاسترداد"} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.refundPolicy}
            onChange={(e) => set("refundPolicy", e.target.value)}
            disabled={submitting}
          />
        </Field>
      </PlanFormSection>
    ),

    availability: (
      <PlanFormSection
        hint={
          isEn
            ? "Control assignment, public listing, self-checkout, and company visit."
            : "التحكم في الإسناد، الظهور العام، الشراء الذاتي، والزيارة الميدانية."
        }
      >
        <div className="oh-sapl-options">
          <PlanToggle
            label={isEn ? "Plan is active" : "الباقة مفعّلة"}
            description={
              isEn ? "When disabled, not used for new assignments." : "عند التعطيل لن تُستخدم في إسناد جديد."
            }
            checked={form.isActive}
            disabled={submitting}
            onChange={(v) => set("isActive", v)}
          />
          <PlanToggle
            label={isEn ? "Show on public plans list" : "الظهور في قائمة الباقات العامة"}
            description={
              isEn ? "Hide from the plans page without deleting." : "إخفاء الباقة عن صفحة الباقات دون حذفها."
            }
            checked={form.isVisible}
            disabled={submitting}
            onChange={(v) => set("isVisible", v)}
          />
          <PlanToggle
            label={isEn ? "Self-purchase via Stripe" : "متاحة للشراء الذاتي (Stripe)"}
            description={
              isEn
                ? "Requires a payable amount (total price or Stripe amount) greater than zero."
                : "يتطلب مبلغ دفع (السعر أو مبلغ Stripe) أكبر من صفر."
            }
            checked={form.selfSubscribeAllowed}
            disabled={submitting}
            onChange={(v) => set("selfSubscribeAllowed", v)}
          />
          <PlanToggle
            label={isEn ? "Requires company visit" : "يتطلب زيارة ميدانية للشركة"}
            checked={form.requiresCompanyVisit}
            disabled={submitting}
            onChange={(v) => set("requiresCompanyVisit", v)}
          />
        </div>
      </PlanFormSection>
    ),

    marketing: (
      <PlanFormSection hint={isEn ? "One line per feature or training." : "سطر واحد لكل ميزة أو تدريب."}>
        <Field label={isEn ? "Includes (feature list)" : "يشمل (قائمة المميزات)"}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={5}
            value={form.featuresText}
            onChange={(e) => set("featuresText", e.target.value)}
            placeholder={isEn ? "e.g. Contract signing at company office" : "مثال: توقيع العقد داخل مقر الشركة"}
            disabled={submitting}
          />
        </Field>
        <Field label={isEn ? "Included trainings" : "التدريبات المشمولة"} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={4}
            value={form.trainingsText}
            onChange={(e) => set("trainingsText", e.target.value)}
            placeholder={isEn ? "One line per training" : "سطر لكل تدريب"}
            disabled={submitting}
          />
        </Field>
        <div className="oh-sapl-options" style={{ marginTop: 12 }}>
          <PlanToggle
            label={isEn ? "Featured plan (visual highlight)" : "باقة مميزة (تمييز بصري)"}
            checked={form.isFeatured}
            disabled={submitting}
            onChange={(v) => set("isFeatured", v)}
          />
          <PlanToggle
            label={isEn ? "Most popular (badge)" : "الأكثر شيوعاً (شارة)"}
            checked={form.isPopular}
            disabled={submitting}
            onChange={(v) => set("isPopular", v)}
          />
        </div>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={isEn ? "Special offer label" : "نص العرض الخاص"}>
            <input
              className="oh-sapl-input"
              value={form.offerLabel}
              onChange={(e) => set("offerLabel", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Offer expires" : "انتهاء العرض"}>
            <input
              className="oh-sapl-input"
              type="date"
              value={form.offerExpiresAt}
              onChange={(e) => set("offerExpiresAt", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </Grid>
      </PlanFormSection>
    ),
  };

  return (
    <div className="oh-sapl-form oh-sapl-form--wide oh-sapl-form-modal">
      {warnings.length > 0 ? (
        <ul className="oh-sapl-form-warnings" role="status" aria-live="polite">
          {warnings.map((w) => (
            <li key={w.key}>{copy[w.messageKey]}</li>
          ))}
        </ul>
      ) : null}

      {mobileAccordion ? (
        <div className="oh-sapl-form-accordion">
          {PLAN_FORM_SECTIONS.map((section, index) => (
            <PlanCollapsibleSection
              key={section.id}
              id={`oh-sapl-form-section-${section.id}`}
              title={sectionLabel(section)}
              defaultOpen={index === 0}
              className="oh-sapl-form-accordion__section"
            >
              {sections[section.id]}
            </PlanCollapsibleSection>
          ))}
        </div>
      ) : (
        <div className="oh-sapl-form-tabs">
          <div
            className="oh-sapl-form-tabs__nav"
            role="tablist"
            aria-label={isEn ? "Plan form sections" : "أقسام نموذج الباقة"}
          >
            {PLAN_FORM_SECTIONS.map((section) => {
              const selected = activeTab === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  id={`oh-sapl-tab-${section.id}`}
                  aria-selected={selected}
                  aria-controls={`oh-sapl-panel-${section.id}`}
                  tabIndex={selected ? 0 : -1}
                  className={`oh-sapl-form-tabs__tab${selected ? " oh-sapl-form-tabs__tab--active" : ""}`}
                  onClick={() => setActiveTab(section.id)}
                >
                  {sectionLabel(section)}
                </button>
              );
            })}
          </div>
          {PLAN_FORM_SECTIONS.map((section) => (
            <div
              key={section.id}
              id={`oh-sapl-panel-${section.id}`}
              role="tabpanel"
              aria-labelledby={`oh-sapl-tab-${section.id}`}
              hidden={activeTab !== section.id}
              className="oh-sapl-form-tabs__panel"
            >
              {sections[section.id]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
