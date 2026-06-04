const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveLearningTimeline } = require("../src/utils/courseLearningDuration");

test("deriveLearningTimeline — no lessons completed", () => {
  const r = deriveLearningTimeline({ completedLessons: 0, totalLessons: 10 });
  assert.equal(r.startedLearningAt, null);
  assert.equal(r.finishedLearningAt, null);
  assert.equal(r.completionDurationSeconds, null);
});

test("deriveLearningTimeline — single lesson only", () => {
  const r = deriveLearningTimeline({
    completedLessons: 1,
    totalLessons: 10,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-01T10:00:00.000Z",
  });
  assert.ok(r.startedLearningAt);
  assert.equal(r.finishedLearningAt, null);
  assert.equal(r.completionDurationSeconds, null);
});

test("deriveLearningTimeline — in progress (not all lessons)", () => {
  const r = deriveLearningTimeline({
    completedLessons: 5,
    totalLessons: 10,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-05T12:00:00.000Z",
  });
  assert.ok(r.startedLearningAt);
  assert.equal(r.finishedLearningAt, null);
  assert.equal(r.completionDurationSeconds, null);
});

test("deriveLearningTimeline — all lessons complete", () => {
  const r = deriveLearningTimeline({
    completedLessons: 10,
    totalLessons: 10,
    firstLessonCompletedAt: "2026-06-01T10:00:00.000Z",
    lastLessonCompletedAt: "2026-06-10T16:00:00.000Z",
  });
  assert.ok(r.startedLearningAt);
  assert.ok(r.finishedLearningAt);
  assert.equal(r.completionDurationSeconds, 9 * 86400 + 6 * 3600);
});

test("deriveLearningTimeline — equal first/last timestamps (bulk complete)", () => {
  const ts = "2026-06-04T11:15:00.000Z";
  const r = deriveLearningTimeline({
    completedLessons: 5,
    totalLessons: 5,
    firstLessonCompletedAt: ts,
    lastLessonCompletedAt: ts,
  });
  assert.ok(r.startedLearningAt);
  assert.ok(r.finishedLearningAt);
  assert.equal(r.completionDurationSeconds, 0);
});
