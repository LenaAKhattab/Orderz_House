/** IDs superseded by the account-readiness notice on freelancer dashboard home. */
export const ACCOUNT_READINESS_SUPERSEDED_ACTION_IDS = new Set([
  "company-pending",
  "final-test",
  "courses-pending",
]);

const FREELANCER_COURSES_PATH = "/dashboard/freelancer/courses";
const FREELANCER_ACTIVATE_ACCOUNT_PATH = "/dashboard/freelancer/activate-account";

/**
 * Same gate as pool admin-approval messaging: subscription awaiting company approval
 * and payment is not blocking pool eligibility evaluation.
 */
export function isFreelancerAdminApprovalPending(subscription, eligibility) {
  const activation = String(subscription?.activationStatus || "");
  const payment = String(subscription?.paymentStatus || "");
  const reason = String(eligibility?.reason || "");
  const isCompanyPending =
    activation === "company_pending" &&
    (payment === "paid" || payment === "pending" || payment === "not_required" || payment === "");
  return isCompanyPending || reason === "company_activation_pending";
}

/**
 * Required courses are complete when every assigned course is finished,
 * including any final exam (pendingFinalTest === 0).
 * Uses dashboard-summary `courses` aggregate from GET /freelancer/dashboard-summary.
 */
export function areRequiredCoursesComplete(coursesAgg) {
  if (!coursesAgg) return false;
  const total = Number(coursesAgg.total) || 0;
  if (total === 0) return true;
  const completed = Number(coursesAgg.completed) || 0;
  const pendingFinalTest = Number(coursesAgg.pendingFinalTest) || 0;
  return completed === total && pendingFinalTest === 0;
}

/**
 * @returns {'hidden' | 'unknown' | 'courses_incomplete' | 'courses_complete_pending_approval'}
 */
export function resolveFreelancerAccountReadiness(summary) {
  if (!summary) return "hidden";

  const subscription = summary.subscription ?? null;
  const eligibility = summary.eligibility ?? null;

  if (String(subscription?.activationStatus || "") === "company_approved") {
    return "hidden";
  }

  if (!isFreelancerAdminApprovalPending(subscription, eligibility)) {
    return "hidden";
  }

  const coursesSection = summary.courses;
  if (!coursesSection || coursesSection.loadState !== "ok") {
    return "unknown";
  }

  const coursesAgg = {
    total: coursesSection.total,
    completed: coursesSection.completed,
    pendingFinalTest: coursesSection.pendingFinalTest,
    latestInProgressCourse: coursesSection.latestInProgressCourse,
    continueCourse: coursesSection.continueCourse,
  };

  if (!areRequiredCoursesComplete(coursesAgg)) {
    return "courses_incomplete";
  }

  return "courses_complete_pending_approval";
}

export function resolveFreelancerCoursesActionUrl(coursesSection) {
  const latest =
    coursesSection?.latestInProgressCourse || coursesSection?.continueCourse || null;
  if (latest?.id) {
    return `${FREELANCER_COURSES_PATH}/${latest.id}`;
  }
  return FREELANCER_COURSES_PATH;
}

export function freelancerAccountReviewUrl() {
  return FREELANCER_ACTIVATE_ACCOUNT_PATH;
}

export function filterPendingActionsForAccountReadiness(actions = [], readinessState) {
  if (
    readinessState !== "courses_incomplete" &&
    readinessState !== "courses_complete_pending_approval"
  ) {
    return actions;
  }
  return actions.filter((action) => !ACCOUNT_READINESS_SUPERSEDED_ACTION_IDS.has(action.id));
}

export function filterInsightsForAccountReadiness(insights = [], readinessState) {
  if (
    readinessState !== "courses_incomplete" &&
    readinessState !== "courses_complete_pending_approval"
  ) {
    return insights;
  }
  return insights.filter((item) => {
    const id = String(item?.id || "");
    if (id === "company-pending" || id === "pending-company-pending") return false;
    if (id === "final-test" || id === "pending-final-test" || id === "course-progress") return false;
    return true;
  });
}
