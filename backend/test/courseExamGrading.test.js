const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateAndComputeExamMarks,
  normalizeQuestionCount,
  normalizeExamQuestionsPayload,
  resolveExamQuestionsForCourse,
} = require("../src/utils/courseExamGrading");

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

test("validateAndComputeExamMarks uses weighted max marks", () => {
  const questions = [
    { number: 1, text: "Q1", maxMark: 10 },
    { number: 2, text: "Q2", maxMark: 20 },
  ];
  const result = validateAndComputeExamMarks([8, 10], 2, questions);
  assert.equal(result.ok, true);
  assert.equal(result.finalGrade, 60);
});

test("resolveExamQuestionsForCourse falls back to question count", () => {
  const rows = resolveExamQuestionsForCourse({ test_question_count: 2, exam_questions: null });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].maxMark, 100);
});

test("normalizeExamQuestionsPayload rejects max marks sum not 100", () => {
  assert.throws(
    () =>
      normalizeExamQuestionsPayload([
        { number: 1, maxMark: 30 },
        { number: 2, maxMark: 30 },
      ]),
    (err) => err.statusCode === 400 && /يساوي 100/.test(err.message),
  );
});

test("normalizeExamQuestionsPayload accepts valid max marks sum", () => {
  const result = normalizeExamQuestionsPayload([
    { number: 1, maxMark: 30 },
    { number: 2, maxMark: 20 },
    { number: 3, maxMark: 25 },
    { number: 4, maxMark: 25 },
  ]);
  assert.equal(result.length, 4);
  assert.equal(result.reduce((s, q) => s + q.maxMark, 0), 100);
});
