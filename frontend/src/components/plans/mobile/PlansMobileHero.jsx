import { useTranslation } from "../../../i18n/LanguageProvider";

export default function PlansMobileHero({
  title = null,
  subtitle = null,
  eyebrow = null,
  trustPills = [],
  afterLede = null,
}) {
  const { t } = useTranslation();

  return (
    <header className={`pm-hero ${eyebrow ? "pm-hero--membership" : ""}`.trim()}>
      <div className="pm-hero__top">
        <p className="pm-hero__label">{eyebrow || t("plans.mobileLabel")}</p>
        <h1 className="pm-hero__title">{title || t("plans.hero.title")}</h1>
      </div>
      <p className="pm-hero__lede">{subtitle || t("plans.hero.subtitle")}</p>
      {afterLede}
      {trustPills.length > 0 ? (
        <div className="pm-hero__trust" role="list">
          {trustPills.map((pill) => (
            <span key={pill} className="pm-hero__trust-pill" role="listitem">
              {pill}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}
