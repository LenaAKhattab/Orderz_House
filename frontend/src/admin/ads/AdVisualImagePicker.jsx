import { useRef, useState } from "react";
import { AD_VISUAL_ASSETS } from "../../components/ads/adVisualAssets";
import { adminUploadAdImageRequest } from "../../services/adsService";
import AdUrlThumb from "./AdUrlThumb";

/**
 * @param {{
 *   data: object;
 *   onChange: (next: object) => void;
 *   fieldErrors?: Record<string, string>;
 *   attemptedSave?: boolean;
 * }} p
 */
export default function AdVisualImagePicker({
  data,
  onChange,
  fieldErrors = {},
  attemptedSave = false,
  bare = false,
}) {
  const patch = (p) => onChange({ ...data, ...p });
  const err = (key) => (attemptedSave && fieldErrors[key] ? fieldErrors[key] : null);
  const bgInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const bgUrl = data.backgroundImageUrl?.trim() || "";

  const pickAsset = (key) => {
    patch({ selectedAssetKey: key });
  };

  const setBackgroundUrl = (url) => {
    patch({ backgroundImageUrl: url.trim() });
  };

  const clearBackground = () => {
    patch({ backgroundImageUrl: "" });
    setUploadError("");
  };

  const uploadBackground = async (file) => {
    if (!file) return;
    setUploadError("");
    setUploading(true);
    try {
      const res = await adminUploadAdImageRequest(file, "background");
      const url = res?.data?.url;
      if (!url) throw new Error("لم يُرجع الخادم رابطًا.");
      setBackgroundUrl(url);
    } catch (e) {
      setUploadError(e?.response?.data?.message || e?.message || "فشل رفع الصورة.");
    } finally {
      setUploading(false);
    }
  };

  const inner = (
    <>
      <div className="oh-admin-ads__field oh-admin-ads__field--full">
        <span className="oh-admin-ads__field-label-spaced">اختر صورة جاهزة</span>
        <div className="oh-admin-ads__asset-grid">
          {AD_VISUAL_ASSETS.map((asset) => {
            const selected = data.selectedAssetKey === asset.key;
            const isCorner = asset.presentation === "corner";
            const thumbSrc = asset.thumbUrl;
            return (
              <button
                key={asset.key}
                type="button"
                className={`oh-admin-ads__asset-tile${selected ? " oh-admin-ads__asset-tile--active" : ""}${isCorner ? " oh-admin-ads__asset-tile--corner" : ""}`}
                aria-pressed={selected}
                onClick={() => pickAsset(asset.key)}
              >
                {selected ? <span className="oh-admin-ads__asset-tile-check" aria-hidden>✓</span> : null}
                <span className={`oh-admin-ads__asset-tile-thumb${isCorner ? " oh-admin-ads__asset-tile-thumb--corner" : ""}`}>
                  <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="oh-admin-ads__asset-tile-label">{asset.label}</span>
              </button>
            );
          })}
        </div>
        {attemptedSave && err("selectedAssetKey") ? (
          <span className="oh-admin-ads__field-error">{err("selectedAssetKey")}</span>
        ) : null}
      </div>

      <div className="oh-admin-ads__field oh-admin-ads__field--full oh-admin-ads__bg-upload">
        <span className="oh-admin-ads__field-label-spaced">صورة خلفية (اختياري)</span>
        <p className="oh-admin-ads__field-hint">
          تُستخدم كخلفية للبانر مع طبقة بيضاء شفافة حتى يظهر النص بوضوح.
        </p>

        {bgUrl ? (
          <div className="oh-admin-ads__bg-preview-row">
            <div className="oh-admin-ads__bg-preview-frame" aria-hidden>
              <span className="oh-admin-ads__bg-preview-overlay" />
              <AdUrlThumb url={bgUrl} label="خلفية" className="oh-admin-ads__bg-preview-thumb" />
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearBackground}>
              إزالة الخلفية
            </button>
          </div>
        ) : null}

        <input
          ref={bgInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="oh-admin-ads__file-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadBackground(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={uploading}
          onClick={() => bgInputRef.current?.click()}
        >
          {uploading ? "جارٍ الرفع…" : "رفع صورة من الجهاز"}
        </button>

        <label htmlFor="ad-bg-url" className="oh-admin-ads__bg-url-label">
          أو ألصق رابط صورة (https)
        </label>
        <input
          id="ad-bg-url"
          dir="ltr"
          placeholder="https://…"
          value={bgUrl}
          onChange={(e) => setBackgroundUrl(e.target.value)}
          className={attemptedSave && err("backgroundImageUrl") ? "oh-admin-ads__input--error" : undefined}
        />
        {attemptedSave && err("backgroundImageUrl") ? (
          <span className="oh-admin-ads__field-error">{err("backgroundImageUrl")}</span>
        ) : null}
        {uploadError ? <span className="oh-admin-ads__field-error">{uploadError}</span> : null}
      </div>
    </>
  );

  if (bare) {
    return <div className="oh-admin-ads__visual-picker oh-admin-ads__visual-picker--bare">{inner}</div>;
  }

  return (
    <FormCard title="الصور" hint="صورة جانبية جاهزة أو خلفية مخصصة">
      {inner}
    </FormCard>
  );
}

function FormCard({ title, hint, children }) {
  return (
    <section className="oh-admin-ads__form-card">
      <header className="oh-admin-ads__form-card-head">
        <h3 className="oh-admin-ads__form-card-title">{title}</h3>
        {hint ? <p className="oh-admin-ads__form-card-hint">{hint}</p> : null}
      </header>
      <div className="oh-admin-ads__builder-grid">{children}</div>
    </section>
  );
}
