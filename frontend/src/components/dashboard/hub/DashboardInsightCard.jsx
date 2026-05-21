import { Link } from "react-router-dom";
import DashboardInsightIcon from "./DashboardInsightIcon";
import { INSIGHT_ICON_MAP } from "./icons/dashboardInsightIcons";

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
  const IconComponent = INSIGHT_ICON_MAP[type] ?? INSIGHT_ICON_MAP.growth;
  const tone = TONE_BY_TYPE[type] || "blue";

  return (
    <article className={`fdash-insight-card fdash-insight-card--${tone} fdash-surface-3d fdash-surface-3d--soft`}>
      <DashboardInsightIcon tone={tone}>
        <IconComponent />
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
