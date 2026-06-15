import { Link } from "react-router-dom";
import { useTranslation } from "../../../i18n/LanguageProvider";
import { IconBell } from "./icons/DashboardIcons";
import {
  freelancerAccountReviewUrl,
  resolveFreelancerCoursesActionUrl,
} from "../../../utils/freelancerAccountReadiness";

function ReadinessShell({ variant, title, message, actionTo, actionLabel, titleId }) {
  return (
    <section
      className={`fdash-banner fdash-banner--readiness fdash-banner--readiness-${variant} fdash-surface-3d fdash-surface-3d--thin`}
      aria-labelledby={titleId}
      data-account-readiness={variant}
    >
      <div className="fdash-banner__content fdash-banner__content--readiness">
        <h2 id={titleId} className="fdash-banner__title">
          {title}
        </h2>
        <p className="fdash-banner__subtitle">{message}</p>
        {actionTo && actionLabel ? (
          <div className="fdash-banner__actions">
            <Link to={actionTo} className="fdash-banner__cta fdash-banner__cta--primary">
              {actionLabel}
            </Link>
          </div>
        ) : null}
      </div>

      <span className="fdash-banner__icon fdash-banner__icon--status" aria-hidden>
        <IconBell />
      </span>
    </section>
  );
}

/**
 * Two-step onboarding status for freelancers awaiting company approval.
 * Shown only on freelancer dashboard home when course progress is known.
 */
export default function FreelancerAccountReadinessNotice({ readinessState, coursesSection }) {
  const { t } = useTranslation();

  if (
    readinessState !== "courses_incomplete" &&
    readinessState !== "courses_complete_pending_approval"
  ) {
    return null;
  }

  if (readinessState === "courses_incomplete") {
    return (
      <ReadinessShell
        variant="courses"
        titleId="fdash-readiness-courses-title"
        title={t("dashboard.freelancer.accountReadiness.completeCoursesTitle")}
        message={t("dashboard.freelancer.accountReadiness.completeCoursesMessage")}
        actionTo={resolveFreelancerCoursesActionUrl(coursesSection)}
        actionLabel={t("dashboard.freelancer.accountReadiness.viewCourses")}
      />
    );
  }

  return (
    <ReadinessShell
      variant="approval"
      titleId="fdash-readiness-approval-title"
      title={t("dashboard.freelancer.accountReadiness.coursesCompletedTitle")}
      message={t("dashboard.freelancer.accountReadiness.coursesCompletedPendingApprovalMessage")}
      actionTo={freelancerAccountReviewUrl()}
      actionLabel={t("dashboard.freelancer.accountReadiness.reviewAccount")}
    />
  );
}
