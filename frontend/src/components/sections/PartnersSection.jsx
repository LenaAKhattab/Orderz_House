import { PARTNER_LOGOS, PARTNERS_SECTION_SUBTITLE } from "../../constants/partnerLogos";
import "./partners-section.css";

/**
 * Partners showcase — text + logo grid on page background.
 * Logos live in `public/partners/`.
 */
const PartnersSection = () => {
  return (
    <section className="partners-section" aria-labelledby="partners-section-heading">
      <div className="partners-section__container">
        <div className="partners-section__content" dir="rtl">
          <div className="partners-section__copy">
            <h2 id="partners-section-heading" className="partners-section__title">
              شركاء النجاح
            </h2>
            <p className="partners-section__subtitle">{PARTNERS_SECTION_SUBTITLE}</p>
          </div>

          <ul
            id="home-partners-anchor"
            className="partners-section__grid"
            aria-label="شعارات الشركاء"
          >
            {PARTNER_LOGOS.map((item) => (
              <li key={item.id} className="partners-section__grid-cell">
                <a
                  href={item.href}
                  className="partners-section__logo-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`زيارة موقع ${item.alt}`}
                >
                  <img
                    className="partners-section__logo"
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
      </div>
    </section>
  );
};

export default PartnersSection;
