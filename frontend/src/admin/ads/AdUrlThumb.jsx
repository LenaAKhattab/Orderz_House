import SafeAdImage from "../../components/ads/SafeAdImage";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * Small URL image preview for admin form.
 * @param {{ url?: string; label?: string; className?: string }} p
 */
export default function AdUrlThumb({ url, label, className = "" }) {
  const { t } = useTranslation();
  const displayLabel = label ?? t("ads.common.preview");
  const trimmedUrl = url != null ? String(url).trim() : "";

  if (!trimmedUrl) {
    return (
      <div className={`oh-admin-ads__url-thumb oh-admin-ads__url-thumb--empty ${className}`.trim()} aria-hidden="true">
        <span>{displayLabel}</span>
      </div>
    );
  }

  return (
    <div className={`oh-admin-ads__url-thumb ${className}`.trim()}>
      <SafeAdImage
        src={trimmedUrl}
        alt=""
        className="oh-admin-ads__url-thumb-inner"
        imgClassName="oh-admin-ads__url-thumb-img"
      />
    </div>
  );
}
