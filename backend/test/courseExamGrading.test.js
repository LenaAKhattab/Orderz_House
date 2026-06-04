const test = require("node:test");
const assert = require("node:assert/strict");
const { validateAndComputeExamMarks, normalizeQuestionCount } = require("../src/utils/courseExamGrading");

test("normalizeQuestionCount accepts positive integers up to cap", () => {
  assert.equal(normalizeQuestionCount(5), 5);
  assert.equal(normalizeQuestionCount("12"), 12);
  assert.equal(normalizeQuestionCount(0), null);
  assert.equal(normalizeQuestionCount(null), null);
});

test("validateAndComputeExamMarks calculates rounded average", () => {
  const result = validateAndComputeExamMarks([20, 80, 60, 100, 90], 5);
  assert.equal(result.ok, true);
  assert.deepEqual(result.marks, [20, 80, 60, 100, 90]);
  assert.equal(result.finalGrade, 70);
});

test("validateAndComputeExamMarks rejects incomplete marks", () => {
  const result = validateAndComputeExamMarks([20, "", 60], 3);
  assert.equal(result.ok, false);
  assert.ok(result.fieldErrors.q2);
});

test("validateAndComputeExamMarks rejects out of range", () => {
  const result = validateAndComputeExamMarks([101], 1);
  assert.equal(result.ok, false);
});
