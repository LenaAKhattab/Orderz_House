import HomeOfferCard from "../../components/ads/HomeOfferCard";

/**
 * Live admin preview — does not record impressions/clicks.
 * @param {{ draft: object, extraWarnings?: string[] }} props
 */
export default function AdPreview({ draft, extraWarnings = [] }) {
  const previewAd = draft?.title?.trim()
    ? {
        ...draft,
        id: draft.id || "preview",
        texts: Array.isArray(draft.texts) ? draft.texts : [],
        images: Array.isArray(draft.images) ? draft.images.filter((i) => i.url && String(i.url).trim()) : [],
        layoutType: "image_top",
        openInNewTab: Boolean(draft.openInNewTab),
        isClickableCard: Boolean(draft.isClickableCard),
      }
    : null;

  return (
    <div dir="rtl" className="oh-admin-ads__preview-stack">
      {!draft?.title?.trim() ? (
        <div className="oh-admin-ads__preview-placeholder">أضف عنوانًا لعرض شكل الإعلان في عمود العروض.</div>
      ) : (
        <div className="oh-admin-ads__preview-home-rail oh-admin-ads__preview-home-rail--solo">
          <div className="home-featured-offers" dir="rtl">
            <header className="home-featured-offers__head">
              <svg className="home-featured-offers__sparkle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 1.5l2.35 6.95L22 11l-7.65 2.55L12 21l-2.35-7.45L2 11l7.65-2.55L12 1.5z" />
              </svg>
              <h2 className="home-featured-offers__title">عروض وإعلانات مميزة</h2>
            </header>
            <div className="home-featured-offers__stack">
              <HomeOfferCard ad={previewAd} size="featured" />
            </div>
          </div>
        </div>
      )}

      {extraWarnings.length > 0 ? (
        <ul className="oh-admin-ads__preview-warn-list">
          {extraWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
