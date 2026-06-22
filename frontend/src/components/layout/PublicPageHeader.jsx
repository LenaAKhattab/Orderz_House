import { useTranslation } from "../../i18n/LanguageProvider";
import "../../styles/publicPageHeader.css";

/**
 * Shared public page title block — used on /about, /plans, /services, etc.
 */
export default function PublicPageHeader({
  title,
  subtitle,
  description,
  eyebrow,
  trustPills = [],
  className = "",
}) {
  const { dir } = useTranslation();
  const lede = subtitle ?? description;

  return (
    <header className={`public-page-hero ${className}`.trim()} dir={dir}>
      {eyebrow ? <p className="public-page-hero__eyebrow">{eyebrow}</p> : null}
      <h1 className="public-page-hero__title">{title}</h1>
      <div className="public-page-hero__divider" aria-hidden>
        <span className="public-page-hero__divider-line" />
        <span className="public-page-hero__divider-diamond" />
        <span className="public-page-hero__divider-line" />
      </div>
      {lede ? <p className="public-page-hero__lede">{lede}</p> : null}
      {trustPills.length > 0 ? (
        <div className="public-page-hero__trust" role="list">
          {trustPills.map((pill) => (
            <span key={pill} className="public-page-hero__trust-pill" role="listitem">
              {pill}
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}
