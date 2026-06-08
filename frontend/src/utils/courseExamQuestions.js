/** Client helpers mirroring backend course exam question + grading rules. */

export const DEFAULT_LEGACY_MAX_MARK = 100;
export const EXAM_MAX_MARKS_TOTAL = 100;
export const EXAM_QUESTION_MAX_MARK_MIN = 0;
export const EXAM_QUESTION_MAX_MARK_MAX = 100;
export const EXAM_QUESTION_MAX_MARK_SAVE_MIN = 1;
export const EXAM_MARK_OPTIONS = Array.from({ length: EXAM_QUESTION_MAX_MARK_MAX + 1 }, (_, i) => i);

export function distributeDefaultMaxMarks(count) {
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1) return [];
  return Array.from({ length: n }, () => 0);
}

export function sumExamQuestionMaxMarks(questions) {
  return (Array.isArray(questions) ? questions : []).reduce(
    (total, q) => total + (Number(q?.maxMark) || 0),
    0,
  );
}

export function validateExamQuestionsMaxMarksTotal(questions) {
  const rows = Array.isArray(questions) ? questions : [];
  if (!rows.length) return { ok: true, total: 0, message: null };

  const total = sumExamQuestionMaxMarks(rows);
  for (const q of rows) {
    const m = Number(q?.maxMark);
    if (!Number.isInteger(m) || m < EXAM_QUESTION_MAX_MARK_SAVE_MIN || m > EXAM_QUESTION_MAX_MARK_MAX) {
      return {
        ok: false,
        total,
        message: "العلامة القصوى لكل سؤال يجب أن تكون بين 1 و 100.",
      };
    }
  }

  if (total !== EXAM_MAX_MARKS_TOTAL) {
    return {
      ok: false,
      total,
      message: "يجب أن يكون مجموع العلامات القصوى لجميع الأسئلة مساوياً لـ 100",
    };
  }

  return { ok: true, total, message: null };
}

export function parseExamQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const number = Number(item?.number);
      const text = item?.text != null ? String(item.text).trim() : "";
      const maxRaw = item?.maxMark ?? item?.max_mark;
      const maxMark =
        maxRaw === null || maxRaw === undefined || maxRaw === ""
          ? DEFAULT_LEGACY_MAX_MARK
          : Number(maxRaw);
      if (!Number.isInteger(number) || number < 1) return null;
      if (!Number.isFinite(maxMark) || maxMark <= 0) return null;
      return { number, text: text || null, maxMark };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
}

export function resolveExamQuestions(course) {
  const structured = parseExamQuestions(course?.examQuestions);
  if (structured.length > 0) return structured;
  const count = Number(course?.testQuestionCount);
  if (!Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, idx) => ({
    number: idx + 1,
    text: null,
    maxMark: DEFAULT_LEGACY_MAX_MARK,
  }));
}

export function syncExamQuestionsToCount(prevQuestions, nextCount) {
  const count = Number(nextCount);
  if (!Number.isInteger(count) || count < 1) return [];
  const prev = Array.isArray(prevQuestions) ? prevQuestions : [];
  const byNumber = new Map(prev.map((q) => [Number(q.number), q]));

  return Array.from({ length: count }, (_, idx) => {
    const number = idx + 1;
    const existing = byNumber.get(number);
    return {
      number,
      text: existing?.text ?? "",
      maxMark: existing?.maxMark ?? 0,
    };
  });
}

export function validateClientExamMarks(marks, examQuestions) {
  const qs = Array.isArray(examQuestions) ? examQuestions : [];
  if (!qs.length) {
    return { ok: true, fieldErrors: {}, previewGrade: null };
  }

  const fieldErrors = {};
  let ok = true;
  let earned = 0;
  let maxTotal = 0;

  for (let i = 0; i < qs.length; i += 1) {
    const q = qs[i];
    const key = `q${q.number}`;
    maxTotal += Number(q.maxMark) || DEFAULT_LEGACY_MAX_MARK;
    const raw = marks[i];
    if (raw === "" || raw == null) {
      fieldErrors[key] = "الدرجة مطلوبة.";
      ok = false;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      fieldErrors[key] = "أدخل رقماً صالحاً.";
      ok = false;
      continue;
    }
    if (n < 0) {
      fieldErrors[key] = "لا يمكن أن تكون الدرجة سالبة.";
      ok = false;
      continue;
    }
    if (n > q.maxMark) {
      fieldErrors[key] = `الدرجة يجب ألا تتجاوز ${q.maxMark}.`;
      ok = false;
      continue;
    }
    earned += n;
  }

  const previewGrade = ok && maxTotal > 0 ? Math.round((earned / maxTotal) * 100) : null;
  return { ok, fieldErrors, previewGrade };
}

export function emptyMarksArray(count) {
  return Array.from({ length: count }, () => "");
}
