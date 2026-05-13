import { createPortal } from "react-dom";
import HomePromoOfferCard from "./HomePromoOfferCard";
import "./home-sticky-ads-dock.css";

/**
 * Fixed vertical rail (desktop) — same handlers as in-flow promo cards.
 * @param {{
 *   visible: boolean;
 *   ads: import("../../types/ad.js").Ad[];
 *   openDetails: (ad: import("../../types/ad.js").Ad, el: HTMLElement) => void;
 *   onTrackClick: (adId: string) => void;
 * }} p
 */
export default function HomeStickyAdsDock({ visible, ads, openDetails, onTrackClick }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <aside
      className={`home-sticky-ads-dock${visible ? " home-sticky-ads-dock--visible" : ""}`}
      dir="rtl"
      aria-label="عروض مميزة — عائم"
      aria-hidden={!visible}
    >
      <div className="home-sticky-ads-dock__panel">
        <p className="home-sticky-ads-dock__eyebrow">عروض وإعلانات</p>
        <div className="home-sticky-ads-dock__list">
          {ads.map((ad) => (
            <div key={ad.id} className="home-sticky-ads-dock__item">
              <HomePromoOfferCard
                ad={ad}
                variant="sticky"
                onTrackClick={() => onTrackClick(ad.id)}
                onOpenDetails={openDetails}
              />
            </div>
          ))}
        </div>
      </div>
    </aside>,
    document.body
  );
}
