/** Server-side validation and final grade calculation for course exam marks. */

const MAX_QUESTION_COUNT = 500;

function normalizeQuestionCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, MAX_QUESTION_COUNT);
}

/**
 * @param {unknown} rawMarks
 * @param {number} questionCount
 * @returns {{ ok: boolean, marks?: number[], finalGrade?: number, message?: string, fieldErrors?: Record<string, string> }}
 */
function validateAndComputeExamMarks(rawMarks, questionCount) {
  const count = normalizeQuestionCount(questionCount);
  if (!count) {
    return { ok: true, marks: [], finalGrade: null };
  }

  if (!Array.isArray(rawMarks)) {
    return { ok: false, message: "يجب إدخال درجات جميع الأسئلة.", fieldErrors: {} };
  }

  if (rawMarks.length !== count) {
    return {
      ok: false,
      message: `يجب إدخال ${count} درجة (واحدة لكل سؤال).`,
      fieldErrors: {},
    };
  }

  const marks = [];
  const fieldErrors = {};

  for (let i = 0; i < count; i += 1) {
    const raw = rawMarks[i];
    if (raw === null || raw === undefined || raw === "") {
      fieldErrors[`q${i + 1}`] = "الدرجة مطلوبة.";
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      fieldErrors[`q${i + 1}`] = "أدخل رقماً صالحاً.";
      continue;
    }
    if (n < 0 || n > 100) {
      fieldErrors[`q${i + 1}`] = "الدرجة بين 0 و 100.";
      continue;
    }
    marks.push(Math.round(n * 100) / 100);
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "تحقق من درجات جميع الأسئلة.", fieldErrors };
  }

  const sum = marks.reduce((acc, m) => acc + m, 0);
  const finalGrade = Math.round(sum / count);

  return { ok: true, marks, finalGrade };
}

function parseStoredExamMarks(jsonValue) {
  if (jsonValue == null) return [];
  let parsed = jsonValue;
  if (typeof jsonValue === "string") {
    try {
      parsed = JSON.parse(jsonValue);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  }).filter((x) => x != null);
}

function mapAssignmentGrading(row) {
  const marks = parseStoredExamMarks(row?.exam_question_marks);
  const finalGrade =
    row?.exam_final_grade != null && Number.isFinite(Number(row.exam_final_grade))
      ? Math.round(Number(row.exam_final_grade))
      : null;
  return {
    examQuestionMarks: marks,
    examFinalGrade: finalGrade,
  };
}

module.exports = {
  MAX_QUESTION_COUNT,
  normalizeQuestionCount,
  validateAndComputeExamMarks,
  parseStoredExamMarks,
  mapAssignmentGrading,
};
