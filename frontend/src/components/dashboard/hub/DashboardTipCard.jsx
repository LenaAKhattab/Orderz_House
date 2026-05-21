import { Link } from "react-router-dom";
import { IconLightbulb } from "./icons/DashboardIcons";

export default function DashboardTipCard({
  title = "نصيحة اليوم",
  headline,
  description,
  progress,
  actionUrl,
  actionLabel,
  embedded = false,
}) {
  const pct = progress != null ? Math.min(100, Math.max(0, Number(progress) || 0)) : null;

  return (
    <aside className={`fdash-tip${embedded ? " fdash-tip--embedded" : ""}`} aria-label={title}>
      <header className="fdash-tip__head">
        <span className="fdash-tip__icon" aria-hidden>
          <IconLightbulb />
        </span>
        <h3 className="fdash-tip__title">{title}</h3>
      </header>
      {headline ? <p className="fdash-tip__headline">{headline}</p> : null}
      {description ? <p className="fdash-tip__text">{description}</p> : null}
      {pct != null ? (
        <div className="fdash-tip__progress-wrap">
          <div className="fdash-tip__progress-meta">
            <span>اكتمال الملف</span>
            <strong>{pct}% مكتمل</strong>
          </div>
          <div className="fdash-tip__progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span className="fdash-tip__progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}
      {actionUrl && actionLabel ? (
        <Link to={actionUrl} className="fdash-tip__link">
          {actionLabel}
        </Link>
      ) : null}
    </aside>
  );
}
