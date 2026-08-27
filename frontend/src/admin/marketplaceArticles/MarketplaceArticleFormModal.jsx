import { useEffect, useMemo, useState } from "react";
import Button from "../../components/ui/Button";
import {
  ARTICLE_LEVELS,
  ARTICLE_STATUSES,
  ARTICLE_WRITING_MODES,
  ARTICLE_WRITING_MODE_LABELS_AR,
  articleToMarketplaceFormState,
  deriveArticleValueJodFromLevel,
  getInitialMarketplaceArticleFormState,
  normalizeMarketplaceArticlePayload,
  validateMarketplaceArticleForm,
  ARTICLE_ALLOWED_REQUIRED_BID_COUNTS,
  ARTICLE_MIN_REQUIRED_BIDS_ACK_AR,
  ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR,
  BILDAZO_CATEGORIES_LOAD_ERROR_AR,
  attachableActivationCampaigns,
  attachableActivationWaves,
} from "./marketplaceArticleFormUtils";

function BildazoCategorySearchSelect({
  categories = [],
  value,
  disabled,
  isEn,
  loading,
  error,
  onSelect,
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => (categories || []).find((c) => String(c.id) === String(value)) || null,
    [categories, value],
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.path || selected.nameAr || selected.nameEn || selected.slug || "");
    } else if (!value) {
      setQuery("");
    }
  }, [selected, value]);

  const filtered = useMemo(() => {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    const list = Array.isArray(categories) ? categories : [];
    if (!q) return list.slice(0, 80);
    return list
      .filter((c) => {
        const hay = [c.nameAr, c.nameEn, c.slug, c.path, c.id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [categories, query]);

  return (
    <div className="oh-mmp-bildazo-cat" data-testid="bildazo-category-select">
      <input
        type="search"
        value={query}
        placeholder={isEn ? "Search Bildazo category…" : "ابحث عن صنف بلدازو…"}
        disabled={disabled || loading}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Allow click on option before closing
          window.setTimeout(() => setOpen(false), 150);
        }}
        autoComplete="off"
      />
      {loading ? (
        <span className="oh-mmp-form__hint">{isEn ? "Loading categories…" : "جارٍ تحميل الأصناف…"}</span>
      ) : null}
      {error ? <span className="oh-mmp-form__error">{error || BILDAZO_CATEGORIES_LOAD_ERROR_AR}</span> : null}
      {selected ? (
        <p className="oh-mmp-form__hint" style={{ margin: 0 }} data-testid="bildazo-category-selected">
          {selected.nameAr || selected.nameEn || selected.slug}
          {selected.path ? ` · ${selected.path}` : ""}
        </p>
      ) : null}
      {open && !loading && !disabled ? (
        <ul className="oh-mmp-bildazo-cat__list" role="listbox">
          {filtered.length === 0 ? (
            <li className="oh-mmp-bildazo-cat__empty">{isEn ? "No matches" : "لا نتائج"}</li>
          ) : (
            filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="oh-mmp-bildazo-cat__option"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect?.(c);
                    setQuery(c.path || c.nameAr || c.nameEn || c.slug || "");
                    setOpen(false);
                  }}
                >
                  <strong>{c.nameAr || c.nameEn || c.slug}</strong>
                  {c.path ? <span>{c.path}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export default function MarketplaceArticleFormModal({
  open,
  mode = "create",
  variant = "modal",
  initialArticle = null,
  categories = [],
  subcategories = [],
  bildazoCategories = [],
  categoriesLoading = false,
  categoriesError = "",
  activationCampaigns = [],
  isEn = false,
  submitting = false,
  titleOverride = null,
  submitLabel = null,
  hideCancel = false,
  onClose,
  onSubmit,
  onCategoryChange,
}) {
  const isCreate = mode === "create";
  const isInline = variant === "inline";
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
  const heading =
    titleOverride ||
    (isCreate ? (isEn ? "Add Article" : "إضافة مقال") : isEn ? "Edit Article" : "تعديل مقال");
  const saveLabel = submitting
    ? isEn
      ? "Saving…"
      : "جارٍ الحفظ…"
    : submitLabel || (isEn ? "Save" : "حفظ");

  const formBody = (
        <form className="oh-mmp-form" onSubmit={handleSubmit} data-testid="marketplace-article-form">
          <label>
            {isEn ? "Title" : "العنوان"} *
            <input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              disabled={submitting}
              maxLength={240}
              data-testid="article-form-title"
            />
            {errors.title ? <span className="oh-mmp-form__error">{errors.title}</span> : null}
          </label>

          <label>
            {isEn ? "Description / instructions" : "الوصف / التعليمات"}
            <textarea
              rows={4}
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              disabled={submitting}
              data-testid="article-form-description"
            />
          </label>

          <label>
            {isEn ? "Bildazo category" : "صنف بلدازو"} *
            <BildazoCategorySearchSelect
              categories={bildazoCategories}
              value={form.bildazoCategoryId}
              disabled={submitting}
              isEn={isEn}
              loading={categoriesLoading}
              error={categoriesError}
              onSelect={(c) => {
                setForm((prev) => ({
                  ...prev,
                  bildazoCategoryId: c?.id || "",
                  bildazoCategoryName: c?.nameAr || c?.nameEn || "",
                  bildazoCategorySlug: c?.slug || "",
                  bildazoCategoryPath: c?.path || "",
                }));
              }}
            />
            {errors.bildazoCategoryId ? (
              <span className="oh-mmp-form__error">{errors.bildazoCategoryId}</span>
            ) : null}
          </label>

          <label>
            {isEn ? "Writing mode" : "نمط الكتابة"} *
            <select
              value={form.writingMode || ""}
              onChange={(e) => setField("writingMode", e.target.value)}
              disabled={submitting}
              data-testid="article-form-writing-mode"
            >
              <option value="">{isEn ? "— Select —" : "— اختر —"}</option>
              {ARTICLE_WRITING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {isEn ? mode : ARTICLE_WRITING_MODE_LABELS_AR[mode]}
                </option>
              ))}
            </select>
            {errors.writingMode ? <span className="oh-mmp-form__error">{errors.writingMode}</span> : null}
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

          <label>
            {isEn ? "Minimum required applicants" : "الحد الأدنى للمتقدمين / المناقصات"} *
            <select
              value={form.requiredBidCount}
              onChange={(e) => setField("requiredBidCount", Number(e.target.value))}
              disabled={submitting}
            >
              {ARTICLE_ALLOWED_REQUIRED_BID_COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            {errors.requiredBidCount ? (
              <span className="oh-mmp-form__error">{errors.requiredBidCount}</span>
            ) : null}
          </label>

          <label>
            {isEn ? "Application deadline (optional)" : "موعد إغلاق التقديم (اختياري)"}
            <input
              type="datetime-local"
              value={form.applicationDeadlineAt || ""}
              onChange={(e) => setField("applicationDeadlineAt", e.target.value)}
              disabled={submitting}
            />
          </label>

          <div className="oh-mmp-form__row">
            <label>
              {isEn ? "Activation campaign (optional)" : "حملة التفعيل (اختياري)"}
              <select
                data-testid="activation-campaign-select"
                value={form.activationCampaignId || ""}
                onChange={(e) => {
                  setField("activationCampaignId", e.target.value);
                  setField("activationWaveId", "");
                }}
                disabled={submitting}
              >
                <option value="">{isEn ? "— Not attached —" : "— غير مرتبط —"}</option>
                {attachableActivationCampaigns(activationCampaigns, form.activationCampaignId).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.status})
                  </option>
                ))}
              </select>
            </label>
            <label>
              {isEn ? "Activation wave (optional)" : "موجة التفعيل (اختياري)"}
              <select
                data-testid="activation-wave-select"
                value={form.activationWaveId || ""}
                onChange={(e) => setField("activationWaveId", e.target.value)}
                disabled={submitting || !form.activationCampaignId}
              >
                <option value="">{isEn ? "— Optional —" : "— اختياري —"}</option>
                {attachableActivationWaves(
                  activationCampaigns,
                  form.activationCampaignId,
                  form.activationWaveId,
                ).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.status})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="oh-mmp-form__hint" style={{ margin: 0, lineHeight: 1.5 }}>
            {ARTICLE_MIN_REQUIRED_BIDS_WARNING_AR}
          </p>
          <label className="oh-mmp-form__check oh-mmp-form__check--block">
            <input
              type="checkbox"
              checked={Boolean(form.minRequiredBidsAcknowledged)}
              onChange={(e) => setField("minRequiredBidsAcknowledged", e.target.checked)}
              disabled={submitting}
            />
            {ARTICLE_MIN_REQUIRED_BIDS_ACK_AR}
          </label>
          {errors.minRequiredBidsAcknowledged ? (
            <span className="oh-mmp-form__error">{errors.minRequiredBidsAcknowledged}</span>
          ) : null}

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
            {hideCancel ? null : (
              <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
                {isEn ? "Cancel" : "إلغاء"}
              </Button>
            )}
            <Button type="submit" disabled={submitting} data-testid="article-form-submit">
              {submitting ? (isEn ? "Saving…" : "جارٍ الحفظ…") : saveLabel}
            </Button>
          </div>
        </form>
  );

  if (isInline) {
    return (
      <div className="oh-mmp-inline-form" data-testid="marketplace-article-form-inline">
        <h3 className="oh-mmp-inline-form__title">{heading}</h3>
        {formBody}
      </div>
    );
  }

  return (
    <div className="oh-mmp-modal" role="dialog" aria-modal="true">
      <button type="button" className="oh-mmp-modal__backdrop" aria-label="Close" onClick={onClose} />
      <div className="oh-mmp-modal__panel">
        <div className="oh-mmp-modal__header">
          <h2>{heading}</h2>
          <button type="button" className="oh-mmp-modal__close" onClick={onClose} disabled={submitting}>
            ×
          </button>
        </div>
        {formBody}
      </div>
    </div>
  );
}
