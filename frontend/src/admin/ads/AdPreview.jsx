import { useDeferredValue, useMemo } from "react";
import HomePromoOfferCard from "../../components/ads/HomePromoOfferCard";
import { buildAdminPreviewAd } from "./adminAdPreviewUtils";

/**
 * Live admin preview — debounced to avoid heavy rerenders on every keystroke.
 * @param {{ draft: object, compact?: boolean }} props
 */
export default function AdPreview({ draft, compact = false }) {
  const deferredDraft = useDeferredValue(draft);
  const previewAd = useMemo(() => buildAdminPreviewAd(deferredDraft), [deferredDraft]);
  const isFallback = Boolean(previewAd?._previewDisplay?.useFallbacks);
  const isStale = draft !== deferredDraft;

  return (
    <div dir="rtl" className={`oh-admin-ads__live-preview${compact ? " oh-admin-ads__live-preview--compact" : ""}${isStale ? " oh-admin-ads__live-preview--stale" : ""}`}>
      <header className="oh-admin-ads__live-preview-head">
        <h3 className="oh-admin-ads__live-preview-title">معاينة مباشرة</h3>
        {isStale ? <span className="oh-admin-ads__live-preview-sync">جاري التحديث…</span> : null}
        {isFallback && !isStale ? (
          <p className="oh-admin-ads__live-preview-hint">نص تجريبي للحقول الفارغة.</p>
        ) : null}
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
