/**
 * Partner logos strip — soft wave + subtle brand tints (design system only).
 * Logos live in `public/partners/`.
 */
const PARTNER_LOGOS = [
  { id: "fazaat", src: "/partners/Fazaat.png", alt: "فزعة" },
  { id: "bildazo", src: "/partners/Bildazo.png", alt: "بيلدازو" },
  { id: "studyzhouse", src: "/partners/studyzhouse.png", alt: "ستادي هاوس" },
  { id: "battech", src: "/partners/Battech.png", alt: "بات تكنو" },
];

const PartnersSection = () => {
  return (
    <section className="partners-section" aria-label="شركاء النجاح">
      <div className="partners-section__bg" aria-hidden="true" />

      <div className="partners-section__wave-top" aria-hidden="true">
        <svg
          className="partners-section__wave-svg"
          viewBox="0 0 1440 64"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="#ffffff"
            d="M0 0h1440v20Q1080 56 720 36T0 28V0z"
          />
        </svg>
      </div>

      <div className="partners-decor partners-decor--circle" aria-hidden="true" />
      <div className="partners-decor partners-decor--dots" aria-hidden="true" />

      <div className="container partners-section__inner">
        <h2 className="partners-section__title">شركاء النجاح</h2>
        <ul className="partners-section__logos">
          {PARTNER_LOGOS.map((item) => (
            <li key={item.id} className="partners-section__logo-item">
              <div className="partners-section__logo-wrap">
                <img
                  className="partners-section__logo-img"
                  src={item.src}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="partners-section__wave-bottom" aria-hidden="true">
        <svg
          className="partners-section__wave-svg partners-section__wave-svg--bottom"
          viewBox="0 0 1440 48"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="#ffffff"
            d="M0 8Q360 0 720 20t720-12v40H0z"
          />
        </svg>
      </div>
    </section>
  );
};

export default PartnersSection;
