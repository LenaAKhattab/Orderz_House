import { PARTNER_LOGOS, PARTNERS_SECTION_SUBTITLE } from "../../../constants/partnerLogos";

/** Mobile-only partners showcase. */
export default function HomeMobilePartners() {
  return (
    <section className="hm-partners" dir="rtl" aria-labelledby="hm-partners-heading">
      <div className="hm-partners__container">
        <header className="hm-partners__copy">
          <h2 id="hm-partners-heading" className="hm-partners__title">
            شركاء النجاح
          </h2>
          <p className="hm-partners__subtitle">{PARTNERS_SECTION_SUBTITLE}</p>
        </header>

        <ul id="home-partners-anchor" className="hm-partners__grid" aria-label="شعارات الشركاء">
          {PARTNER_LOGOS.map((item) => (
            <li key={item.id} className="hm-partners__grid-cell">
              <a
                href={item.href}
                className="hm-partners__logo-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`زيارة موقع ${item.alt}`}
              >
                <img
                  className="hm-partners__logo"
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
