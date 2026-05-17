import { useState } from "react";
import SafeAdImage from "../../components/ads/SafeAdImage";

/**
 * Small URL image preview for admin form.
 * @param {{ url?: string; label?: string; className?: string }} p
 */
export default function AdUrlThumb({ url, label = "معاينة", className = "" }) {
  const [failed, setFailed] = useState(false);
  const t = url != null ? String(url).trim() : "";

  if (!t || failed) {
    return (
      <div className={`oh-admin-ads__url-thumb oh-admin-ads__url-thumb--empty ${className}`.trim()} aria-hidden="true">
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div className={`oh-admin-ads__url-thumb ${className}`.trim()}>
      <SafeAdImage
        src={t}
        alt=""
        className="oh-admin-ads__url-thumb-inner"
        imgClassName="oh-admin-ads__url-thumb-img"
      />
    </div>
  );
}
