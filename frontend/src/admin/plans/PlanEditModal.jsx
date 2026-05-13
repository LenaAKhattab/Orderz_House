import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import { planToEditForm } from "./planFormConstants";
import { canSubmitEdit, normalizeEditPayload } from "./planPayloadUtils";
import PlanFormSection from "./PlanFormSection";
import PlanToggle from "./PlanToggle";

/**
 * @param {{
 *   plan: Record<string, unknown> | null;
 *   open: boolean;
 *   submitting: boolean;
 *   onClose: () => void;
 *   onSave: (payload: Record<string, unknown>) => Promise<void> | void;
 * }} p
 */
export default function PlanEditModal({ plan, open, submitting, onClose, onSave }) {
  const [form, setForm] = useState(() => planToEditForm(plan || {}));

  useEffect(() => {
    if (open && plan) setForm(planToEditForm(plan));
  }, [open, plan]);

  if (!open || !plan) return null;

  return (
    <div className="oh-sapl-modal-root" role="presentation">
      <button type="button" className="oh-sapl-modal-backdrop" onClick={onClose} aria-label="إغلاق النافذة" />
      <div
        className="oh-sapl-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oh-sapl-edit-title"
        dir="rtl"
      >
        <header className="oh-sapl-modal__head">
          <div>
            <h2 id="oh-sapl-edit-title" className="oh-sapl-modal__title">
              تعديل الباقة
            </h2>
            <p className="oh-sapl-modal__subtitle">
              <code className="oh-sapl-card__code">{plan.name}</code>
              <span className="oh-sapl-modal__hint"> — المعرف الداخلي لا يُعدّل بعد الإنشاء</span>
            </p>
          </div>
          <button type="button" className="oh-sapl-modal__close" onClick={onClose} aria-label="إغلاق">
            ×
          </button>
        </header>

        <div className="oh-sapl-modal__scroll">
          <PlanFormSection title="المعلومات الأساسية" hint="العنوان والوصف كما يظهران للمستخدمين.">
            <div className="oh-sapl-field">
              <span className="oh-sapl-field__label">العنوان</span>
              <input
                className="oh-sapl-input"
                value={form.title}
                onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                disabled={submitting}
                placeholder="مثال: باقة احترافية"
              />
            </div>
            <div className="oh-sapl-field">
              <span className="oh-sapl-field__label">وصف مختصر</span>
              <textarea
                className="oh-sapl-input oh-sapl-input--textarea"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((v) => ({ ...v, description: e.target.value }))}
                disabled={submitting}
                placeholder="اختياري — يظهر في أماكن عرض الباقة عند الحاجة"
              />
            </div>
          </PlanFormSection>

          <PlanFormSection title="السعر والمدة والترتيب">
            <div className="oh-sapl-grid oh-sapl-grid--3">
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">المدة (أيام)</span>
                <input
                  className="oh-sapl-input"
                  type="number"
                  min={1}
                  max={3650}
                  value={form.durationDays}
                  onChange={(e) => setForm((v) => ({ ...v, durationDays: e.target.value }))}
                  disabled={submitting}
                />
              </div>
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">السعر (د.أ)</span>
                <input
                  className="oh-sapl-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceJod}
                  onChange={(e) => setForm((v) => ({ ...v, priceJod: e.target.value }))}
                  disabled={submitting}
                  placeholder="اختياري"
                />
              </div>
              <div className="oh-sapl-field">
                <span className="oh-sapl-field__label">ترتيب العرض</span>
                <input
                  className="oh-sapl-input"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((v) => ({ ...v, sortOrder: e.target.value }))}
                  disabled={submitting}
                />
              </div>
            </div>
          </PlanFormSection>

          <PlanFormSection title="خيارات الباقة" hint="تحكم بالظهور والشراء الذاتي وزيارة المقر.">
            <div className="oh-sapl-options">
              <PlanToggle
                label="الباقة مفعّلة"
                description="عند التعطيل لن تُستخدم في إسناد جديد."
                checked={form.isActive}
                disabled={submitting}
                onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <PlanToggle
                label="ظهور في قائمة الباقات العامة"
                description="إخفاء الباقة عن صفحة الباقات دون حذفها."
                checked={form.isVisible}
                disabled={submitting}
                onChange={(v) => setForm((f) => ({ ...f, isVisible: v }))}
              />
              <PlanToggle
                label="يتطلب زيارة ميدانية للشركة"
                checked={form.requiresCompanyVisit}
                disabled={submitting}
                onChange={(v) => setForm((f) => ({ ...f, requiresCompanyVisit: v }))}
              />
              <PlanToggle
                label="متاحة للشراء الذاتي (Stripe)"
                description="يتطلب سعراً أكبر من صفر وإعدادات الدفع."
                checked={form.selfSubscribeAllowed}
                disabled={submitting}
                onChange={(v) => setForm((f) => ({ ...f, selfSubscribeAllowed: v }))}
              />
            </div>
          </PlanFormSection>
        </div>

        <footer className="oh-sapl-modal__foot">
          <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={submitting || !canSubmitEdit(form)}
            onClick={() => void onSave(normalizeEditPayload(form))}
          >
            حفظ التعديلات
          </Button>
        </footer>
      </div>
    </div>
  );
}
