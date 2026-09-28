import SafeAdImage from "../../components/ads/SafeAdImage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `i-${Date.now()}-${Math.random()}`;
}

const MAX_IMAGES = 1;

/** @param {object} p */
export default function AdImageManager({ images, onChange, urlErrors = {}, showErrors = false }) {
  const { t } = useTranslation();
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
      <p className="oh-admin-ads__helperText">{t("ads.images.managerHint")}</p>
      {list.map((img, idx) => (
        <div key={img.id || idx} className="oh-admin-ads__card oh-admin-ads__image-card">
          <div className="oh-admin-ads__image-card-head">
            <span className="oh-admin-ads__image-index">{t("ads.images.adImage")}</span>
            <div className="oh-admin-ads__image-card-actions">
              <button type="button" className="btn btn-secondary oh-admin-ads__mini-btn" onClick={() => remove(idx)}>
                {t("ads.common.delete")}
              </button>
            </div>
          </div>

          <div className="oh-admin-ads__image-preview-row">
            <div className="oh-admin-ads__image-thumb-wrap">
              {img.url?.trim() ? (
                <SafeAdImage src={img.url.trim()} alt={img.alt || ""} className="oh-admin-ads__image-thumb" imgClassName="oh-admin-ads__image-thumb-img" />
              ) : (
                <div className="oh-admin-ads__image-placeholder" role="presentation">
                  {t("ads.images.addUrlForPreview")}
                </div>
              )}
            </div>
          </div>

          <div className="oh-admin-ads__form-grid">
            <div className="oh-admin-ads__field" style={{ gridColumn: "1 / -1" }}>
              <label>{t("ads.images.imageUrl")}</label>
              <input
                dir="ltr"
                value={img.url || ""}
                onChange={(e) => update(idx, { url: e.target.value })}
                placeholder="https://..."
                className={showErrors && urlErrors[idx] ? "oh-admin-ads__input--error" : undefined}
              />
              {showErrors && urlErrors[idx] ? <span className="oh-admin-ads__field-error">{urlErrors[idx]}</span> : null}
              <span className="oh-admin-ads__field-hint">{t("ads.images.urlHint")}</span>
            </div>
            <div className="oh-admin-ads__field">
              <label>{t("ads.images.altText")}</label>
              <input value={img.alt || ""} onChange={(e) => update(idx, { alt: e.target.value })} />
              <span className="oh-admin-ads__field-hint">{t("ads.images.altHint")}</span>
            </div>
          </div>
        </div>
      ))}
      {list.length < MAX_IMAGES ? (
        <button type="button" className="btn btn-secondary" onClick={add}>
          {t("ads.images.addImage")}
        </button>
      ) : null}
    </div>
  );
}
