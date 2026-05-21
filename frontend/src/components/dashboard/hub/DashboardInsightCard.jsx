import { Link } from "react-router-dom";
import DashboardInsightIcon from "./DashboardInsightIcon";
import { insightIconForType } from "./icons/DashboardIcons";

const TONE_BY_TYPE = {
  orders: "blue",
  courses: "green",
  performance: "amber",
  profile: "blue",
  subscription: "amber",
  reviews: "purple",
  earnings: "green",
  growth: "blue",
  action: "slate",
};

export default function DashboardInsightCard({
  title,
  description,
  helperText,
  type = "growth",
  actionUrl,
  actionLabel,
}) {
  const Icon = insightIconForType(type);
  const tone = TONE_BY_TYPE[type] || "blue";

  return (
    <article className={`fdash-insight-card fdash-insight-card--${tone} fdash-surface-3d fdash-surface-3d--soft`}>
      <DashboardInsightIcon tone={tone}>
        <Icon />
      </DashboardInsightIcon>

      <div className="fdash-insight-card__content">
        <h3 className="fdash-insight-card__title">{title}</h3>
        {description ? <p className="fdash-insight-card__subtitle">{description}</p> : null}
        {helperText ? <p className="fdash-insight-card__helper">{helperText}</p> : null}
        {actionUrl && actionLabel ? (
          <Link to={actionUrl} className="fdash-insight-card__link">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
