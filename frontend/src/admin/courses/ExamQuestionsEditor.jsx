import { useCallback, useId, useMemo } from "react";
import {
  EXAM_MARK_OPTIONS,
  EXAM_MAX_MARKS_TOTAL,
  syncExamQuestionsToCount,
  validateExamQuestionsMaxMarksTotal,
} from "../../utils/courseExamQuestions";
import "../../i18n/coursesResources";
import { useTranslation } from "../../i18n/LanguageProvider";

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
  const { t } = useTranslation();
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
        <span>{t("courses.exam.questionCountLabel")}</span>
        <input
          className="oh-admin-courses__input"
          type="number"
          min={1}
          step={1}
          disabled={disabled}
          value={questionCount ?? ""}
          onChange={(e) => applyCountChange(e.target.value)}
          onWheel={preventNumberInputScroll}
          placeholder={t("courses.exam.countPlaceholder")}
        />
        <span className="oh-admin-courses__field-hint">{t("courses.exam.countHint")}</span>
      </label>

      {hasCount ? (
        <div className="oh-admin-courses__exam-question-list" aria-labelledby={listId}>
          <h4 id={listId} className="oh-admin-courses__exam-block-title">
            {t("courses.exam.questionsTitle", { count: rows.length })}
          </h4>
          {rows.map((q, idx) => (
            <div key={`exam-q-${q.number}`} className="oh-admin-courses__exam-question-row">
              <div className="oh-admin-courses__exam-question-row-head">
                <strong>{t("courses.exam.questionNumber", { num: q.number })}</strong>
              </div>
              <label className="oh-admin-courses__field">
                <span>{t("courses.exam.questionTextOptional")}</span>
                <textarea
                  className="oh-admin-courses__textarea oh-admin-courses__textarea--sm"
                  rows={2}
                  disabled={disabled}
                  value={q.text ?? ""}
                  placeholder={t("courses.exam.questionPlaceholder", { num: q.number })}
                  onChange={(e) => updateRow(idx, { text: e.target.value })}
                />
              </label>
              <label className="oh-admin-courses__field oh-admin-courses__field--inline">
                <span>{t("courses.exam.maxMark")}</span>
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
            <span>{t("courses.exam.marksTotal", { total: marksTotal })}</span>
            <span className="oh-admin-courses__exam-marks-total-target">/ {EXAM_MAX_MARKS_TOTAL}</span>
            {!marksValidation.ok ? (
              <span className="oh-admin-courses__exam-marks-total-badge">{t("courses.exam.invalid")}</span>
            ) : (
              <span className="oh-admin-courses__exam-marks-total-badge oh-admin-courses__exam-marks-total-badge--ok">
                {t("courses.exam.valid")}
              </span>
            )}
          </div>

          {!marksValidation.ok && marksValidation.messageKey ? (
            <p className="oh-admin-courses__exam-marks-error" role="alert">
              {t(marksValidation.messageKey)}
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
