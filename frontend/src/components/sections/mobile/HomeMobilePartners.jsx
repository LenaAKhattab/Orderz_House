import { PARTNER_LOGOS } from "../../../constants/partnerLogos";

/** Mobile-only partners grid — compact 2×2 logo cards. */
export default function HomeMobilePartners() {
  return (
    <section className="hm-partners" dir="rtl" aria-labelledby="hm-partners-heading">
      <header className="hm-section-head hm-partners__head">
        <h2 id="hm-partners-heading" className="hm-section-head__title">
          شركاء النجاح
        </h2>
      </header>

      <ul id="home-partners-anchor" className="hm-partners__grid" aria-label="شعارات الشركاء">
        {PARTNER_LOGOS.map((item) => (
          <li key={item.id} className="hm-partners__card">
            <img
              className="hm-partners__logo"
              src={item.src}
              alt={item.alt}
              loading="lazy"
              decoding="async"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
