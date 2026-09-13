/**
 * Course aggregate helpers for Super Admin Users Control Center (display + filters).
 */

function courseProgress(course) {
  const completed = Number(course?.progress?.completedLessons ?? course?.completedLessons ?? 0);
  const total = Number(course?.progress?.totalLessons ?? course?.totalLessons ?? 0);
  const pct = total > 0 ? Math.round((completed / total) * 100) : course?.courseCompletedAt ? 100 : 0;
  return { completed, total, pct };
}

function isCourseCompleted(course) {
  if (course?.courseCompletedAt) return true;
  const { pct } = courseProgress(course);
  return !course?.isTestingEnabled && pct >= 100;
}

function isCourseFinalTestPending(course) {
  if (!course?.isTestingEnabled || isCourseCompleted(course)) return false;
  const { completed, total } = courseProgress(course);
  return total > 0 && completed >= total;
}

function aggregateCoursesForAdmin(courses = []) {
  let completed = 0;
  let pendingFinalTest = 0;
  let inProgress = 0;
  for (const c of courses) {
    if (isCourseCompleted(c)) {
      completed += 1;
      continue;
    }
    const { pct } = courseProgress(c);
    if (pct > 0) inProgress += 1;
    if (isCourseFinalTestPending(c)) pendingFinalTest += 1;
  }
  const total = courses.length;
  let status = "none";
  if (total > 0 && completed === total && pendingFinalTest === 0) status = "completed";
  else if (pendingFinalTest > 0) status = "pending_final_test";
  else if (inProgress > 0 || completed > 0) status = "in_progress";
  else if (total > 0) status = "assigned";
  return { total, completed, pendingFinalTest, inProgress, status, courses };
}

module.exports = {
  courseProgress,
  isCourseCompleted,
  isCourseFinalTestPending,
  aggregateCoursesForAdmin,
};
