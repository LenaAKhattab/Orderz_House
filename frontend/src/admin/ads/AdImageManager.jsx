import SafeAdImage from "../../components/ads/SafeAdImage";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `i-${Date.now()}-${Math.random()}`;
}

/**
 * @param {object} p
 * @param {unknown[]} p.images
 * @param {(next: unknown[]) => void} p.onChange
 * @param {Record<number, string>} [p.urlErrors] — inline errors per row index after save attempt
 * @param {boolean} [p.showErrors]
 */
const MAX_IMAGES = 1;

export default function AdImageManager({ images, onChange, urlErrors = {}, showErrors = false }) {
  const list = Array.isArray(images) ? images.slice(0, MAX_IMAGES) : [];

  const update = (idx, patch) => {
    const next = list.map((row, i) => (i === idx ? { ...row, ...patch } : row));
    onChange(next);
  };

  const remove = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  const add = () => {
    if (list.length >= MAX_IMAGES) return;
    onChange([...list, { id: uid(), url: "", alt: "", position: "top", objectFit: "cover" }]);
  };

  return (
    <div className="oh-admin-ads__image-stack">
      <p className="oh-admin-ads__helperText">
        أضف رابط صورة واحدة للإعلان. تُخزَّن كرابط فقط (لا رفع ملفات من هنا).
      </p>
      {list.map((img, idx) => (
        <div key={img.id || idx} className="oh-admin-ads__card oh-admin-ads__image-card">
          <div className="oh-admin-ads__image-card-head">
            <span className="oh-admin-ads__image-index">صورة الإعلان</span>
            <div className="oh-admin-ads__image-card-actions">
              <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => remove(idx)}>
                حذف
              </button>
            </div>
          </div>

          <div className="oh-admin-ads__image-preview-row">
            <div className="oh-admin-ads__image-thumb-wrap">
              {img.url?.trim() ? (
                <SafeAdImage src={img.url.trim()} alt={img.alt || ""} className="oh-admin-ads__image-thumb" imgClassName="oh-admin-ads__image-thumb-img" />
              ) : (
                <div className="oh-admin-ads__image-placeholder" role="presentation">
                  أضف رابطًا لمعاينة الصورة
                </div>
              )}
            </div>
          </div>

          <div className="oh-admin-ads__form-grid">
            <div className="oh-admin-ads__field" style={{ gridColumn: "1 / -1" }}>
              <label>رابط الصورة</label>
              <input
                dir="ltr"
                value={img.url || ""}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="https://..."
                className={showErrors && urlErrors[idx] ? "oh-admin-ads__input--error" : undefined}
              />
              {showErrors && urlErrors[idx] ? <span className="oh-admin-ads__field-error">{urlErrors[idx]}</span> : null}
              <span className="oh-admin-ads__field-hint">يجب أن يبدأ الرابط بـ https:// أو مسارًا يبدأ بـ /</span>
            </div>
            <div className="oh-admin-ads__field">
              <label>النص البديل</label>
              <input value={img.alt || ""} onChange={(e) => update(idx, { alt: e.target.value })} />
              <span className="oh-admin-ads__field-hint">يُستخدم لإتاحة الوصول وللمعاينة عند تعذّر تحميل الصورة</span>
            </div>
          </div>
        </div>
      ))}
      {list.length < MAX_IMAGES ? (
        <button type="button" className="btn btn-secondary" onClick={add}>
          + إضافة صورة
        </button>
      ) : null}
    </div>
  );
}
