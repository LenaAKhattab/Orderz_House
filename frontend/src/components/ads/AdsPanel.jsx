import { useEffect, useRef } from "react";
import AdCard from "./AdCard";
import { postPublicAdClickRequest, postPublicAdImpressionRequest } from "../../services/adsService";
import "./ads.css";

/**
 * @param {object} p
 * @param {"home_right_panel"|"home_after_hero"|"services_page"|"global_sidebar"} [p.placement]
 * @param {"sidebar"|"strip"} [p.variant]
 * @param {import("../../types/ad.js").Ad[]} [p.ads]
 * @param {boolean} [p.loading]
 * @param {boolean} [p.overlay] — عند true: بدون غلاف شبكي؛ يُعرض فقط المحتوى اللاصق لوضع الطبقة الجانبية فوق الصفحة
 */

export default function AdsPanel({
  placement = "home_right_panel",
  variant = "sidebar",
  ads = [],
  loading = false,
  overlay = false,
}) {
  const trackedImpression = useRef(new Set());

  useEffect(() => {
    if (loading || !ads?.length) return;
    for (const ad of ads) {
      const id = String(ad.id);
      if (trackedImpression.current.has(id)) continue;
      trackedImpression.current.add(id);
      postPublicAdImpressionRequest(id, { placement }).catch(() => {});
    }
  }, [ads, loading, placement]);

  const handleAdClick = (adId) => {
    postPublicAdClickRequest(adId, { placement }).catch(() => {});
  };

  if (loading) return null;
  if (!ads || ads.length === 0) return null;

  const stickyStyle =
    variant === "sidebar"
      ? {
          "--oh-ads-sticky-top": "7.5rem",
        }
      : undefined;

  if (variant === "strip") {
    return (
      <div className="oh-ads-strip pb-1 pt-2" dir="rtl">
        {ads.map((ad) => (
          <div key={ad.id} className="oh-ads-strip__item">
            <AdCard ad={ad} variant="strip" onTrackClick={() => handleAdClick(ad.id)} />
          </div>
        ))}
      </div>
    );
  }

  const inner = (
    <div className="oh-ads-panel__sticky space-y-4" style={stickyStyle} dir="rtl">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} variant="sidebar" onTrackClick={() => handleAdClick(ad.id)} />
      ))}
    </div>
  );

  if (overlay) {
    return inner;
  }

  return (
    <aside className="hidden w-[min(100%,320px)] shrink-0 xl:block" aria-label="إعلانات مُختارة" dir="rtl">
      {inner}
    </aside>
  );
}
