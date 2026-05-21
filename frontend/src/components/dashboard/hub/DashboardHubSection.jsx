import { Link } from "react-router-dom";

export default function DashboardHubSection({ title, actionLabel, actionTo, children, id }) {
  return (
    <section className="fdash-section" aria-labelledby={id}>
      {title ? (
        <div className="fdash-section__head">
          <h2 id={id} className="fdash-section__title">
            {title}
          </h2>
          {actionLabel && actionTo ? (
            <Link className="fdash-section__link" to={actionTo}>
              {actionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
