import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { resolveFreelancerDashboardItem } from "../../../../lib/i18n/resolveFreelancerDashboardItem";

export default function PendingActionsList({ actions = [] }) {
  const { t, locale } = useTranslation();

  if (!actions.length) {
    return (
      <section className="fdash-cc-pending fdash-cc-pending--clear" aria-labelledby="fdash-pending-heading">
        <h2 id="fdash-pending-heading" className="fdash-cc-pending__title">
          {t("freelancerDashboard.controlCenter.pendingActions.title")}
        </h2>
        <p className="fdash-cc-pending__clear">{t("freelancerDashboard.controlCenter.pendingActions.clear")}</p>
      </section>
    );
  }

  return (
    <section className="fdash-cc-pending" aria-labelledby="fdash-pending-heading">
      <h2 id="fdash-pending-heading" className="fdash-cc-pending__title">
        {t("freelancerDashboard.controlCenter.pendingActions.title")}
        <span className="fdash-cc-pending__count">{actions.length}</span>
      </h2>
      <ul className="fdash-cc-pending__list">
        {actions.map((a) => (
          <li key={a.id} className={`fdash-cc-pending__item fdash-cc-pending__item--p${a.priority}`}>
            <span className="fdash-cc-pending__icon" aria-hidden>
              {a.icon}
            </span>
            <div className="fdash-cc-pending__copy">
              <h3 className="fdash-cc-pending__item-title">
                {resolveFreelancerDashboardItem(a, "title", t, locale)}
              </h3>
              <p className="fdash-cc-pending__item-desc">
                {resolveFreelancerDashboardItem(a, "description", t, locale)}
              </p>
            </div>
            <Link to={a.to} className="fdash-cc-btn fdash-cc-btn--sm">
              {resolveFreelancerDashboardItem(a, "cta", t, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
