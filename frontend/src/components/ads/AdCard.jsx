import AdCarousel from "./AdCarousel";
import AdImageBackground from "./AdImageBackground";
import AdImageTop from "./AdImageTop";
import AdMinimalBanner from "./AdMinimalBanner";
import AdSplit from "./AdSplit";
import AdTextOnly from "./AdTextOnly";

/**
 * @param {object} p
 * @param {import("../../types/ad.js").Ad} p.ad
 * @param {() => void} [p.onTrackClick]
 * @param {"sidebar"|"strip"} [p.variant]
 */
export default function AdCard({ ad, onTrackClick, variant = "sidebar" }) {
  const compact = variant === "strip";
  const props = { ad, onTrackClick, compact };

  switch (ad.layoutType) {
    case "image_background":
      return <AdImageBackground {...props} />;
    case "text_only":
      return <AdTextOnly {...props} />;
    case "split":
      return <AdSplit {...props} />;
    case "minimal_banner":
      return <AdMinimalBanner ad={ad} onTrackClick={onTrackClick} />;
    case "carousel": {
      /* تفاعلات الأزرار داخل العرض المتحرك تتعارض مع رابط يغلّف البطاقة */
      const a = { ...ad, isClickableCard: false };
      return <AdCarousel {...props} ad={a} />;
    }
    case "image_top":
    default:
      return <AdImageTop {...props} />;
  }
}
