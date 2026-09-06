import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import PlanCollapsibleSection from "./PlanCollapsibleSection";
import PlanFormSection from "./PlanFormSection";
import PlanToggle from "./PlanToggle";
import { PLAN_FORM_SECTIONS, getPlanFormCopy } from "./planFormUiCopy";
import {
  formatCheckoutPlanOptionLabel,
  formatPlanPageOptionLabel,
  isLinkedCheckoutRequired,
  shouldShowLinkedCheckoutField,
} from "./planFormLinkingUtils";
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
 *   planPages?: object[];
 *   canonicalPlans?: object[];
 *   excludePlanId?: string | number | null;
 *   readOnlyInternalName?: string;
 * }} p
 */
export default function PlanFormModalBody({
  form,
  setForm,
  submitting = false,
  mode,
  planPages = [],
  canonicalPlans = [],
  excludePlanId = null,
  readOnlyInternalName = "",
}) {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const copy = useMemo(() => getPlanFormCopy(isEn), [isEn]);
  const warnings = useMemo(() => getPlanFormWarnings(form), [form]);
  const mobileAccordion = useMobileAccordionLayout();
  const [activeTab, setActiveTab] = useState("basic");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const showLinkedCheckout = shouldShowLinkedCheckoutField(form, planPages);
  const linkedCheckoutRequired = isLinkedCheckoutRequired(form, planPages);
  const checkoutPlanOptions = useMemo(
    () =>
      (canonicalPlans || []).filter(
        (plan) => excludePlanId == null || String(plan.id) !== String(excludePlanId),
      ),
    [canonicalPlans, excludePlanId],
  );

  const sectionLabel = (section) => (isEn ? section.labelEn : section.labelAr);

  const internalNamePreview =
    mode === "edit"
      ? String(form.internalName || "").trim()
      : String(readOnlyInternalName || "").trim();

  const sections = {
    basic: (
      <PlanFormSection
        hint={
          isEn
            ? "Title and description shown to freelancers."
            : "العنوان والوصف كما يظهران للمستقلين."
        }
      >
        {internalNamePreview ? (
          <Field
            label={isEn ? "Internal name (read-only)" : "الاسم الداخلي (للقراءة فقط)"}
            hint={
              isEn
                ? "Used by checkout and subscriptions. Cannot be changed after creation."
                : "يُستخدم في الدفع والاشتراكات. لا يمكن تغييره بعد الإنشاء."
            }
          >
            <input
              className="oh-sapl-input oh-sapl-input--readonly"
              dir="ltr"
              value={internalNamePreview}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          </Field>
        ) : null}
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
        <p className="oh-sapl-form-subhint" style={{ marginTop: 16 }}>
          {isEn ? "English copy (optional — shown on EN locale)" : "النسخة الإنجليزية (اختياري — تظهر عند اختيار الإنجليزية)"}
        </p>
        <Field label={isEn ? "Title (English)" : "العنوان (إنجليزي)"}>
          <input
            className="oh-sapl-input"
            dir="ltr"
            value={form.titleEn}
            onChange={(e) => set("titleEn", e.target.value)}
            placeholder="Professional freelancer plan"
            disabled={submitting}
          />
        </Field>
        <Field label={isEn ? "Short description (English)" : "وصف مختصر (إنجليزي)"} style={{ marginTop: 12 }}>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={3}
            value={form.descriptionEn}
            onChange={(e) => set("descriptionEn", e.target.value)}
            placeholder={isEn ? "Optional" : "اختياري"}
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
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={isEn ? "Currency" : "العملة"}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              maxLength={3}
              value={form.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
              placeholder="JOD"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Field
          label={isEn ? "Text between billing period and price" : "النص بين مدة الباقة والسعر"}
          hint={
            isEn
              ? "Shown on the public plan card between the billing period and the price."
              : "يظهر في بطاقة الباقة العامة بين مدة الاشتراك والسعر."
          }
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.priceIntroText}
            onChange={(e) => set("priceIntroText", e.target.value)}
            placeholder={
              isEn
                ? "Example: Suitable for beginners or freelancers"
                : "مثال: مناسب للمبتدئين أو مناسب للعمل الحر"
            }
            disabled={submitting}
          />
        </Field>
        <Field
          label={isEn ? "Text between billing period and price (English)" : "النص بين مدة الباقة والسعر (إنجليزي)"}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={3}
            value={form.priceIntroTextEn}
            onChange={(e) => set("priceIntroTextEn", e.target.value)}
            placeholder="Example: Suitable for beginners or freelancers"
            disabled={submitting}
          />
        </Field>
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

        <div className="oh-sapl-sale-block" style={{ marginTop: 20 }}>
          <h4 className="oh-sapl-sale-block__title">
            {isEn ? "Plan discount" : "خصم على الباقة"}
          </h4>
          <PlanToggle
            checked={Boolean(form.saleEnabled)}
            onChange={(v) => set("saleEnabled", v)}
            label={isEn ? "Enable discount" : "تفعيل الخصم"}
            disabled={submitting}
          />
          {form.saleEnabled ? (
            <>
              <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
                <Field label={isEn ? "Discount percentage (%)" : "نسبة الخصم (%)"}>
                  <input
                    className="oh-sapl-input"
                    type="number"
                    min={0.01}
                    max={99.99}
                    step="0.01"
                    value={form.salePercentage}
                    onChange={(e) => set("salePercentage", e.target.value)}
                    placeholder="20"
                    disabled={submitting}
                    required
                  />
                </Field>
              </Grid>
              <Field label={isEn ? "Sale reason (Arabic)" : "سبب الخصم"} style={{ marginTop: 12 }}>
                <input
                  className="oh-sapl-input"
                  value={form.saleReason}
                  onChange={(e) => set("saleReason", e.target.value)}
                  placeholder={isEn ? "Limited-time offer" : "عرض خاص لفترة محدودة"}
                  disabled={submitting}
                  required
                />
              </Field>
              <Field label={isEn ? "Sale reason (English)" : "سبب الخصم (إنجليزي)"} style={{ marginTop: 12 }}>
                <input
                  className="oh-sapl-input"
                  dir="ltr"
                  value={form.saleReasonEn}
                  onChange={(e) => set("saleReasonEn", e.target.value)}
                  placeholder="Limited-time offer"
                  disabled={submitting}
                />
              </Field>
              {(() => {
                const base =
                  form.stripeCheckoutAmountJod !== "" && Number(form.stripeCheckoutAmountJod) > 0
                    ? Number(form.stripeCheckoutAmountJod)
                    : form.priceJod === ""
                      ? null
                      : Number(form.priceJod);
                const pct = Number(form.salePercentage);
                if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(pct) || pct <= 0 || pct >= 100) {
                  return null;
                }
                const final = Math.round(base * (1000 - pct * 10)) / 1000;
                const fmt = (n) =>
                  n.toLocaleString(isEn ? "en-US" : "ar-JO-u-nu-latn", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 3,
                  });
                return (
                  <div className="oh-sapl-sale-preview" style={{ marginTop: 12 }}>
                    <p>
                      {isEn
                        ? `Original price: ${fmt(base)} JOD`
                        : `السعر الأصلي: ${fmt(base)} د.أ`}
                    </p>
                    <p>{isEn ? `Discount: ${pct}%` : `الخصم: ${pct}%`}</p>
                    <p>
                      {isEn
                        ? `Price after discount: ${fmt(final)} JOD`
                        : `السعر بعد الخصم: ${fmt(final)} د.أ`}
                    </p>
                    <p className="oh-sapl-field__hint">
                      {isEn
                        ? "Preview only. Backend calculates the charged amount."
                        : "معاينة فقط. المبلغ المحصّل يُحسب في الخادم."}
                    </p>
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>
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
        <Field
          label={isEn ? "Admin notes (internal)" : "ملاحظات إدارية (داخلية)"}
          hint={isEn ? "Not shown on public plans page." : "لا تظهر في صفحة الباقات العامة."}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.adminNotes}
            onChange={(e) => set("adminNotes", e.target.value)}
            disabled={submitting}
          />
        </Field>
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
        <Field
          label={isEn ? "Includes (English, one per line)" : "يشمل (إنجليزي — سطر لكل ميزة)"}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={5}
            value={form.featuresTextEn}
            onChange={(e) => set("featuresTextEn", e.target.value)}
            placeholder="e.g. Contract signing at company office"
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
        <Field
          label={isEn ? "Included trainings (English, one per line)" : "التدريبات المشمولة (إنجليزي — سطر لكل تدريب)"}
          style={{ marginTop: 12 }}
        >
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            dir="ltr"
            rows={4}
            value={form.trainingsTextEn}
            onChange={(e) => set("trainingsTextEn", e.target.value)}
            placeholder="One line per training"
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
          <Field label={isEn ? "Badge label" : "نص الشارة"}>
            <input
              className="oh-sapl-input"
              value={form.label}
              onChange={(e) => set("label", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Billing text" : "نص الفوترة"}>
            <input
              className="oh-sapl-input"
              value={form.billingText}
              onChange={(e) => set("billingText", e.target.value)}
              placeholder={isEn ? "e.g. Full year" : "مثال: سنة كاملة"}
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={isEn ? "Badge label (English)" : "نص الشارة (إنجليزي)"}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.labelEn}
              onChange={(e) => set("labelEn", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Billing text (English)" : "نص الفوترة (إنجليزي)"}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.billingTextEn}
              onChange={(e) => set("billingTextEn", e.target.value)}
              placeholder="Full year"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label={isEn ? "Button label (Arabic)" : "نص زر الإجراء (عربي)"}>
            <input
              className="oh-sapl-input"
              value={form.buttonText}
              onChange={(e) => set("buttonText", e.target.value)}
              placeholder={isEn ? "e.g. Start now" : "مثال: ابدأ الآن"}
              disabled={submitting}
            />
          </Field>
          <Field label={isEn ? "Button label (English)" : "نص زر الإجراء (إنجليزي)"}>
            <input
              className="oh-sapl-input"
              dir="ltr"
              value={form.buttonTextEn}
              onChange={(e) => set("buttonTextEn", e.target.value)}
              placeholder="Start now"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field
            label={isEn ? "Plans page" : "صفحة الباقات"}
            hint={
              isEn
                ? "Which public plans URL shows this package."
                : "صفحة العرض العامة التي تظهر فيها هذه الباقة."
            }
          >
            <select
              className="oh-sapl-input"
              value={form.planPageId}
              onChange={(e) => set("planPageId", e.target.value)}
              disabled={submitting || planPages.length === 0}
              required={showLinkedCheckout}
            >
              {planPages.length === 0 ? (
                <option value="">{isEn ? "No pages available" : "لا توجد صفحات"}</option>
              ) : (
                <>
                  {!form.planPageId ? (
                    <option value="">{isEn ? "Select a page…" : "اختر صفحة…"}</option>
                  ) : null}
                  {planPages.map((page) => (
                    <option key={page.id} value={String(page.id)}>
                      {formatPlanPageOptionLabel(page, isEn)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>
          {showLinkedCheckout ? (
            <Field
              label={isEn ? "Linked checkout plan" : "باقة الدفع المرتبطة"}
              hint={
                isEn
                  ? "This plan is used for checkout and is not shown to customers as a technical ID."
                  : "تُستخدم هذه الباقة عند الدفع، ولا تظهر للعميل كرقم تقني."
              }
            >
              <select
                className="oh-sapl-input"
                value={form.subscriptionPlanId}
                onChange={(e) => set("subscriptionPlanId", e.target.value)}
                disabled={submitting || checkoutPlanOptions.length === 0}
                required={linkedCheckoutRequired}
              >
                {!linkedCheckoutRequired ? (
                  <option value="">
                    {isEn ? "— Standalone checkout (this plan)" : "— دفع مباشر (هذه الباقة)"}
                  </option>
                ) : (
                  <option value="">
                    {isEn ? "Select linked checkout plan…" : "اختر باقة الدفع…"}
                  </option>
                )}
                {checkoutPlanOptions.map((plan) => (
                  <option key={plan.id} value={String(plan.id)}>
                    {formatCheckoutPlanOptionLabel(plan, isEn)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </Grid>
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
        <Field label={isEn ? "Special offer label (English)" : "نص العرض الخاص (إنجليزي)"} style={{ marginTop: 12 }}>
          <input
            className="oh-sapl-input"
            dir="ltr"
            value={form.offerLabelEn}
            onChange={(e) => set("offerLabelEn", e.target.value)}
            disabled={submitting}
          />
        </Field>
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
