import { Link } from "react-router-dom";
import { useTranslation } from "../../../i18n/LanguageProvider";

export default function DashboardHubQuickActions({ items }) {
  const { t } = useTranslation();

  return (
    <div className="fdash-quick" role="navigation" aria-label={t("freelancerDashboard.quickActions.ariaLabel")}>
      {items.map((item) => (
        <Link key={item.to} to={item.to} className="fdash-quick__card">
          <span className="fdash-quick__icon" aria-hidden>
            {item.icon}
          </span>
          <span className="fdash-quick__label">{item.label}</span>
        </Link>
      ))}
    </div>
  );
}
