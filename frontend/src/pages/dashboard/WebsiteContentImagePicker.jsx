import { useRef, useState } from "react";
import { uploadSuperAdminWebsiteImageRequest } from "../../services/api";

/**
 * Simple image picker for Super Admin website content blocks.
 */
export default function WebsiteContentImagePicker({ value, onChange, disabled = false }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const upload = async (file) => {
    if (!file || disabled) return;
    setError("");
    setUploading(true);
    try {
      const res = await uploadSuperAdminWebsiteImageRequest(file);
      const url = res?.data?.url;
      if (!url) throw new Error("لم يُرجع الخادم رابطًا.");
      onChange(url);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "فشل رفع الصورة.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="oh-website-image-picker">
      {value ? (
        <div className="oh-website-image-picker__preview">
          <img src={value} alt="" />
        </div>
      ) : null}
      <div className="oh-website-image-picker__actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="oh-website-image-picker__input"
          disabled={disabled || uploading}
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "جاري الرفع…" : value ? "تغيير الصورة" : "رفع صورة"}
        </button>
        {value ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || uploading}
            onClick={() => onChange("")}
          >
            إزالة
          </button>
        ) : null}
      </div>
      <label className="oh-website-image-picker__url">
        أو ألصق رابط الصورة
        <input
          type="url"
          value={value || ""}
          disabled={disabled || uploading}
          onChange={(e) => onChange(e.target.value.trim())}
          placeholder="https://"
          dir="ltr"
        />
      </label>
      {error ? <p className="oh-website-image-picker__error">{error}</p> : null}
    </div>
  );
}
