import AdImageManager from "./AdImageManager";

/**
 * Simplified ad editor — content, image, CTA, and active flag only (placement uses save defaults).
 * Colors, layout, theme, and scheduling are applied with safe defaults when saving (see adFormUtils).
 *
 * @param {object} props
 * @param {object} props.data
 * @param {(next: object) => void} props.onChange
 * @param {Record<string, string>} [props.fieldErrors]
 * @param {Record<number, string>} [props.imageUrlErrors]
 * @param {boolean} [props.attemptedSave]
 */
export default function AdForm({
  data,
  onChange,
  fieldErrors = {},
  imageUrlErrors = {},
  attemptedSave = false,
}) {
  const patch = (p) => onChange({ ...data, ...p });
  const err = (key) => (attemptedSave && fieldErrors[key] ? fieldErrors[key] : null);
  const showVal = attemptedSave;

  return (
    <div dir="rtl" className="oh-admin-ads__simple-form oh-admin-ads__builder p-4 sm:p-6">
      <div className="oh-admin-ads__card oh-admin-ads__simple-card">
        <h3 className="oh-admin-ads__simple-card-title">محتوى الإعلان</h3>

        <div className="oh-admin-ads__simple-fields">
          <div className="oh-admin-ads__field">
            <label htmlFor="ad-title">العنوان *</label>
            <input
              id="ad-title"
              value={data.title}
              onChange={(e) => patch({ title: e.target.value })}
              className={showVal && err("title") ? "oh-admin-ads__input--error" : undefined}
            />
            {showVal && err("title") ? <span className="oh-admin-ads__field-error">{err("title")}</span> : null}
          </div>

          <div className="oh-admin-ads__field">
            <label htmlFor="ad-subtitle">العنوان الفرعي</label>
            <input id="ad-subtitle" value={data.subtitle || ""} onChange={(e) => patch({ subtitle: e.target.value })} />
            <p className="oh-admin-ads__field-hint oh-admin-ads__field-hint--tight">
              سطر قصير تحت العنوان الرئيسي (مثل شعار العرض أو الوعد الرئيسي) — ليس نفس حقل الوصف.
            </p>
          </div>

          <div className="oh-admin-ads__field">
            <label htmlFor="ad-desc">الوصف</label>
            <textarea id="ad-desc" value={data.description || ""} onChange={(e) => patch({ description: e.target.value })} rows={4} />
            <p className="oh-admin-ads__field-hint oh-admin-ads__field-hint--tight">
              تفاصيل أو فقرة أوضح للزائر؛ يظهر أسفل العنوان الفرعي عند وجودهما معًا.
            </p>
          </div>

          <div className="oh-admin-ads__field">
            <span className="oh-admin-ads__field-label-spaced">صورة الإعلان</span>
            <AdImageManager
              images={data.images}
              onChange={(images) => patch({ images })}
              urlErrors={imageUrlErrors}
              showErrors={showVal}
            />
          </div>

          <div className="oh-admin-ads__form-grid oh-admin-ads__form-grid--cta">
            <div className="oh-admin-ads__field">
              <label htmlFor="ad-cta-text">نص الزر</label>
              <input id="ad-cta-text" value={data.ctaText || ""} onChange={(e) => patch({ ctaText: e.target.value })} />
            </div>
            <div className="oh-admin-ads__field">
              <label htmlFor="ad-cta-url">رابط الزر</label>
              <input
                id="ad-cta-url"
                dir="ltr"
                value={data.ctaUrl || ""}
                onChange={(e) => patch({ ctaUrl: e.target.value })}
                className={showVal && err("ctaUrl") ? "oh-admin-ads__input--error" : undefined}
                placeholder="https://… أو /مسار"
              />
              {showVal && err("ctaUrl") ? <span className="oh-admin-ads__field-error">{err("ctaUrl")}</span> : null}
            </div>
          </div>

          <label className="oh-admin-ads__check-row oh-admin-ads__check-row--simple">
            <input type="checkbox" checked={Boolean(data.isActive)} onChange={(e) => patch({ isActive: e.target.checked })} />
            إعلان نشط — يظهر للزوار عند توافق باقي الشروط (مثل نافذة العرض إن وُجدت)
          </label>
        </div>
      </div>
    </div>
  );
}
