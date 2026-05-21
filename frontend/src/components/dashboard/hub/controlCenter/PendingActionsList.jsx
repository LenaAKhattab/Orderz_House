import { Link } from "react-router-dom";

export default function PendingActionsList({ actions = [] }) {
  if (!actions.length) {
    return (
      <section className="fdash-cc-pending fdash-cc-pending--clear" aria-labelledby="fdash-pending-heading">
        <h2 id="fdash-pending-heading" className="fdash-cc-pending__title">
          الإجراءات المطلوبة
        </h2>
        <p className="fdash-cc-pending__clear">لا توجد إجراءات عاجلة — أنت على اطلاع.</p>
      </section>
    );
  }

  return (
    <section className="fdash-cc-pending" aria-labelledby="fdash-pending-heading">
      <h2 id="fdash-pending-heading" className="fdash-cc-pending__title">
        الإجراءات المطلوبة
        <span className="fdash-cc-pending__count">{actions.length}</span>
      </h2>
      <ul className="fdash-cc-pending__list">
        {actions.map((a) => (
          <li key={a.id} className={`fdash-cc-pending__item fdash-cc-pending__item--p${a.priority}`}>
            <span className="fdash-cc-pending__icon" aria-hidden>
              {a.icon}
            </span>
            <div className="fdash-cc-pending__copy">
              <h3 className="fdash-cc-pending__item-title">{a.title}</h3>
              <p className="fdash-cc-pending__item-desc">{a.description}</p>
            </div>
            <Link to={a.to} className="fdash-cc-btn fdash-cc-btn--sm">
              {a.cta}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
