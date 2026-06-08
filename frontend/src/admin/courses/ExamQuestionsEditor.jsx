import { useCallback, useId, useMemo } from "react";
import {
  EXAM_MARK_OPTIONS,
  EXAM_MAX_MARKS_TOTAL,
  syncExamQuestionsToCount,
  validateExamQuestionsMaxMarksTotal,
} from "../../utils/courseExamQuestions";

function preventNumberInputScroll(e) {
  e.currentTarget.blur();
}

export default function ExamQuestionsEditor({
  questionCount,
  examQuestions = [],
  onQuestionCountChange,
  onExamQuestionsChange,
  disabled = false,
}) {
  const listId = useId();
  const totalId = useId();

  const count = Number(questionCount);
  const hasCount = Number.isInteger(count) && count >= 1;
  const rows = hasCount ? syncExamQuestionsToCount(examQuestions, count) : [];

  const marksValidation = useMemo(() => validateExamQuestionsMaxMarksTotal(rows), [rows]);
  const marksTotal = marksValidation.total;

  const applyCountChange = useCallback(
    (raw) => {
      const nextRaw = String(raw ?? "").trim();
      if (nextRaw === "") {
        onQuestionCountChange("");
        onExamQuestionsChange([]);
        return;
      }
      const next = Number(nextRaw);
      if (!Number.isInteger(next) || next < 1) return;
      onQuestionCountChange(next);
      onExamQuestionsChange(syncExamQuestionsToCount(examQuestions, next));
    },
    [examQuestions, onExamQuestionsChange, onQuestionCountChange],
  );

  const updateRow = (index, patch) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onExamQuestionsChange(next);
  };

  return (
    <div className="oh-admin-courses__exam-questions">
      <label className="oh-admin-courses__field">
        <span>عدد أسئلة الاختبار</span>
        <input
          className="oh-admin-courses__input"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={questionCount ?? ""}
          onChange={(e) => applyCountChange(e.target.value)}
          onWheel={preventNumberInputScroll}
          placeholder="مثال: 5"
        />
        <span className="oh-admin-courses__field-hint">
          أدخل العدد يدوياً. تبدأ العلامة القصوى لكل سؤال من 0 حتى تُوزَّع بمجموع 100.
        </span>
      </label>

      {hasCount ? (
        <div className="oh-admin-courses__exam-question-list" aria-labelledby={listId}>
          <h4 id={listId} className="oh-admin-courses__exam-block-title">
            أسئلة الاختبار ({rows.length})
          </h4>
          {rows.map((q, idx) => (
            <div key={`exam-q-${q.number}`} className="oh-admin-courses__exam-question-row">
              <div className="oh-admin-courses__exam-question-row-head">
                <strong>رقم السؤال {q.number}</strong>
              </div>
              <label className="oh-admin-courses__field">
                <span>نص السؤال (اختياري)</span>
                <textarea
                  className="oh-admin-courses__textarea oh-admin-courses__textarea--sm"
                  rows={2}
                  disabled={disabled}
                  value={q.text ?? ""}
                  placeholder={`مثال: اشرح مفهوم ... (السؤال ${q.number})`}
                  onChange={(e) => updateRow(idx, { text: e.target.value })}
                />
              </label>
              <label className="oh-admin-courses__field oh-admin-courses__field--inline">
                <span>العلامة القصوى</span>
                <select
                  className="oh-admin-courses__input oh-admin-courses__input--narrow oh-admin-courses__select"
                  disabled={disabled}
                  value={String(q.maxMark ?? 0)}
                  onChange={(e) => updateRow(idx, { maxMark: Number(e.target.value) })}
                >
                  {EXAM_MARK_OPTIONS.map((mark) => (
                    <option key={`mark-${q.number}-${mark}`} value={mark}>
                      {mark}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}

          <div
            id={totalId}
            className={`oh-admin-courses__exam-marks-total${marksValidation.ok ? " oh-admin-courses__exam-marks-total--ok" : " oh-admin-courses__exam-marks-total--bad"}`}
            role="status"
            aria-live="polite"
          >
            <span>مجموع العلامات القصوى: {marksTotal}</span>
            <span className="oh-admin-courses__exam-marks-total-target">/ {EXAM_MAX_MARKS_TOTAL}</span>
            {!marksValidation.ok ? (
              <span className="oh-admin-courses__exam-marks-total-badge">غير صالح</span>
            ) : (
              <span className="oh-admin-courses__exam-marks-total-badge oh-admin-courses__exam-marks-total-badge--ok">
                صالح
              </span>
            )}
          </div>

          {!marksValidation.ok && marksValidation.message ? (
            <p className="oh-admin-courses__exam-marks-error" role="alert">
              {marksValidation.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function isExamQuestionsEditorValid(questionCount, examQuestions) {
  const count = Number(questionCount);
  if (!Number.isInteger(count) || count < 1) return true;
  const rows = syncExamQuestionsToCount(examQuestions, count);
  return validateExamQuestionsMaxMarksTotal(rows).ok;
}
