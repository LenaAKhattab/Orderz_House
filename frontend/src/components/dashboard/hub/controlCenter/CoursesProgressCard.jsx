import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { getLocalizedField } from "../../../../lib/i18n/getLocalizedField";
import WidgetLoadError from "./WidgetLoadError";

export default function CoursesProgressCard({
  courseAgg,
  loadState = "ok",
  loadError = "",
  onRetry,
  loading,
  focusBadge = null,
}) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 100 }} />
      </article>
    );
  }

  const failed = loadState === "error";
  const agg = courseAgg || { total: 0, inProgress: 0, completed: 0, pendingFinalTest: 0 };
  const continueCourse = agg.continueCourse;
  const continueTitle =
    getLocalizedField(continueCourse, "title", locale) ||
    t("freelancerDashboard.controlCenter.courses.courseDefault");

  return (
    <article
      className={`fdash-cc-card fdash-cc-card--courses${focusBadge ? " fdash-cc-card--courses-focus" : ""}`}
    >
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">
          {t("freelancerDashboard.controlCenter.courses.title")}
          {focusBadge ? <span className="fdash-cc-card__focus-badge">{focusBadge}</span> : null}
        </h3>
        <Link to="/dashboard/freelancer/courses" className="fdash-cc-card__link">
          {t("freelancerDashboard.controlCenter.courses.allCourses")}
        </Link>
      </header>
      {failed ? (
        <WidgetLoadError
          message={loadError || t("freelancerDashboard.controlCenter.courses.loadError")}
          onRetry={onRetry}
        />
      ) : (
        <>
          <p className="fdash-cc-card__note">{t("freelancerDashboard.controlCenter.courses.note")}</p>
          <div className="fdash-cc-metrics fdash-cc-metrics--4">
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.courses.assigned")}</span>
              <strong className="fdash-cc-metric__value">{agg.total}</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.courses.inProgress")}</span>
              <strong className="fdash-cc-metric__value">{agg.inProgress}</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.courses.completed")}</span>
              <strong className="fdash-cc-metric__value">{agg.completed}</strong>
            </div>
            <div className="fdash-cc-metric fdash-cc-metric--accent">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.courses.finalTest")}</span>
              <strong className="fdash-cc-metric__value">{agg.pendingFinalTest}</strong>
            </div>
          </div>
          {agg.pendingFinalTest > 0 ? (
            <p className="fdash-cc-card__warn">
              {t("freelancerDashboard.controlCenter.courses.pendingFinalTestWarning", {
                count: agg.pendingFinalTest,
              })}
            </p>
          ) : null}
          {continueCourse ? (
            <Link
              to={`/dashboard/freelancer/courses/${continueCourse.id}`}
              className="fdash-cc-btn fdash-cc-btn--block"
            >
              {t("freelancerDashboard.controlCenter.courses.continue", { title: continueTitle })}
            </Link>
          ) : agg.total === 0 ? (
            <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.courses.noCourses")}</p>
          ) : null}
        </>
      )}
    </article>
  );
}
