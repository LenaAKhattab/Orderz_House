import { Link } from "react-router-dom";

/**
 * Hero icon palette — brand navy/orange plus soft teal/sky, muted purple & rose (premium, not saturated).
 */
const H = {
  navy: "#3852B4",
  navySoft: "#5E7AC4",
  orange: "#E07A32",
  sky: "#5BA8D4",
  teal: "#3D9E94",
  mist: "#A8BEE0",
  lilac: "#7A6FA3",
  lilacSoft: "#9A8FB8",
  rose: "#B87D8F",
  roseSoft: "#C99AA8",
  plum: "#6B5E8C",
};

/* —— Arc tiles: rich multi-color icons + progress ring (reference-style) —— */
const IconArcLayout = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="3" width="8" height="8" rx="2" fill={H.orange} />
    <rect x="13" y="3" width="8" height="8" rx="2" fill={H.lilacSoft} />
    <rect x="3" y="13" width="8" height="8" rx="2" fill={H.navy} />
    <rect x="13" y="13" width="8" height="8" rx="2" fill={H.roseSoft} />
  </svg>
);

const IconArcPhone = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 18h.01M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
      stroke={H.plum}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconArcCode = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="m16 18 6-6-6-6M8 6l-6 6 6 6"
      stroke={H.lilac}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconArcOrder = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M6 8h15M6 16h15M6 12h10"
      stroke={H.rose}
      strokeWidth="1.85"
      strokeLinecap="round"
    />
    <path d="M3 8h.01M3 12h.01M3 16h.01" stroke={H.navy} strokeWidth="2.75" strokeLinecap="round" />
  </svg>
);

const IconArcChart = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="12" width="4" height="8" rx="1" fill={H.roseSoft} opacity="0.95" />
    <rect x="10" y="7" width="4" height="13" rx="1" fill={H.plum} opacity="0.88" />
    <rect x="15" y="4" width="4" height="16" rx="1" fill={H.sky} opacity="0.9" />
  </svg>
);

/** Dashed ring + single orange progress segment (reference “loading” feel) */
const IconArcProgress = () => (
  <svg className="home-hero__arc-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="8.25"
      stroke={H.lilacSoft}
      strokeWidth="1.35"
      strokeDasharray="2.2 3.2"
      strokeLinecap="round"
      fill="none"
      opacity="0.85"
    />
    <path
      d="M12 3.75 A 8.25 8.25 0 0 1 19.2 8.1"
      stroke={H.orange}
      strokeWidth="2.25"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);

const arcTiles = [
  { id: "a1", Icon: IconArcLayout },
  { id: "a2", Icon: IconArcPhone },
  { id: "a3", Icon: IconArcCode },
  { id: "a4", Icon: IconArcOrder },
  { id: "a5", Icon: IconArcChart },
  { id: "a6", Icon: IconArcProgress },
];

const HeroSection = () => {
  return (
    <section
      className="home-hero"
      data-navbar-hero
      aria-labelledby="home-hero-heading"
    >
      <div className="home-hero__bg" aria-hidden="true" />

      <div className="container home-hero__inner">
        <div className="home-hero__grid">
          <div className="home-hero__copy">
            <h1 id="home-hero-heading" className="home-hero__title">
              <span className="home-hero__title-line home-hero__title-line--first">
                نصنع لك <span className="home-hero__pill">طلباتك</span>،
              </span>
              <span className="home-hero__title-line home-hero__title-line--second">
                وتشغيلاً رقمياً بثقة
              </span>
            </h1>

            <p className="home-hero__lead">
              منصة تجمع العملاء والمستقلين في مسار واحد: طلبات أوضح، تنفيذ أسرع، ومتابعة أدق —
              بلغة تصميم هادئة ومركّزة على النتيجة.
            </p>

            <div className="home-hero__cta">
              <Link to="/register" className="btn btn-primary home-hero__cta-primary">
                ابدأ الآن
              </Link>
              <Link to="/services" className="btn btn-secondary home-hero__cta-secondary">
                استكشف الخدمات
              </Link>
            </div>
          </div>

          <div className="home-hero__visual" aria-hidden="true">
            <div className="home-hero__arc" role="presentation">
              {arcTiles.map((tile, index) => {
                const TileIcon = tile.Icon;
                return (
                  <div
                    key={tile.id}
                    className={`home-hero__arc-tile home-hero__arc-tile--i${index}`}
                  >
                    <span className="home-hero__arc-tile-inner">
                      <TileIcon />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;