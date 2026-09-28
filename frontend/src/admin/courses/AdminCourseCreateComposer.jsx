import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardFormCard from "../../components/dashboard/DashboardFormCard";
import CourseCurrentLinkCard from "./CourseCurrentLinkCard";
import CourseFileManagerSection from "./CourseFileManagerSection";
import CourseUrlField from "./CourseUrlField";
import ExamQuestionsEditor, { isExamQuestionsEditorValid } from "./ExamQuestionsEditor";
import { analyzeYoutubeSourceUrl, isHttpUrl } from "./youtubeSourceUtils";
import "../../i18n/coursesResources";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./adminCourseComposer.css";
import "./courseAssetFields.css";

const CREATE_STEPS = [
  { id: "import", labelKey: "courses.composer.stepYoutube" },
  { id: "info", labelKey: "courses.composer.stepInfo" },
  { id: "test", labelKey: "courses.composer.stepTest" },
  { id: "create", labelKey: "courses.composer.stepCreate" },
];

const COURSE_REQUIRED_TIER_OPTIONS = [
  { value: "starter", labelKey: "courses.composer.tierStarter" },
  { value: "silver", labelKey: "courses.composer.tierSilver" },
  { value: "pro", labelKey: "courses.composer.tierPro" },
  { value: "elite", labelKey: "courses.composer.tierElite" },
];

function CoursePreviewPlaceholderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" strokeLinecap="round" />
    </svg>
  );
}

function SummaryStat({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="oh-admin-courses__composer-summary-stat">
      <p className="oh-admin-courses__composer-summary-label">{label}</p>
      <p className="oh-admin-courses__composer-summary-value">{value}</p>
    </div>
  );
}

/**
 * Course create/edit workflow UI (presentation only — submit handled by parent).
 */
export default function AdminCourseCreateComposer({
  mode = "create",
  form,
  setForm,
  creating = false,
  editingCourseId = "",
  editMeta = null,
  onSubmit,
  onCancelEdit,
  onUploadCourseTestFile,
  onUploadCoursePromptFile,
  onUploadCourseModelAnswerFile,
  onUploadError,
  testFileUploading = false,
  promptFileUploading = false,
  modelAnswerFileUploading = false,
  pendingCreateTestFile = null,
  pendingCreatePromptFile = null,
  pendingCreateModelAnswerFile = null,
  onPendingCreateTestFile,
  onPendingCreatePromptFile,
  onPendingCreateModelAnswerFile,
  onRemoveCourseTestFile,
  onRemoveCoursePromptFile,
  onRemoveCourseModelAnswerFile,
  fileRemoveBusy = false,
  membershipRequiredCourseId = "",
}) {
  const { t } = useTranslation();
  const isEdit = mode === "edit" && Boolean(editingCourseId);
  const [analysis, setAnalysis] = useState(null);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [pendingTestFile, setPendingTestFile] = useState(null);
  const [pendingPromptFile, setPendingPromptFile] = useState(null);
  const [pendingModelAnswerFile, setPendingModelAnswerFile] = useState(null);
  const assetUpdatedAt = isEdit ? editMeta?.updatedAt || null : null;

  const handleTestFileSelected = useCallback(
    async (file) => {
      if (!file) return;
      if (!editingCourseId) {
        onPendingCreateTestFile?.(file);
        return;
      }
      setPendingTestFile({ name: file.name, size: file.size });
      try {
        await onUploadCourseTestFile(editingCourseId, file);
      } finally {
        setPendingTestFile(null);
      }
    },
    [editingCourseId, onUploadCourseTestFile, onPendingCreateTestFile],
  );

  const handlePromptFileSelected = useCallback(
    async (file) => {
      if (!file) return;
      if (!editingCourseId) {
        onPendingCreatePromptFile?.(file);
        return;
      }
      setPendingPromptFile({ name: file.name, size: file.size });
      try {
        await onUploadCoursePromptFile(editingCourseId, file);
      } finally {
        setPendingPromptFile(null);
      }
    },
    [editingCourseId, onUploadCoursePromptFile, onPendingCreatePromptFile],
  );

  const handleModelAnswerFileSelected = useCallback(
    async (file) => {
      if (!file) return;
      if (!editingCourseId) {
        onPendingCreateModelAnswerFile?.(file);
        return;
      }
      setPendingModelAnswerFile({ name: file.name, size: file.size });
      try {
        await onUploadCourseModelAnswerFile(editingCourseId, file);
      } finally {
        setPendingModelAnswerFile(null);
      }
    },
    [editingCourseId, onUploadCourseModelAnswerFile, onPendingCreateModelAnswerFile],
  );

  const createTestPending = useMemo(() => {
    if (!pendingCreateTestFile) return null;
    return {
      name: pendingCreateTestFile.name,
      size: pendingCreateTestFile.size,
      onClear: () => onPendingCreateTestFile?.(null),
    };
  }, [pendingCreateTestFile, onPendingCreateTestFile]);

  const createPromptPending = useMemo(() => {
    if (!pendingCreatePromptFile) return null;
    return {
      name: pendingCreatePromptFile.name,
      size: pendingCreatePromptFile.size,
      onClear: () => onPendingCreatePromptFile?.(null),
    };
  }, [pendingCreatePromptFile, onPendingCreatePromptFile]);

  const createModelAnswerPending = useMemo(() => {
    if (!pendingCreateModelAnswerFile) return null;
    return {
      name: pendingCreateModelAnswerFile.name,
      size: pendingCreateModelAnswerFile.size,
      onClear: () => onPendingCreateModelAnswerFile?.(null),
    };
  }, [pendingCreateModelAnswerFile, onPendingCreateModelAnswerFile]);

  useEffect(() => {
    if (!isEdit) {
      setAnalysis(null);
    }
  }, [isEdit, form.youtubeSourceUrl]);

  const onAnalyzeUrl = useCallback(() => {
    setAnalyzeBusy(true);
    try {
      const result = analyzeYoutubeSourceUrl(form.youtubeSourceUrl);
      setAnalysis(result);
    } finally {
      setAnalyzeBusy(false);
    }
  }, [form.youtubeSourceUrl]);

  const examQuestionsValid = useMemo(() => {
    if (!form.isTestingEnabled) return true;
    return isExamQuestionsEditorValid(form.testQuestionCount, form.examQuestions ?? []);
  }, [form.examQuestions, form.isTestingEnabled, form.testQuestionCount]);

  const stepState = useMemo(() => {
    const importDone = isEdit || Boolean(analysis?.ok);
    const infoDone = String(form.title || "").trim().length >= 2;
    const previewDone = infoDone;
    const testDone = !form.isTestingEnabled || isEdit;
    const createReady = importDone && infoDone && String(form.description || "").trim().length > 0;
    return { importDone, infoDone, previewDone, testDone, createReady };
  }, [analysis?.ok, form.description, form.isTestingEnabled, form.title, isEdit]);

  const summaryStats = useMemo(() => {
    if (isEdit && editMeta) {
      const lessons = editMeta.lessonsCount;
      return {
        sourceLabel: editMeta.youtubeSourceUrl ? t("courses.composer.sourceYoutube") : null,
        lessonCount: lessons != null ? String(lessons) : null,
        videoCount: lessons != null ? String(lessons) : null,
        duration: null,
      };
    }
    if (!analysis?.ok) return null;
    return {
      sourceLabel: analysis.sourceLabelKey ? t(analysis.sourceLabelKey) : null,
      lessonCount:
        analysis.expectedLessonCount != null ? String(analysis.expectedLessonCount) : null,
      videoCount:
        analysis.expectedLessonCount != null ? String(analysis.expectedLessonCount) : null,
      duration: null,
    };
  }, [analysis, editMeta, isEdit, t]);

  const showSummary =
    (isEdit && summaryStats && (summaryStats.lessonCount || summaryStats.sourceLabel)) ||
    (!isEdit && analysis?.ok);

  const previewTitle = String(form.title || "").trim() || t("courses.composer.defaultTitle");
  const previewDesc =
    String(form.description || "").trim() || t("courses.composer.defaultDescription");
  const coverUrl = String(form.coverImage || "").trim();
  const [coverBroken, setCoverBroken] = useState(false);
  const isMembershipTrainingCourse =
    membershipRequiredCourseId &&
    editingCourseId &&
    String(membershipRequiredCourseId) === String(editingCourseId);

  useEffect(() => {
    setCoverBroken(false);
  }, [coverUrl]);

  return (
    <form className="oh-admin-courses__composer oh-admin-courses__composer--in-modal" onSubmit={onSubmit} noValidate={false}>
      <div className="oh-admin-courses__composer-scroll">
      {!isEdit ? (
        <div className="oh-admin-courses__composer-steps" aria-label={t("courses.composer.stepsAria")}>
          {CREATE_STEPS.map((step, idx) => {
            const done =
              (step.id === "import" && stepState.importDone) ||
              (step.id === "info" && stepState.infoDone) ||
              (step.id === "test" && stepState.testDone) ||
              (step.id === "create" && stepState.createReady);
            const current =
              (step.id === "import" && !stepState.importDone) ||
              (step.id === "info" && stepState.importDone && !stepState.infoDone) ||
              (step.id === "test" && stepState.importDone && stepState.infoDone && !stepState.testDone) ||
              (step.id === "create" &&
                stepState.importDone &&
                stepState.infoDone &&
                stepState.testDone &&
                !stepState.createReady) ||
              (step.id === "create" && stepState.createReady && idx === CREATE_STEPS.length - 1);
            return (
              <span
                key={step.id}
                className={`oh-admin-courses__composer-step${done ? " oh-admin-courses__composer-step--done" : ""}${current ? " oh-admin-courses__composer-step--current" : ""}`}
              >
                <span className="oh-admin-courses__composer-step-num">{idx + 1}</span>
                {t(step.labelKey)}
              </span>
            );
          })}
        </div>
      ) : null}

      {!isEdit ? (
        <section className="oh-admin-courses__composer-hero" aria-labelledby="course-import-hero-title">
          <h2 id="course-import-hero-title" className="oh-admin-courses__composer-hero-title">
            {t("courses.composer.importHeroTitle")}
          </h2>
          <p className="oh-admin-courses__composer-hero-desc">
            {t("courses.composer.importHeroDesc")}
          </p>
          <div className="oh-admin-courses__composer-youtube-card">
            <label className="oh-admin-courses__composer-youtube-label" htmlFor="course-youtube-source">
              {t("courses.composer.playlistUrl")}
            </label>
            <input
              id="course-youtube-source"
              className="oh-admin-courses__composer-youtube-input"
              value={form.youtubeSourceUrl}
              onChange={(e) => {
                setForm((s) => ({ ...s, youtubeSourceUrl: e.target.value }));
                setAnalysis(null);
              }}
              required
              dir="ltr"
              placeholder="https://www.youtube.com/playlist?list=..."
              autoComplete="off"
            />
            <div className="oh-admin-courses__composer-youtube-actions">
              <button
                type="button"
                className="btn btn-primary oh-admin-courses__composer-analyze-btn"
                disabled={creating || analyzeBusy || !String(form.youtubeSourceUrl || "").trim()}
                onClick={onAnalyzeUrl}
              >
                {analyzeBusy ? t("courses.composer.analyzing") : t("courses.composer.analyzeUrl")}
              </button>
              <p className="oh-admin-courses__composer-analyze-hint">
                {t("courses.composer.analyzeHint")}
              </p>
            </div>
            {analysis?.ok ? (
              <p className="oh-admin-courses__composer-analyze-ok" role="status">
                {t("courses.composer.urlReady", {
                  label: analysis.sourceLabelKey ? t(analysis.sourceLabelKey) : "",
                })}
              </p>
            ) : null}
            {analysis && !analysis.ok ? (
              <p className="oh-admin-courses__composer-analyze-ok" style={{ color: "#fecaca" }} role="alert">
                {analysis.errorKey ? t(analysis.errorKey) : null}
              </p>
            ) : null}
            {isHttpUrl(form.youtubeSourceUrl) ? (
              <CourseCurrentLinkCard
                url={form.youtubeSourceUrl}
                title={t("courses.composer.enteredUrlTitle")}
                className="oh-admin-courses__composer-youtube-saved"
              />
            ) : null}
          </div>
        </section>
      ) : (
        <DashboardFormCard
          title={t("courses.composer.courseSource")}
          description={t("courses.composer.courseSourceEditDesc")}
        >
          <CourseUrlField
            label={t("courses.composer.youtubeSavedLabel")}
            value={form.youtubeSourceUrl || editMeta?.youtubeSourceUrl || ""}
            readOnly
            linkTitle={t("courses.admin.courseSourceYoutube")}
            updatedAt={assetUpdatedAt}
          />
          <label className="oh-admin-courses__composer-edit-active">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
            />
            <span>{t("courses.composer.courseActivePublished")}</span>
          </label>
        </DashboardFormCard>
      )}

      <div className="oh-admin-courses__composer-grid-2">
        <div className="oh-admin-courses__composer-surface">
          <h3 className="oh-admin-courses__composer-surface-title">{t("courses.composer.infoTitle")}</h3>
          <p className="oh-admin-courses__composer-surface-desc">{t("courses.composer.infoDesc")}</p>
          <div className="oh-admin-courses__composer-fields">
            <label className="oh-admin-courses__field">
              <span>{t("courses.composer.courseTitle")}</span>
              <input
                className="oh-admin-courses__input"
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                required
                minLength={2}
                placeholder={t("courses.composer.titlePlaceholder")}
              />
            </label>
            <CourseUrlField
              label={t("courses.composer.coverOptional")}
              optional
              value={form.coverImage}
              onChange={(e) => setForm((s) => ({ ...s, coverImage: e.target.value }))}
              updatedAt={assetUpdatedAt}
              linkTitle={t("courses.admin.coverLinkTitle")}
            />
            <label className="oh-admin-courses__field">
              <span>{t("courses.composer.courseDescription")}</span>
              <span className="oh-admin-courses__field-hint">
                {t("courses.composer.descriptionHint")}
              </span>
              <textarea
                className="oh-admin-courses__textarea oh-admin-courses__textarea--compact"
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                rows={3}
                required
              />
            </label>
            <label className="oh-admin-courses__field">
              <span>{t("courses.composer.minMembershipPlan")}</span>
              <span className="oh-admin-courses__field-hint">
                {t("courses.composer.tierHint")}
              </span>
              <select
                className="oh-admin-courses__input"
                value={form.requiredTierCode || "silver"}
                onChange={(e) => setForm((s) => ({ ...s, requiredTierCode: e.target.value }))}
              >
                {COURSE_REQUIRED_TIER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(opt.labelKey)}
                  </option>
                ))}
              </select>
              {isMembershipTrainingCourse ? (
                <span className="oh-admin-courses__field-hint" style={{ marginTop: "0.35rem" }}>
                  {t("courses.composer.membershipTrainingHint")}
                </span>
              ) : null}
            </label>
          </div>
          {!isEdit ? (
            <p className="oh-admin-courses__modal-hint" style={{ marginTop: "0.65rem", marginBottom: 0 }}>
              {t("courses.composer.draftHint")}
            </p>
          ) : null}
        </div>

        <div className="oh-admin-courses__composer-surface">
          <h3 className="oh-admin-courses__composer-surface-title">{t("courses.composer.previewTitle")}</h3>
          <p className="oh-admin-courses__composer-surface-desc">{t("courses.composer.previewDesc")}</p>
          <div className="oh-admin-courses__composer-preview-wrap">
            <article className="oh-admin-courses__composer-preview-card" aria-label={t("courses.composer.previewCardAria")}>
              <div className="oh-admin-courses__composer-preview-media">
                {coverUrl && !coverBroken ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="oh-admin-courses__composer-preview-thumb"
                    loading="lazy"
                    onError={() => setCoverBroken(true)}
                  />
                ) : (
                  <div className="oh-admin-courses__composer-preview-placeholder">
                    <CoursePreviewPlaceholderIcon />
                  </div>
                )}
                <span className="oh-admin-courses__composer-preview-badge">{t("courses.composer.previewBadge")}</span>
              </div>
              <div className="oh-admin-courses__composer-preview-body">
                <h4 className="oh-admin-courses__composer-preview-title">{previewTitle}</h4>
                <p className="oh-admin-courses__composer-preview-desc">{previewDesc}</p>
              </div>
            </article>
          </div>
        </div>
      </div>

      {showSummary ? (
        <div className="oh-admin-courses__composer-surface">
          <h3 className="oh-admin-courses__composer-surface-title">{t("courses.composer.linkSummaryTitle")}</h3>
          <p className="oh-admin-courses__composer-surface-desc">
            {isEdit ? t("courses.composer.linkSummaryEdit") : t("courses.composer.linkSummaryCreate")}
          </p>
          <div className="oh-admin-courses__composer-summary-grid">
            <SummaryStat label={t("courses.composer.statSource")} value={summaryStats?.sourceLabel} />
            <SummaryStat label={t("courses.composer.statExpectedLessons")} value={summaryStats?.lessonCount} />
            <SummaryStat label={t("courses.composer.statVideos")} value={summaryStats?.videoCount} />
            <SummaryStat label={t("courses.composer.statDuration")} value={summaryStats?.duration} />
          </div>
        </div>
      ) : null}

      <div className="oh-admin-courses__composer-surface">
        <h3 className="oh-admin-courses__composer-surface-title">{t("courses.composer.postTestTitle")}</h3>
        <p className="oh-admin-courses__composer-surface-desc">
          {t("courses.composer.postTestDesc")}
        </p>
        <label className="oh-admin-courses__toggle">
          <input
            type="checkbox"
            checked={Boolean(form.isTestingEnabled)}
            onChange={(e) => setForm((s) => ({ ...s, isTestingEnabled: e.target.checked }))}
          />
          <span>{t("courses.composer.enableFinalExam")}</span>
        </label>
        <div
          className={`oh-admin-courses__composer-test-panel${
            form.isTestingEnabled
              ? " oh-admin-courses__composer-test-panel--expanded"
              : " oh-admin-courses__composer-test-panel--collapsed"
          }`}
          aria-hidden={!form.isTestingEnabled}
        >
          <div className="oh-admin-courses__composer-test-inner">
            <div className="oh-admin-courses__exam-block">
              <CourseFileManagerSection
                label={t("courses.composer.testFileLabel")}
                description={t("courses.composer.testFileDesc")}
                value={form.testFileUrl}
                onChangeUrl={(next) => {
                  setForm((s) => ({ ...s, testFileUrl: next }));
                  if (!isEdit && String(next).trim()) onPendingCreateTestFile?.(null);
                }}
                fileKind="test"
                courseId={editingCourseId || null}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={testFileUploading}
                removing={fileRemoveBusy}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pendingFile={isEdit ? pendingTestFile : createTestPending}
                onFileSelected={handleTestFileSelected}
                onValidationError={onUploadError}
                onRemove={onRemoveCourseTestFile}
              />
            </div>

            <div className="oh-admin-courses__exam-block">
              <CourseFileManagerSection
                label={t("courses.composer.promptFileLabel")}
                description={t("courses.composer.promptFileDesc")}
                value={form.testPromptFileUrl}
                onChangeUrl={(next) => {
                  setForm((s) => ({ ...s, testPromptFileUrl: next }));
                  if (!isEdit && String(next).trim()) onPendingCreatePromptFile?.(null);
                }}
                fileKind="prompt"
                courseId={editingCourseId || null}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={promptFileUploading}
                removing={fileRemoveBusy}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pendingFile={isEdit ? pendingPromptFile : createPromptPending}
                onFileSelected={handlePromptFileSelected}
                onValidationError={onUploadError}
                onRemove={onRemoveCoursePromptFile}
              />
            </div>

            <div className="oh-admin-courses__exam-block">
              <CourseFileManagerSection
                label={t("courses.composer.modelAnswerLabel")}
                description={t("courses.composer.modelAnswerDesc")}
                value={form.testModelAnswerFileUrl}
                onChangeUrl={(next) => {
                  setForm((s) => ({ ...s, testModelAnswerFileUrl: next }));
                  if (!isEdit && String(next).trim()) onPendingCreateModelAnswerFile?.(null);
                }}
                fileKind="model-answer"
                courseId={editingCourseId || null}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={modelAnswerFileUploading}
                removing={fileRemoveBusy}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pendingFile={isEdit ? pendingModelAnswerFile : createModelAnswerPending}
                onFileSelected={handleModelAnswerFileSelected}
                onValidationError={onUploadError}
                onRemove={onRemoveCourseModelAnswerFile}
              />
            </div>

            <div className="oh-admin-courses__exam-block">
              <h4 className="oh-admin-courses__exam-block-title">
                <span className="oh-admin-courses__exam-block-icon" aria-hidden>
                  ✍️
                </span>
                {t("courses.composer.gradingSettings")}
              </h4>
              <ExamQuestionsEditor
                disabled={creating}
                questionCount={form.testQuestionCount ?? ""}
                examQuestions={form.examQuestions ?? []}
                onQuestionCountChange={(next) => setForm((s) => ({ ...s, testQuestionCount: next }))}
                onExamQuestionsChange={(next) => setForm((s) => ({ ...s, examQuestions: next }))}
              />
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="oh-admin-courses__composer-action-bar">
        {!isEdit ? (
          <button
            type="button"
            className="btn btn-secondary oh-admin-courses__composer-draft-btn"
            disabled
            title={t("courses.composer.comingSoon")}
            aria-disabled="true"
          >
            {t("courses.composer.saveDraft")}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={creating} onClick={onCancelEdit}>
            {t("courses.composer.cancelEdit")}
          </button>
        )}
        <button
          className="btn btn-primary oh-admin-courses__btn-primary"
          disabled={creating || !examQuestionsValid}
          type="submit"
        >
          {creating
            ? isEdit
              ? t("courses.composer.saving")
              : t("courses.composer.creating")
            : isEdit
              ? t("courses.composer.saveChanges")
              : t("courses.composer.createCourseBtn")}
        </button>
      </div>
    </form>
  );
}
