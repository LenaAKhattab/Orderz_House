/** Server-side validation and final grade calculation for course exam marks. */

const MAX_QUESTION_COUNT = 500;
const DEFAULT_LEGACY_MAX_MARK = 100;
const EXAM_MAX_MARKS_TOTAL = 100;
const EXAM_QUESTION_MAX_MARK_MIN = 1;
const EXAM_QUESTION_MAX_MARK_MAX = 100;

function normalizeQuestionCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(n, MAX_QUESTION_COUNT);
}

function parseExamQuestionsJson(jsonValue) {
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
  const out = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const number = Number(item.number ?? item.num);
    const text = item.text != null ? String(item.text).trim() : "";
    const maxRaw = item.maxMark ?? item.max_mark;
    const maxMark = maxRaw === null || maxRaw === undefined || maxRaw === "" ? DEFAULT_LEGACY_MAX_MARK : Number(maxRaw);
    if (!Number.isInteger(number) || number < 1) continue;
    if (!Number.isFinite(maxMark) || maxMark <= 0) continue;
    out.push({
      number,
      text: text || null,
      maxMark: Math.min(maxMark, EXAM_QUESTION_MAX_MARK_MAX),
    });
  }
  out.sort((a, b) => a.number - b.number);
  const seen = new Set();
  return out.filter((q) => {
    if (seen.has(q.number)) return false;
    seen.add(q.number);
    return true;
  });
}

/**
 * Resolve question rows for a course (structured questions or legacy count-only).
 * @param {{ test_question_count?: number|null, exam_questions?: unknown }} course
 */
function resolveExamQuestionsForCourse(course) {
  const structured = parseExamQuestionsJson(course?.exam_questions);
  if (structured.length > 0) return structured;
  const count = normalizeQuestionCount(course?.test_question_count);
  if (!count) return [];
  return Array.from({ length: count }, (_, idx) => ({
    number: idx + 1,
    text: null,
    maxMark: DEFAULT_LEGACY_MAX_MARK,
  }));
}

function assertExamQuestionsMaxMarksValid(questions) {
  if (!Array.isArray(questions) || !questions.length) return;

  for (const q of questions) {
    const m = Number(q?.maxMark);
    if (!Number.isInteger(m) || m < EXAM_QUESTION_MAX_MARK_MIN || m > EXAM_QUESTION_MAX_MARK_MAX) {
      const err = new Error("العلامة القصوى لكل سؤال يجب أن تكون بين 1 و 100.");
      err.statusCode = 400;
      throw err;
    }
  }

  const sum = questions.reduce((total, q) => total + Number(q.maxMark), 0);
  if (sum !== EXAM_MAX_MARKS_TOTAL) {
    const err = new Error("مجموع العلامات القصوى لجميع الأسئلة يجب أن يساوي 100");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Normalize admin payload for storage.
 * @param {unknown} raw
 * @param {number|null|undefined} questionCount
 */
function normalizeExamQuestionsPayload(raw, questionCount = null) {
  if (raw === null) return null;
  if (raw === undefined || raw === "") {
    const count = normalizeQuestionCount(questionCount);
    return count ? null : null;
  }
  const parsed = parseExamQuestionsJson(raw);
  if (!parsed.length) return null;
  const normalized = parsed.map((q) => ({
    number: q.number,
    text: q.text,
    maxMark: q.maxMark,
  }));
  assertExamQuestionsMaxMarksValid(normalized);
  return normalized;
}

function effectiveQuestionCount(course, examQuestions = null) {
  const questions = Array.isArray(examQuestions) ? examQuestions : resolveExamQuestionsForCourse(course);
  if (questions.length > 0) return questions.length;
  return normalizeQuestionCount(course?.test_question_count) || 0;
}

/**
 * @param {unknown} rawMarks
 * @param {number} questionCount — legacy fallback when examQuestions empty
 * @param {Array<{ number: number, text?: string|null, maxMark: number }>|null|undefined} examQuestions
 */
function validateAndComputeExamMarks(rawMarks, questionCount, examQuestions = null) {
  const questions = Array.isArray(examQuestions) && examQuestions.length
    ? examQuestions
    : (() => {
        const count = normalizeQuestionCount(questionCount);
        if (!count) return [];
        return Array.from({ length: count }, (_, idx) => ({
          number: idx + 1,
          text: null,
          maxMark: DEFAULT_LEGACY_MAX_MARK,
        }));
      })();

  if (!questions.length) {
    return { ok: true, marks: [], finalGrade: null };
  }

  if (!Array.isArray(rawMarks)) {
    return { ok: false, message: "يجب إدخال درجات جميع الأسئلة.", fieldErrors: {} };
  }

  if (rawMarks.length !== questions.length) {
    return {
      ok: false,
      message: `يجب إدخال ${questions.length} درجة (واحدة لكل سؤال).`,
      fieldErrors: {},
    };
  }

  const marks = [];
  const fieldErrors = {};
  let earnedTotal = 0;
  let maxTotal = 0;

  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const key = `q${q.number}`;
    const raw = rawMarks[i];
    maxTotal += q.maxMark;

    if (raw === null || raw === undefined || raw === "") {
      fieldErrors[key] = "الدرجة مطلوبة.";
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      fieldErrors[key] = "أدخل رقماً صالحاً.";
      continue;
    }
    if (n < 0) {
      fieldErrors[key] = "لا يمكن أن تكون الدرجة سالبة.";
      continue;
    }
    if (n > q.maxMark) {
      fieldErrors[key] = `الدرجة يجب ألا تتجاوز ${q.maxMark}.`;
      continue;
    }
    const rounded = Math.round(n * 100) / 100;
    marks.push(rounded);
    earnedTotal += rounded;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: "تحقق من درجات جميع الأسئلة.", fieldErrors };
  }

  const finalGrade = maxTotal > 0 ? Math.round((earnedTotal / maxTotal) * 100) : null;

  return { ok: true, marks, finalGrade, earnedTotal, maxTotal };
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
  return parsed
    .map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? n : null;
    })
    .filter((x) => x != null);
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

function mapExamQuestionsForApi(jsonValue) {
  return parseExamQuestionsJson(jsonValue);
}

module.exports = {
  MAX_QUESTION_COUNT,
  DEFAULT_LEGACY_MAX_MARK,
  EXAM_MAX_MARKS_TOTAL,
  EXAM_QUESTION_MAX_MARK_MIN,
  EXAM_QUESTION_MAX_MARK_MAX,
  normalizeQuestionCount,
  parseExamQuestionsJson,
  resolveExamQuestionsForCourse,
  assertExamQuestionsMaxMarksValid,
  normalizeExamQuestionsPayload,
  effectiveQuestionCount,
  validateAndComputeExamMarks,
  parseStoredExamMarks,
  mapAssignmentGrading,
  mapExamQuestionsForApi,
};
