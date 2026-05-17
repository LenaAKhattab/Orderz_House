import PlanFormSection from "./PlanFormSection";
import PlanToggle from "./PlanToggle";

function Field({ label, children }) {
  return (
    <div className="oh-sapl-field">
      <span className="oh-sapl-field__label">{label}</span>
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

/**
 * Shared extended plan fields for create + edit forms.
 */
export default function PlanExtendedFields({ form, setForm, submitting = false, showAdminNotes = true }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <>
      <PlanFormSection title="السعر والمدة والترتيب">
        <Grid className="oh-sapl-grid--3">
          <Field label="المدة (أيام)">
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
          <Field label="السعر الإجمالي (د.أ)">
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.priceJod}
              onChange={(e) => set("priceJod", e.target.value)}
              placeholder="0 = مجاني"
              disabled={submitting}
            />
          </Field>
          <Field label="مبلغ Stripe عند الشراء (د.أ)">
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.stripeCheckoutAmountJod}
              onChange={(e) => set("stripeCheckoutAmountJod", e.target.value)}
              placeholder="فارغ = نفس السعر الإجمالي"
              disabled={submitting}
            />
          </Field>
          <Field label="ترتيب العرض">
            <input
              className="oh-sapl-input"
              type="number"
              value={form.sortOrder}
              onChange={(e) => set("sortOrder", e.target.value)}
              disabled={submitting}
            />
          </Field>
        </Grid>
      </PlanFormSection>

      <PlanFormSection title="المميزات والتدريبات" hint="سطر واحد لكل عنصر.">
        <div className="oh-sapl-field">
          <span className="oh-sapl-field__label">يشمل (قائمة المميزات)</span>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={5}
            value={form.featuresText}
            onChange={(e) => set("featuresText", e.target.value)}
            placeholder="مثال: توقيع العقد داخل مقر الشركة"
            disabled={submitting}
          />
        </div>
        <div className="oh-sapl-field" style={{ marginTop: 12 }}>
          <span className="oh-sapl-field__label">التدريبات المشمولة</span>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={4}
            value={form.trainingsText}
            onChange={(e) => set("trainingsText", e.target.value)}
            placeholder="سطر لكل تدريب"
            disabled={submitting}
          />
        </div>
      </PlanFormSection>

      <PlanFormSection title="الدفع والعروض">
        <div className="oh-sapl-field">
          <span className="oh-sapl-field__label">ملاحظات الدفع</span>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.paymentNotes}
            onChange={(e) => set("paymentNotes", e.target.value)}
            disabled={submitting}
          />
        </div>
        <Grid className="oh-sapl-grid--3" style={{ marginTop: 12 }}>
          <Field label="قسط أول (د.أ)">
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
          <Field label="قسط شهري (د.أ)">
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
          <Field label="عدد الأشهر">
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
        <div className="oh-sapl-field" style={{ marginTop: 12 }}>
          <span className="oh-sapl-field__label">ملاحظات الأقساط</span>
          <input
            className="oh-sapl-input"
            value={form.installmentNotes}
            onChange={(e) => set("installmentNotes", e.target.value)}
            disabled={submitting}
          />
        </div>
        <Grid className="oh-sapl-grid--2" style={{ marginTop: 12 }}>
          <Field label="نص العرض الخاص">
            <input
              className="oh-sapl-input"
              value={form.offerLabel}
              onChange={(e) => set("offerLabel", e.target.value)}
              disabled={submitting}
            />
          </Field>
          <Field label="انتهاء العرض">
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

      <PlanFormSection title="قيمة الطلبات والتفعيل">
        <Grid className="oh-sapl-grid--2">
          <Field label="حد أدنى لقيمة الطلب (د.أ)">
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
          <Field label="حد أقصى لقيمة الطلب (د.أ)">
            <input
              className="oh-sapl-input"
              type="number"
              min={0}
              step="0.01"
              value={form.orderValueMaxJod}
              onChange={(e) => set("orderValueMaxJod", e.target.value)}
              placeholder="فارغ = بدون حد أعلى"
              disabled={submitting}
            />
          </Field>
        </Grid>
        <div className="oh-sapl-field" style={{ marginTop: 12 }}>
          <span className="oh-sapl-field__label">آلية التفعيل</span>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={3}
            value={form.activationRequirements}
            onChange={(e) => set("activationRequirements", e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="oh-sapl-field" style={{ marginTop: 12 }}>
          <span className="oh-sapl-field__label">سياسة الاسترداد</span>
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.refundPolicy}
            onChange={(e) => set("refundPolicy", e.target.value)}
            disabled={submitting}
          />
        </div>
      </PlanFormSection>

      <PlanFormSection title="خيارات الباقة" hint="بدّل الحالات بسرعة — نفس الحقول المرسلة للـ API.">
        <div className="oh-sapl-options">
          <PlanToggle
            label="يتطلب زيارة ميدانية للشركة"
            checked={form.requiresCompanyVisit}
            disabled={submitting}
            onChange={(v) => set("requiresCompanyVisit", v)}
          />
          <PlanToggle
            label="الباقة مفعّلة"
            description="عند التعطيل لن تُستخدم في إسناد جديد."
            checked={form.isActive}
            disabled={submitting}
            onChange={(v) => set("isActive", v)}
          />
          <PlanToggle
            label="ظهور في قائمة الباقات العامة"
            description="إخفاء الباقة عن صفحة الباقات دون حذفها."
            checked={form.isVisible}
            disabled={submitting}
            onChange={(v) => set("isVisible", v)}
          />
          <PlanToggle
            label="متاحة للشراء الذاتي (Stripe)"
            description="يتطلب مبلغ دفع (السعر أو مبلغ Stripe) أكبر من صفر."
            checked={form.selfSubscribeAllowed}
            disabled={submitting}
            onChange={(v) => set("selfSubscribeAllowed", v)}
          />
          <PlanToggle
            label="الأكثر شيوعاً (شارة)"
            checked={form.isPopular}
            disabled={submitting}
            onChange={(v) => set("isPopular", v)}
          />
          <PlanToggle
            label="باقة مميزة (تمييز بصري)"
            checked={form.isFeatured}
            disabled={submitting}
            onChange={(v) => set("isFeatured", v)}
          />
        </div>
      </PlanFormSection>

      {showAdminNotes ? (
        <PlanFormSection title="ملاحظات داخلية" hint="لا تظهر في صفحة الباقات العامة.">
          <textarea
            className="oh-sapl-input oh-sapl-input--textarea"
            rows={2}
            value={form.adminNotes}
            onChange={(e) => set("adminNotes", e.target.value)}
            disabled={submitting}
          />
        </PlanFormSection>
      ) : null}
    </>
  );
}


