import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  ARTICLE_LEVELS,
  ARTICLE_STATUSES,
  articleToMarketplaceFormState,
  deriveArticleValueJodFromLevel,
  getInitialMarketplaceArticleFormState,
  normalizeMarketplaceArticlePayload,
  validateMarketplaceArticleForm,
} from "./marketplaceArticleFormUtils";

export default function MarketplaceArticleFormModal({
  open,
  mode = "create",
  initialArticle = null,
  categories = [],
  subcategories = [],
  isEn = false,
  submitting = false,
  onClose,
  onSubmit,
  onCategoryChange,
}) {
  const isCreate = mode === "create";
  const [form, setForm] = useState(getInitialMarketplaceArticleFormState);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setForm(isCreate ? getInitialMarketplaceArticleFormState() : articleToMarketplaceFormState(initialArticle));
    setErrors({});
  }, [open, isCreate, initialArticle]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const nextErrors = validateMarketplaceArticleForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSubmit?.(normalizeMarketplaceArticlePayload(form));
  };

  const valueLabel = deriveArticleValueJodFromLevel(form.articleLevel);

  return (
    <div className="oh-mmp-modal" role="dialog" aria-modal="true">
      <button type="button" className="oh-mmp-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="oh-mmp-modal__panel">
        <div className="oh-mmp-modal__header">
          <h2>{isCreate ? (isEn ? "Add Article" : "إضافة مقال") : isEn ? "Edit Article" : "تعديل مقال"}</h2>
          <button type="button" className="oh-mmp-modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </div>

        <form className="oh-mmp-form" onSubmit={handleSubmit}>
          <label>
            {isEn ? "Title" : "العنوان"} *
            <input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              disabled={submitting}
              maxLength={240}
            />
            {errors.title ? <span className="oh-mmp-form__error">{errors.title}</span> : null}
          </label>

          <label>
            {isEn ? "Brief / description" : "الوصف / الموجز"}
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              disabled={submitting}
            />
          </label>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Article level" : "مستوى المقال"} *
              <select
                value={form.articleLevel}
                onChange={(e) => setField("articleLevel", e.target.value)}
                disabled={submitting}
              >
                {ARTICLE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {isEn ? `Level ${lvl}` : `المستوى ${lvl}`}
                  </option>
                ))}
              </select>
              {errors.articleLevel ? <span className="oh-mmp-form__error">{errors.articleLevel}</span> : null}
            </label>
            <label>
              {isEn ? "Value (JOD, derived)" : "القيمة (د.أ، مشتقة)"}
              <input value={valueLabel ? `${valueLabel} JOD` : ""} readOnly disabled />
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Required word count" : "عدد الكلمات المطلوب"} *
              <input
                type="number"
                min="1"
                step="1"
                value={form.requiredWordCount}
                onChange={(e) => setField("requiredWordCount", e.target.value)}
                disabled={submitting}
              />
              {errors.requiredWordCount ? (
                <span className="oh-mmp-form__error">{errors.requiredWordCount}</span>
              ) : null}
            </label>
            <label>
              {isEn ? "Required references" : "عدد المراجع المطلوب"}
              <input
                type="number"
                min="0"
                step="1"
                value={form.requiredReferencesCount}
                onChange={(e) => setField("requiredReferencesCount", e.target.value)}
                disabled={submitting}
              />
              {errors.requiredReferencesCount ? (
                <span className="oh-mmp-form__error">{errors.requiredReferencesCount}</span>
              ) : null}
            </label>
          </div>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Status" : "الحالة"}
              <select
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                disabled={submitting}
              >
                {ARTICLE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {isEn ? "Category" : "التصنيف"}
              <select
                value={form.categoryId}
                onChange={(e) => {
                  const next = e.target.value;
                  setField("categoryId", next);
                  setField("subcategoryId", "");
                  onCategoryChange?.(next);
                }}
                disabled={submitting}
              >
                <option value="">{isEn ? "— Optional —" : "— اختياري —"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            {isEn ? "Subcategory" : "التصنيف الفرعي"}
            <select
              value={form.subcategoryId}
              onChange={(e) => setField("subcategoryId", e.target.value)}
              disabled={submitting || !form.categoryId}
            >
              <option value="">{isEn ? "— Optional —" : "— اختياري —"}</option>
              {subcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="oh-mmp-form__check oh-mmp-form__check--block">
            <input
              type="checkbox"
              checked={form.isFakeOrTraining}
              onChange={(e) => setField("isFakeOrTraining", e.target.checked)}
              disabled={submitting}
            />
            {isEn ? "Fake / training Article" : "مقال تدريب / وهمي"}
          </label>

          <div className="oh-mmp-form__actions">
            <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              {isEn ? "Cancel" : "إلغاء"}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (isEn ? "Saving…" : "جارٍ الحفظ…") : isEn ? "Save" : "حفظ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
