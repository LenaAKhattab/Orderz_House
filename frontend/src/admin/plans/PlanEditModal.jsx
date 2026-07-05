import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import { useTranslation } from "../../i18n/LanguageProvider";
import { planToEditForm } from "./planFormConstants";
import { canSubmitEdit, normalizeEditPayload } from "./planPayloadUtils";
import { buildPlanPagesIndex } from "./planAdminSections";
import PlanFormModalBody from "./PlanFormModalBody";

function PlanEditForm({ plan, submitting, onClose, onSave, planPages, canonicalPlans }) {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const [form, setForm] = useState(() => planToEditForm(plan));

  return (
    <>
      <header className="oh-sapl-modal__head">
        <div>
          <h2 id="oh-sapl-edit-title" className="oh-sapl-modal__title">
            {isEn ? "Edit plan" : "تعديل الباقة"}
          </h2>
          <p className="oh-sapl-modal__subtitle">
            {isEn ? "Edit plan sections using the tabs below." : "عدّل أقسام الباقة من التبويبات أدناه."}
          </p>
        </div>
        <button type="button" className="oh-sapl-modal__close" onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      </header>

      <div className="oh-sapl-modal__scroll">
        <PlanFormModalBody
          form={form}
          setForm={setForm}
          submitting={submitting}
          mode="edit"
          planPages={planPages}
          canonicalPlans={canonicalPlans}
          excludePlanId={plan?.id}
        />
      </div>

      <footer className="oh-sapl-modal__foot">
        <Button type="button" variant="secondary" disabled={submitting} onClick={onClose}>
          {isEn ? "Cancel" : "إلغاء"}
        </Button>
        <Button
          type="button"
          disabled={submitting || !canSubmitEdit(form, { planPagesById: buildPlanPagesIndex(planPages) })}
          onClick={() => void onSave(normalizeEditPayload(form))}
        >
          {submitting ? (isEn ? "Saving…" : "جارٍ الحفظ…") : isEn ? "Save changes" : "حفظ التعديلات"}
        </Button>
      </footer>
    </>
  );
}

/**
 * @param {{
 *   plan: Record<string, unknown> | null;
 *   open: boolean;
 *   submitting: boolean;
 *   onClose: () => void;
 *   onSave: (payload: Record<string, unknown>) => Promise<void> | void;
 *   planPages?: object[];
 *   canonicalPlans?: object[];
 * }} p
 */
export default function PlanEditModal({ plan, open, submitting, onClose, onSave, planPages = [], canonicalPlans = [] }) {
  useEffect(() => {
    if (!open) return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, submitting, onClose]);

  if (!open || !plan) return null;

  return (
    <div className="oh-sapl-modal-root" role="presentation">
      <button type="button" className="oh-sapl-modal-backdrop" onClick={onClose} aria-label="إغلاق النافذة" />
      <div
        className="oh-sapl-modal oh-sapl-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="oh-sapl-edit-title"
        dir="rtl"
      >
        <PlanEditForm
          key={String(plan.id ?? plan.name)}
          plan={plan}
          submitting={submitting}
          onClose={onClose}
          onSave={onSave}
          planPages={planPages}
          canonicalPlans={canonicalPlans}
        />
      </div>
    </div>
  );
}
