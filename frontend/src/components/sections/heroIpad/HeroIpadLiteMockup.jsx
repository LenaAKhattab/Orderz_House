import { useTranslation } from "../../../i18n/LanguageProvider";
import "./home-hero-ipad-lite.css";

const BAR_H = ["68%", "42%", "88%", "55%", "72%"];

/**
 * Static stylized dashboard inside the hero tablet shell — no API hooks, no dense UI.
 * Keeps the same outer device markup/classes as `HeroIpadMockup` for consistent chrome.
 */
export default function HeroIpadLiteMockup() {
  const { t, dir } = useTranslation();
  const l = (suffix) => t(`home.heroIpad.lite.${suffix}`);

  return (
    <div className="home-hero-ipad-mockup w-full shrink-0">
      <div className="home-hero-ipad-device-stage relative mx-auto w-full max-w-[min(100%,min(92vw,420px))] md:max-w-[min(100%,clamp(620px,48vw,860px))]">
        <div className="home-hero-ipad-tablet-root home-hero-ipad-tablet-root--device relative aspect-[4/3] w-full shrink-0">
          <div className="home-hero-ipad-device-tilt">
            <div className="home-hero-ipad-chassis">
              <div className="home-hero-ipad-chassis__specular" aria-hidden />
              <span className="home-hero-ipad-chassis__side home-hero-ipad-chassis__side--start" aria-hidden />
              <span className="home-hero-ipad-chassis__side home-hero-ipad-chassis__side--end" aria-hidden />

              <div className="home-hero-ipad-bezel">
                <div className="home-hero-ipad-bezel__top">
                  <span className="home-hero-ipad-bezel__camera" aria-hidden />
                </div>
                <div className="home-hero-ipad-bezel__screen-rim">
                  <div className="home-hero-ipad-bezel__screen">
                    <div
                      className="home-hero-ipad-mockup__viewport-inner home-hero-ipad-lite w-full"
                      dir={dir}
                      aria-hidden
                    >
                      <div className="home-hero-ipad-lite__top">
                        <span className="home-hero-ipad-lite__brand">{l("dashboard")}</span>
                        <div className="home-hero-ipad-lite__dots" aria-hidden>
                          <span />
                          <span />
                          <span />
                        </div>
                      </div>

                      <div className="home-hero-ipad-lite__stats">
                        <div className="home-hero-ipad-lite__stat">
                          <span className="home-hero-ipad-lite__stat-val">{l("statActivityValue")}</span>
                          <span className="home-hero-ipad-lite__stat-lbl">{l("statActivity")}</span>
                        </div>
                        <div className="home-hero-ipad-lite__stat">
                          <span className="home-hero-ipad-lite__stat-val">{l("statOrdersValue")}</span>
                          <span className="home-hero-ipad-lite__stat-lbl">{l("statOrders")}</span>
                        </div>
                        <div className="home-hero-ipad-lite__stat">
                          <span className="home-hero-ipad-lite__stat-val">{l("statCompleteValue")}</span>
                          <span className="home-hero-ipad-lite__stat-lbl">{l("statComplete")}</span>
                        </div>
                      </div>

                      <div className="home-hero-ipad-lite__chart">
                        <span className="home-hero-ipad-lite__chart-cap">{l("quickGlance")}</span>
                        <div className="home-hero-ipad-lite__bars">
                          {BAR_H.map((h, i) => (
                            <div key={i} className="home-hero-ipad-lite__bar" style={{ height: h }} />
                          ))}
                        </div>
                      </div>

                      <div className="home-hero-ipad-lite__list">
                        <span className="home-hero-ipad-lite__list-cap">{l("recentActivity")}</span>
                        <div className="home-hero-ipad-lite__row">
                          <span className="home-hero-ipad-lite__row-t">{l("rowDesign")}</span>
                          <span className="home-hero-ipad-lite__pill">{l("pillInProgress")}</span>
                        </div>
                        <div className="home-hero-ipad-lite__row">
                          <span className="home-hero-ipad-lite__row-t">{l("rowDev")}</span>
                          <span className="home-hero-ipad-lite__pill home-hero-ipad-lite__pill--sky">{l("pillNew")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
