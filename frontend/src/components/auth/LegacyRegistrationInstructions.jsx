import { CheckCircle2, Info } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";

function Emph({ children }) {
  return <strong className="oh-legacy-instructions__emph">{children}</strong>;
}

function IntroText() {
  const { t } = useTranslation();
  return (
    <>
      {t("legacy.registration.introBefore")}
      <Emph>{t("legacy.registration.introEmph1")}</Emph>
      {t("legacy.registration.introMid")}
      <Emph>{t("legacy.registration.introEmph2")}</Emph>
      {t("legacy.registration.introAfter")}
    </>
  );
}

function BulletList() {
  const { t } = useTranslation();
  const bullets = useMemo(
    () => [0, 1, 2, 3, 4].map((i) => t(`legacy.registration.bullets.${i}`)),
    [t],
  );

  return (
    <ul className="oh-legacy-instructions__list">
      {bullets.map((text, index) => {
        const isLast = index === bullets.length - 1;
        return (
          <li key={text} className="oh-legacy-instructions__item">
            <CheckCircle2
              className="oh-legacy-instructions__icon"
              aria-hidden="true"
              strokeWidth={2}
            />
            <span>
              {isLast ? (
                <>
                  {t("legacy.registration.lastBulletBefore")}
                  <Emph>{t("legacy.registration.lastBulletEmph")}</Emph>
                  {t("legacy.registration.lastBulletAfter")}
                </>
              ) : (
                text
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function InstructionsBody({ variant }) {
  const { t } = useTranslation();
  return (
    <>
      <header className="oh-legacy-instructions__header">
        <h2 className="oh-legacy-instructions__title">{t("legacy.registration.title")}</h2>
        <p className="oh-legacy-instructions__intro">
          <IntroText />
        </p>
      </header>

      <section className="oh-legacy-instructions__section" aria-labelledby={`legacy-guidelines-${variant}`}>
        <h3 id={`legacy-guidelines-${variant}`} className="oh-legacy-instructions__section-title">
          {t("legacy.registration.guidelinesTitle")}
        </h3>
        <BulletList />
      </section>

      <section
        className="oh-legacy-instructions__declaration"
        aria-labelledby={`legacy-declaration-${variant}`}
      >
        <div className="oh-legacy-instructions__declaration-head">
          <Info className="oh-legacy-instructions__declaration-icon" aria-hidden="true" strokeWidth={2} />
          <h3 id={`legacy-declaration-${variant}`} className="oh-legacy-instructions__declaration-title">
            {t("legacy.registration.declarationTitle")}
          </h3>
        </div>
        <p className="oh-legacy-instructions__declaration-text">{t("legacy.registration.declarationText")}</p>
      </section>
    </>
  );
}

/**
 * Instructions for Legacy Freelancer invite registration only.
 * @param {{ variant?: "visual" | "form" }} props
 */
export default function LegacyRegistrationInstructions({ variant = "visual" }) {
  const { t, isRtl } = useTranslation();
  const isVisual = variant === "visual";
  const dir = isRtl ? "rtl" : "ltr";

  if (isVisual) {
    return (
      <div className="oh-legacy-instructions oh-legacy-instructions--visual" dir={dir}>
        <div className="oh-legacy-instructions__card">
          <InstructionsBody variant={variant} />
        </div>
      </div>
    );
  }

  return (
    <details className="oh-legacy-instructions oh-legacy-instructions--form" dir={dir} open>
      <summary className="oh-legacy-instructions__summary">
        <span>{t("legacy.registration.title")}</span>
      </summary>
      <div className="oh-legacy-instructions__form-body">
        <InstructionsBody variant={variant} />
      </div>
    </details>
  );
}
