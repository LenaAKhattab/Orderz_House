import "../../styles/publicPageHeader.css";

/**
 * Shared public page title block (RTL) — used on /plans, /services, etc.
 */
export default function PublicPageHeader({ title, description, className = "" }) {
  return (
    <header className={`public-page-hero ${className}`.trim()}>
      <h1 className="public-page-hero__title">{title}</h1>
      <div className="public-page-hero__divider" aria-hidden>
        <span className="public-page-hero__divider-line" />
        <span className="public-page-hero__divider-diamond" />
        <span className="public-page-hero__divider-line" />
      </div>
      {description ? <p className="public-page-hero__lede">{description}</p> : null}
    </header>
  );
}
