import { PARTNER_LOGOS } from "../../../constants/partnerLogos";
import { useTranslation } from "../../../i18n/LanguageProvider";

/** Mobile-only partners showcase. */
export default function HomeMobilePartners() {
  const { t, dir } = useTranslation();

  return (
    <section className="hm-partners" dir={dir} aria-labelledby="hm-partners-heading">
      <div className="hm-partners__container">
        <header className="hm-partners__copy">
          <h2 id="hm-partners-heading" className="hm-partners__title">
            {t("home.partners.title")}
          </h2>
          <p className="hm-partners__subtitle">{t("home.partners.subtitle")}</p>
        </header>

        <ul id="home-partners-anchor" className="hm-partners__grid" aria-label={t("home.partners.logosAria")}>
          {PARTNER_LOGOS.map((item) => (
            <li key={item.id} className="hm-partners__grid-cell">
              <a
                href={item.href}
                className="hm-partners__logo-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("home.partners.visitSite", { name: item.alt })}
              >
                {item.logoBadge === "circle" ? (
                  <span className="hm-partners__logo-badge">
                    <img
                      className="hm-partners__logo hm-partners__logo--badged"
                      src={item.src}
                      alt={item.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                ) : (
                  <img
                    className="hm-partners__logo"
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
    </section>
  );
}
