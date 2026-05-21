import { Link } from "react-router-dom";

export default function DashboardHubEmpty({ icon, title, subtitle, actionLabel, onAction, actionTo }) {
  return (
    <div className="fdash-empty">
      {icon ? (
        <span className="fdash-empty__icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <h3 className="fdash-empty__title">{title}</h3>
      {subtitle ? <p className="fdash-empty__sub">{subtitle}</p> : null}
      {actionLabel && actionTo ? (
        <Link className="fdash-empty__btn" to={actionTo}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction && !actionTo ? (
        <button type="button" className="fdash-empty__btn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
