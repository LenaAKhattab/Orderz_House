import { Link } from "react-router-dom";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { IconBookOpen } from "./icons/DashboardIcons";

const COURSES_PATH = "/dashboard/freelancer/courses";

export default function DashboardCoursesStartCard() {
  const { t } = useTranslation();

  return (
    <div
      className="fdash-welcome__courses-partition"
      role="group"
      aria-label={t("freelancerDashboard.hero.coursesStart.ariaLabel")}
    >
      <div className="fdash-welcome__courses-partition-head">
        <span className="fdash-welcome__courses-partition-icon" aria-hidden>
          <IconBookOpen />
        </span>
        <h3 className="fdash-welcome__courses-partition-title">{t("freelancerDashboard.hero.coursesStart.title")}</h3>
      </div>
      <p className="fdash-welcome__courses-partition-body">{t("freelancerDashboard.hero.coursesStart.body")}</p>
      <Link to={COURSES_PATH} className="fdash-welcome__courses-partition-link">
        {t("freelancerDashboard.hero.coursesStart.cta")}
      </Link>
    </div>
  );
}
