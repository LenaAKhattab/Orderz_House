import "./trusted-by-section.css";

/** Reference-style wordmarks (SVG + CSS) — compact row below hero */
function LogoUcraft() {
  return (
    <span className="trusted-by-mark trusted-by-mark--ucraft" aria-hidden="true">
      ucraft
    </span>
  );
}

function LogoUcom() {
  return (
    <span className="trusted-by-mark trusted-by-mark--ucom" aria-hidden="true">
      <svg className="trusted-by-mark__ucom-bubble" viewBox="0 0 36 32" width="46" height="41">
        <path
          fill="#16a34a"
          d="M30 4H10C7.2 4 5 6.2 5 9v10c0 2.8 2.2 5 5 5h4l-2 6 8-6h10c2.8 0 5-2.2 5-5V9c0-2.8-2.2-5-5-5Z"
        />
        <text x="11" y="20" fill="#fff" fontSize="13" fontWeight="700" fontFamily="system-ui,sans-serif">
          U!
        </text>
      </svg>
      <span className="trusted-by-mark__ucom-text">com</span>
    </span>
  );
}

function LogoParma() {
  return (
    <span className="trusted-by-mark trusted-by-mark--parma" aria-hidden="true">
      <span className="trusted-by-mark__parma-main">PARMA</span>
      <span className="trusted-by-mark__parma-line">
        <span className="trusted-by-mark__parma-rule" />
        <span className="trusted-by-mark__parma-sub">SUPERMARKET</span>
        <span className="trusted-by-mark__parma-rule" />
      </span>
    </span>
  );
}

function LogoYerevanMall() {
  return (
    <span className="trusted-by-mark trusted-by-mark--yerevan" aria-hidden="true">
      <svg className="trusted-by-mark__yerevan-icon" viewBox="0 0 40 36" width="51" height="45">
        {/* Stylized M from colored squares */}
        <rect x="0" y="8" width="8" height="8" fill="#ec4899" rx="1" />
        <rect x="0" y="16" width="8" height="8" fill="#a855f7" rx="1" />
        <rect x="8" y="12" width="8" height="8" fill="#d946ef" rx="1" />
        <rect x="16" y="8" width="8" height="8" fill="#ec4899" rx="1" />
        <rect x="16" y="16" width="8" height="8" fill="#a855f7" rx="1" />
        <rect x="24" y="12" width="8" height="8" fill="#e879f9" rx="1" />
        <rect x="32" y="8" width="8" height="8" fill="#c026d3" rx="1" />
        <rect x="32" y="16" width="8" height="8" fill="#ec4899" rx="1" />
      </svg>
      <span className="trusted-by-mark__yerevan-text">YEREVAN MALL</span>
    </span>
  );
}

function LogoGalaxy() {
  return (
    <span className="trusted-by-mark trusted-by-mark--galaxy" aria-hidden="true">
      <span className="trusted-by-mark__galaxy-top">GALAXY</span>
      <span className="trusted-by-mark__galaxy-sub">GROUP OF COMPANIES</span>
    </span>
  );
}

function LogoKinoPark() {
  return (
    <span className="trusted-by-mark trusted-by-mark--kino" aria-hidden="true">
      <span className="trusted-by-mark__kino-circles">
        <span className="trusted-by-mark__kino-c trusted-by-mark__kino-c--a" />
        <span className="trusted-by-mark__kino-c trusted-by-mark__kino-c--b" />
        <span className="trusted-by-mark__kino-c trusted-by-mark__kino-c--c" />
      </span>
      <span className="trusted-by-mark__kino-text">KINO PARK</span>
    </span>
  );
}

function LogoSoftConstruct() {
  return (
    <span className="trusted-by-mark trusted-by-mark--soft" aria-hidden="true">
      <span className="trusted-by-mark__soft-heavy">SOFT</span>
      <span className="trusted-by-mark__soft-light">CONSTRUCT</span>
    </span>
  );
}

const TrustedBySection = () => {
  return (
    <section className="trusted-by-section" aria-labelledby="trusted-by-heading">
      <div className="container trusted-by-section__inner">
        <h2 id="trusted-by-heading" className="trusted-by-section__title">
          اكتسبنا ثقتهم وثقة أكثر من 150+ شركة
        </h2>
        <div className="trusted-by-section__logos" dir="ltr">
          <div className="trusted-by-section__logo-cell">
            <LogoUcraft />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoUcom />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoParma />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoYerevanMall />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoGalaxy />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoKinoPark />
          </div>
          <div className="trusted-by-section__logo-cell">
            <LogoSoftConstruct />
          </div>
        </div>
      </div>
    </section>
  );
};

export default TrustedBySection;
