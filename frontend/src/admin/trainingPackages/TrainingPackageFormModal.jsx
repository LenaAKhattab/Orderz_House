import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  canSubmitTrainingPackage,
  getInitialTrainingPackageForm,
  normalizeTrainingPackagePayload,
} from "./trainingPackageFormUtils";

const FIELD_CLASS = "mb-3 flex flex-col gap-[0.35rem] text-[0.88rem]";
const CHECK_CLASS = "mb-3 flex flex-row items-center gap-2 text-[0.88rem]";
const CONTROL_CLASS =
  "box-border min-h-10 w-full rounded-[10px] border border-[var(--dash-border,#d6dde8)] px-3 py-[0.55rem] font-inherit";

export default function TrainingPackageFormModal({
  open,
  mode = "edit",
  initialPackage = null,
  isEn = false,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => getInitialTrainingPackageForm(initialPackage));

  useEffect(() => {
    if (open) setForm(getInitialTrainingPackageForm(initialPackage));
  }, [open, initialPackage]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const canSave = canSubmitTrainingPackage(form) && !submitting;

  const submit = (event) => {
    event.preventDefault();
    if (!canSave) return;
    onSubmit(normalizeTrainingPackagePayload(form));
  };

  const label = (ar, en) => (isEn ? en : ar);

  return (
    <div className="oh-sapl-modal-root" role="presentation">
      <button type="button" className="oh-sapl-modal-backdrop" onClick={submitting ? undefined : onClose} />
      <div
        className="oh-sapl-modal"
        role="dialog"
        aria-modal="true"
        dir={isEn ? "ltr" : "rtl"}
      >
        <header className="oh-sapl-modal__head">
          <h2 className="oh-sapl-modal__title">
            {mode === "create"
              ? label("إضافة باقة تدريب", "Add training package")
              : label("تعديل", "Edit")}
          </h2>
          <button type="button" className="oh-sapl-modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </header>
        <form className="oh-sapl-modal__scroll" onSubmit={submit}>
          <label className={FIELD_CLASS}>
            <span>{label("اسم الباقة", "Package name")}</span>
            <input className={CONTROL_CLASS} value={form.nameAr} onChange={(e) => setField("nameAr", e.target.value)} required />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("الاسم بالإنجليزية", "English name")}</span>
            <input className={CONTROL_CLASS} value={form.nameEn} onChange={(e) => setField("nameEn", e.target.value)} />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("رمز الباقة", "Package code")}</span>
            <input
              className={CONTROL_CLASS}
              value={form.code}
              onChange={(e) => setField("code", e.target.value)}
              disabled={mode === "edit"}
              required
            />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("الوصف", "Description")}</span>
            <textarea className={CONTROL_CLASS} rows={2} value={form.shortDescAr} onChange={(e) => setField("shortDescAr", e.target.value)} />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("الوصف بالإنجليزية", "English description")}</span>
            <textarea className={CONTROL_CLASS} rows={2} value={form.shortDescEn} onChange={(e) => setField("shortDescEn", e.target.value)} />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("السعر بالدينار الأردني", "Price in JOD")}</span>
            <input
              className={CONTROL_CLASS}
              type="number"
              min="0"
              step="1"
              value={form.priceJod}
              onChange={(e) => setField("priceJod", e.target.value)}
              required
            />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("مدة الباقة", "Duration (months)")}</span>
            <input
              className={CONTROL_CLASS}
              type="number"
              min="1"
              max="36"
              value={form.durationMonths}
              onChange={(e) => setField("durationMonths", e.target.value)}
            />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("مميزات الباقة", "Package features")}</span>
            <textarea
              className={CONTROL_CLASS}
              rows={6}
              value={form.featuresAr}
              onChange={(e) => setField("featuresAr", e.target.value)}
              placeholder={label("سطر لكل ميزة", "One feature per line")}
            />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("المميزات بالإنجليزية", "English features")}</span>
            <textarea
              className={CONTROL_CLASS}
              rows={4}
              value={form.featuresEn}
              onChange={(e) => setField("featuresEn", e.target.value)}
            />
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("شارة مميزة", "Badge")}</span>
            <input className={CONTROL_CLASS} value={form.badgeAr} onChange={(e) => setField("badgeAr", e.target.value)} />
          </label>
          <label className={CHECK_CLASS}>
            <input
              type="checkbox"
              className="w-auto"
              checked={form.featured}
              onChange={(e) => setField("featured", e.target.checked)}
            />
            <span>{label("الأكثر طلبًا", "Most requested")}</span>
          </label>
          <label className={CHECK_CLASS}>
            <input
              type="checkbox"
              className="w-auto"
              checked={form.isVisible}
              onChange={(e) => setField("isVisible", e.target.checked)}
            />
            <span>{label("ظاهرة", "Visible")}</span>
          </label>
          <label className={FIELD_CLASS}>
            <span>{label("رسالة واتساب", "WhatsApp message")}</span>
            <textarea
              className={CONTROL_CLASS}
              rows={3}
              value={form.whatsappMessageAr}
              onChange={(e) => setField("whatsappMessageAr", e.target.value)}
            />
          </label>
          <footer className="oh-sapl-modal__footer">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {label("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" disabled={!canSave}>
              {label("حفظ", "Save")}
            </Button>
          </footer>
        </form>
      </div>
    </div>
  );
}
