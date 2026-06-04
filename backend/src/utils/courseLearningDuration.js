/**
 * Learning timeline from course_lesson_progress aggregates (MIN/MAX completed_at).
 * Does not use assignment date or course creation date.
 */

/**
 * @param {{
 *   completedLessons: number,
 *   totalLessons: number,
 *   firstLessonCompletedAt?: Date | string | null,
 *   lastLessonCompletedAt?: Date | string | null,
 * }} input
 */
function deriveLearningTimeline({
  completedLessons,
  totalLessons,
  firstLessonCompletedAt,
  lastLessonCompletedAt,
}) {
  const count = Number(completedLessons) || 0;
  const total = Number(totalLessons) || 0;
  const allLessonsComplete = total > 0 && count >= total;

  const first = firstLessonCompletedAt ? new Date(firstLessonCompletedAt) : null;
  const last = lastLessonCompletedAt ? new Date(lastLessonCompletedAt) : null;
  const firstOk = first && Number.isFinite(first.getTime());
  const lastOk = last && Number.isFinite(last.getTime());

  let startedLearningAt = null;
  let finishedLearningAt = null;
  let completionDurationSeconds = null;

  if (count >= 1 && firstOk) {
    startedLearningAt = first.toISOString();
  }

  if (allLessonsComplete && count > 1 && firstOk && lastOk) {
    finishedLearningAt = last.toISOString();
    const sec = Math.floor((last.getTime() - first.getTime()) / 1000);
    completionDurationSeconds = sec >= 0 ? sec : 0;
  }

  return {
    startedLearningAt,
    finishedLearningAt,
    completionDurationSeconds,
  };
}

module.exports = {
  deriveLearningTimeline,
};
