import { PARTNER_LOGOS } from "../../constants/partnerLogos";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./partners-section.css";

/**
 * Partners showcase — text + logo grid on page background.
 * Logos live in `public/partners/`.
 */
const PartnersSection = () => {
  const { t, dir } = useTranslation();

  return (
    <section className="partners-section" aria-labelledby="partners-section-heading">
      <div className="partners-section__container">
        <div className="partners-section__content" dir={dir}>
          <div className="partners-section__copy">
            <h2 id="partners-section-heading" className="partners-section__title">
              {t("home.partners.title")}
            </h2>
            <p className="partners-section__subtitle">{t("home.partners.subtitle")}</p>
          </div>

          <ul
            id="home-partners-anchor"
            className="partners-section__grid"
            aria-label={t("home.partners.logosAria")}
          >
            {PARTNER_LOGOS.map((item) => (
              <li key={item.id} className="partners-section__grid-cell">
                <a
                  href={item.href}
                  className="partners-section__logo-link"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={t("home.partners.visitSite", { name: item.alt })}
                >
                  {item.logoBadge === "circle" ? (
                    <span className="partners-section__logo-badge">
                      <img
                        className="partners-section__logo partners-section__logo--badged"
                        src={item.src}
                        alt={item.alt}
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                  ) : (
                    <img
                      className="partners-section__logo"
                      src={item.src}
                      alt={item.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
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
