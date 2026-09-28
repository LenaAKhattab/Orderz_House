import { useDeferredValue, useMemo } from "react";
import HomePromoOfferCard from "../../components/ads/HomePromoOfferCard";
import { buildAdminPreviewAd } from "./adminAdPreviewUtils";
import { getPreviewFallbacks } from "./adsLocaleHelpers";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/adsResources";

/**
 * Live admin preview — debounced to avoid heavy rerenders on every keystroke.
 * @param {{ draft: object, compact?: boolean }} props
 */
export default function AdPreview({ draft, compact = false }) {
  const { t, dir } = useTranslation();
  const deferredDraft = useDeferredValue(draft);
  const fallbacks = useMemo(() => getPreviewFallbacks(t), [t]);
  const previewAd = useMemo(() => buildAdminPreviewAd(deferredDraft, fallbacks), [deferredDraft, fallbacks]);
  const isFallback = Boolean(previewAd?._previewDisplay?.useFallbacks);
  const isStale = draft !== deferredDraft;

  return (
    <div
      dir={dir}
      className={`oh-admin-ads__live-preview${compact ? " oh-admin-ads__live-preview--compact" : ""}${isStale ? " oh-admin-ads__live-preview--stale" : ""}`}
    >
      <header className="oh-admin-ads__live-preview-head">
        <h3 className="oh-admin-ads__live-preview-title">{t("ads.preview.liveTitle")}</h3>
        {isStale ? <span className="oh-admin-ads__live-preview-sync">{t("ads.preview.syncing")}</span> : null}
        {isFallback && !isStale ? <p className="oh-admin-ads__live-preview-hint">{t("ads.preview.emptyHint")}</p> : null}
      </header>
      <div className="oh-admin-ads__live-preview-stage">
        {previewAd ? (
          <div className="oh-admin-ads__live-preview-card-wrap">
            <HomePromoOfferCard ad={previewAd} previewMode />
          </div>
        ) : null}
      </div>
    </div>
  );
}
