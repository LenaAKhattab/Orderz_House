/**
 * Learning timeline + assignment status for admin progress cards.
 * Completion duration uses first lesson → assignment.completed_at only.
 */

const STATUS_LABELS = {
  not_started: "لم يبدأ بعد",
  in_progress: "قيد التعلم",
  waiting_exam: "بانتظار إتمام الاختبار النهائي",
  completed: "مكتمل",
  completed_with_exam: "مكتمل مع الاختبار",
};

/**
 * @param {{
 *   completedLessons: number,
 *   totalLessons: number,
 *   firstLessonCompletedAt?: Date | string | null,
 *   lastLessonCompletedAt?: Date | string | null,
 *   courseCompletedAt?: Date | string | null,
 *   isTestingEnabled?: boolean,
 *   auditSubmittedAt?: Date | string | null,
 *   examFinalGrade?: number | string | null,
 * }} input
 */
function deriveAssignmentLearning({
  completedLessons,
  totalLessons,
  firstLessonCompletedAt,
  lastLessonCompletedAt,
  courseCompletedAt = null,
  isTestingEnabled = false,
  auditSubmittedAt = null,
  examFinalGrade = null,
}) {
  const count = Number(completedLessons) || 0;
  const total = Number(totalLessons) || 0;
  const allLessonsComplete = total > 0 && count >= total;
  const testingOn = Boolean(isTestingEnabled);
  const completedAt = courseCompletedAt ? new Date(courseCompletedAt) : null;
  const courseCompleted = Boolean(completedAt && Number.isFinite(completedAt.getTime()));

  const first = firstLessonCompletedAt ? new Date(firstLessonCompletedAt) : null;
  const last = lastLessonCompletedAt ? new Date(lastLessonCompletedAt) : null;
  const firstOk = first && Number.isFinite(first.getTime());
  const lastOk = last && Number.isFinite(last.getTime());

  let learningStatus = "not_started";
  if (count === 0) {
    learningStatus = "not_started";
  } else if (!allLessonsComplete) {
    learningStatus = "in_progress";
  } else if (testingOn && !courseCompleted) {
    learningStatus = "waiting_exam";
  } else if (courseCompleted && testingOn) {
    learningStatus = "completed_with_exam";
  } else if (courseCompleted) {
    learningStatus = "completed";
  } else {
    learningStatus = "in_progress";
  }

  let startedLearningAt = null;
  if (count >= 1 && firstOk) {
    startedLearningAt = first.toISOString();
  }

  let finishedLearningAt = null;
  if (allLessonsComplete && lastOk) {
    finishedLearningAt = last.toISOString();
  }

  let completionDurationSeconds = null;
  if (courseCompleted && firstOk) {
    const sec = Math.floor((completedAt.getTime() - first.getTime()) / 1000);
    completionDurationSeconds = sec >= 0 ? sec : 0;
  }

  const canShowCompletionDuration = courseCompleted && completionDurationSeconds != null;

  return {
    startedLearningAt,
    finishedLearningAt,
    completionDurationSeconds: canShowCompletionDuration ? completionDurationSeconds : null,
    learningStatus,
    learningStatusLabel: STATUS_LABELS[learningStatus] || STATUS_LABELS.not_started,
    canShowCompletionDuration,
  };
}

module.exports = {
  deriveAssignmentLearning,
  STATUS_LABELS,
};
