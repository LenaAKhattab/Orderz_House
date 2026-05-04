import { Link } from "react-router-dom";

/**
 * @param {object} props
 * @param {string} props.backTo
 * @param {string} props.backLabel
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {string} [props.badgeLabel]
 * @param {"neutral"|"success"|"warning"|"info"} [props.badgeTone]
 * @param {string} [props.priceLine] — e.g. "JOD 150" or "JOD 10 – 20"
 * @param {string} [props.trainingLabel]
 * @param {import("react").ReactNode} [props.actions]
 */
export default function OrderHeader({
  backTo,
  backLabel,
  title,
  subtitle,
  badgeLabel,
  badgeTone = "neutral",
  priceLine,
  trainingLabel,
  actions,
}) {
  return (
    <header className="od-header">
      <div className="od-header__toolbar">
        <Link to={backTo} className="od-back-link">
          <span className="od-back-link__icon" aria-hidden>
            →
          </span>
          {backLabel}
        </Link>
        {actions ? <div className="od-header__actions">{actions}</div> : null}
      </div>

      <div className="od-header__hero">
        <div className="od-header__hero-main">
          <h1 className="od-header__title">{title}</h1>
          <div className="od-header__meta-row">
            {badgeLabel ? <span className={`od-badge od-badge--${badgeTone}`}>{badgeLabel}</span> : null}
            {priceLine ? (
              <span className="od-header__price" dir="ltr">
                {priceLine}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="od-header__subtitle">
              {subtitle}
            </p>
          ) : null}
          {trainingLabel ? <p className="od-header__training">{trainingLabel}</p> : null}
        </div>
      </div>
    </header>
  );
}
