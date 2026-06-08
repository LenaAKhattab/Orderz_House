const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveAssignmentLearning } = require("../src/utils/courseLearningDuration");

test("deriveAssignmentLearning — not started", () => {
  const r = deriveAssignmentLearning({ completedLessons: 0, totalLessons: 93 });
  assert.equal(r.learningStatus, "not_started");
  assert.equal(r.learningStatusLabel, "لم يبدأ بعد");
  assert.equal(r.completionDurationSeconds, null);
  assert.equal(r.canShowCompletionDuration, false);
});

test("deriveAssignmentLearning — in progress", () => {
  const r = deriveAssignmentLearning({
    completedLessons: 12,
    totalLessons: 93,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-05T12:00:00.000Z",
  });
  assert.equal(r.learningStatus, "in_progress");
  assert.equal(r.learningStatusLabel, "قيد التعلم");
  assert.equal(r.completionDurationSeconds, null);
  assert.equal(r.canShowCompletionDuration, false);
});

test("deriveAssignmentLearning — all videos done, exam pending", () => {
  const r = deriveAssignmentLearning({
    completedLessons: 93,
    totalLessons: 93,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-10T16:00:00.000Z",
    isTestingEnabled: true,
    courseCompletedAt: null,
  });
  assert.equal(r.learningStatus, "waiting_exam");
  assert.equal(r.learningStatusLabel, "بانتظار إتمام الاختبار النهائي");
  assert.equal(r.completionDurationSeconds, null);
  assert.equal(r.canShowCompletionDuration, false);
});

test("deriveAssignmentLearning — completed without exam", () => {
  const r = deriveAssignmentLearning({
    completedLessons: 10,
    totalLessons: 10,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-10T16:00:00.000Z",
    courseCompletedAt: "2026-06-10T16:30:00.000Z",
    isTestingEnabled: false,
  });
  assert.equal(r.learningStatus, "completed");
  assert.equal(r.canShowCompletionDuration, true);
  assert.equal(r.completionDurationSeconds, 9 * 86400 + 6 * 3600 + 30 * 60);
});

test("deriveAssignmentLearning — completed with exam", () => {
  const r = deriveAssignmentLearning({
    completedLessons: 93,
    totalLessons: 93,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-10T16:00:00.000Z",
    courseCompletedAt: "2026-06-11T09:00:00.000Z",
    isTestingEnabled: true,
    auditSubmittedAt: "2026-06-11T09:00:00.000Z",
    examFinalGrade: 88,
  });
  assert.equal(r.learningStatus, "completed_with_exam");
  assert.equal(r.learningStatusLabel, "مكتمل مع الاختبار");
  assert.equal(r.canShowCompletionDuration, true);
  assert.ok(r.completionDurationSeconds > 0);
});

test("deriveAssignmentLearning — sub-minute completion only when course completed", () => {
  const ts = "2026-06-04T11:15:00.000Z";
  const r = deriveAssignmentLearning({
    completedLessons: 5,
    totalLessons: 5,
    firstLessonCompletedAt: ts,
    lastLessonCompletedAt: ts,
    courseCompletedAt: ts,
    isTestingEnabled: false,
  });
  assert.equal(r.learningStatus, "completed");
  assert.equal(r.canShowCompletionDuration, true);
  assert.equal(r.completionDurationSeconds, 0);
});

test("deriveAssignmentLearning — bulk lesson timestamps without course completion show no duration", () => {
  const ts = "2026-06-04T11:15:00.000Z";
  const r = deriveAssignmentLearning({
    completedLessons: 5,
    totalLessons: 5,
    firstLessonCompletedAt: ts,
    lastLessonCompletedAt: ts,
    isTestingEnabled: true,
    courseCompletedAt: null,
  });
  assert.equal(r.learningStatus, "waiting_exam");
  assert.equal(r.completionDurationSeconds, null);
});
