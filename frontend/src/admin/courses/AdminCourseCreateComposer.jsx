import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardFormCard from "../../components/dashboard/DashboardFormCard";
import CourseFileUploadField from "./CourseFileUploadField";
import CourseCurrentLinkCard from "./CourseCurrentLinkCard";
import CourseUrlField from "./CourseUrlField";
import { analyzeYoutubeSourceUrl, isHttpUrl } from "./youtubeSourceUtils";
import "./adminCourseComposer.css";
import "./courseAssetFields.css";

const CREATE_STEPS = [
  { id: "import", label: "رابط يوتيوب" },
  { id: "info", label: "معلومات الدورة" },
  { id: "test", label: "اختبار (اختياري)" },
  { id: "create", label: "إنشاء الدورة" },
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
}) {
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
        sourceLabel: editMeta.youtubeSourceUrl ? "يوتيوب" : null,
        lessonCount: lessons != null ? String(lessons) : null,
        videoCount: lessons != null ? String(lessons) : null,
        duration: null,
      };
    }
    if (!analysis?.ok) return null;
    return {
      sourceLabel: analysis.sourceLabel,
      lessonCount:
        analysis.expectedLessonCount != null ? String(analysis.expectedLessonCount) : null,
      videoCount:
        analysis.expectedLessonCount != null ? String(analysis.expectedLessonCount) : null,
      duration: null,
    };
  }, [analysis, editMeta, isEdit]);

  const showSummary =
    (isEdit && summaryStats && (summaryStats.lessonCount || summaryStats.sourceLabel)) ||
    (!isEdit && analysis?.ok);

  const previewTitle = String(form.title || "").trim() || "عنوان الدورة";
  const previewDesc =
    String(form.description || "").trim() ||
    "سيظهر وصف الدورة هنا كما يراه الطلاب في بطاقة الدورة.";
  const coverUrl = String(form.coverImage || "").trim();
  const [coverBroken, setCoverBroken] = useState(false);

  useEffect(() => {
    setCoverBroken(false);
  }, [coverUrl]);

  return (
    <form className="oh-admin-courses__composer oh-admin-courses__composer--in-modal" onSubmit={onSubmit} noValidate={false}>
      <div className="oh-admin-courses__composer-scroll">
      {!isEdit ? (
        <div className="oh-admin-courses__composer-steps" aria-label="مراحل إنشاء الدورة">
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
                {step.label}
              </span>
            );
          })}
        </div>
      ) : null}

      {!isEdit ? (
        <section className="oh-admin-courses__composer-hero" aria-labelledby="course-import-hero-title">
          <h2 id="course-import-hero-title" className="oh-admin-courses__composer-hero-title">
            استيراد دورة من يوتيوب
          </h2>
          <p className="oh-admin-courses__composer-hero-desc">
            أدخل رابط قائمة التشغيل، وسنجهّز الدروس تلقائياً.
          </p>
          <div className="oh-admin-courses__composer-youtube-card">
            <label className="oh-admin-courses__composer-youtube-label" htmlFor="course-youtube-source">
              رابط قائمة التشغيل
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
                {analyzeBusy ? "جاري الفحص…" : "فحص الرابط"}
              </button>
              <p className="oh-admin-courses__composer-analyze-hint">
                بعد الفحص يمكنك مراجعة معلومات الدورة قبل إنشائها.
              </p>
            </div>
            {analysis?.ok ? (
              <p className="oh-admin-courses__composer-analyze-ok" role="status">
                ✓ الرابط جاهز ({analysis.sourceLabel})
              </p>
            ) : null}
            {analysis && !analysis.ok ? (
              <p className="oh-admin-courses__composer-analyze-ok" style={{ color: "#fecaca" }} role="alert">
                {analysis.error}
              </p>
            ) : null}
            {isHttpUrl(form.youtubeSourceUrl) ? (
              <CourseCurrentLinkCard
                url={form.youtubeSourceUrl}
                title="الرابط الذي أدخلته"
                className="oh-admin-courses__composer-youtube-saved"
              />
            ) : null}
          </div>
        </section>
      ) : (
        <DashboardFormCard
          title="مصدر الدورة"
          description="لاستيراد دروس جديدة استخدم تبويب «الدروس» في إدارة الدورة."
        >
          <CourseUrlField
            label="رابط يوتيوب المحفوظ"
            value={form.youtubeSourceUrl || editMeta?.youtubeSourceUrl || ""}
            readOnly
            linkTitle="مصدر الدورة (يوتيوب)"
            updatedAt={assetUpdatedAt}
          />
          <label className="oh-admin-courses__composer-edit-active">
            <input
              type="checkbox"
              checked={Boolean(form.isActive)}
              onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))}
            />
            <span>الدورة نشطة (منشورة)</span>
          </label>
        </DashboardFormCard>
      )}

      <div className="oh-admin-courses__composer-grid-2">
        <div className="oh-admin-courses__composer-surface">
          <h3 className="oh-admin-courses__composer-surface-title">معلومات الدورة</h3>
          <p className="oh-admin-courses__composer-surface-desc">عنوان الدورة ووصفها وصورة الغلاف.</p>
          <div className="oh-admin-courses__composer-fields">
            <label className="oh-admin-courses__field">
              <span>عنوان الدورة</span>
              <input
                className="oh-admin-courses__input"
                value={form.title}
                onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
                required
                minLength={2}
                placeholder="مثال: أساسيات التصميم"
              />
            </label>
            <CourseUrlField
              label="رابط صورة الغلاف (اختياري)"
              optional
              value={form.coverImage}
              onChange={(e) => setForm((s) => ({ ...s, coverImage: e.target.value }))}
              updatedAt={assetUpdatedAt}
              linkTitle="رابط الغلاف الحالي"
            />
            <label className="oh-admin-courses__field">
              <span>وصف الدورة</span>
              <span className="oh-admin-courses__field-hint">
                اكتب وصفاً قصيراً يظهر للطلاب في بطاقة الدورة (10 أحرف على الأقل).
              </span>
              <textarea
                className="oh-admin-courses__textarea oh-admin-courses__textarea--compact"
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                rows={3}
                required
              />
            </label>
          </div>
          {!isEdit ? (
            <p className="oh-admin-courses__modal-hint" style={{ marginTop: "0.65rem", marginBottom: 0 }}>
              تُحفظ الدورة كمسودة. انشرها من القائمة بعد التأكد من الدروس.
            </p>
          ) : null}
        </div>

        <div className="oh-admin-courses__composer-surface">
          <h3 className="oh-admin-courses__composer-surface-title">معاينة البطاقة</h3>
          <p className="oh-admin-courses__composer-surface-desc">هكذا ستظهر الدورة للطلاب.</p>
          <div className="oh-admin-courses__composer-preview-wrap">
            <article className="oh-admin-courses__composer-preview-card" aria-label="معاينة بطاقة الدورة">
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
                <span className="oh-admin-courses__composer-preview-badge">معاينة</span>
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
          <h3 className="oh-admin-courses__composer-surface-title">ملخص الرابط</h3>
          <p className="oh-admin-courses__composer-surface-desc">
            {isEdit ? "معلومات الدورة الحالية." : "تقدير عدد الدروس — العدد النهائي يظهر بعد إنشاء الدورة."}
          </p>
          <div className="oh-admin-courses__composer-summary-grid">
            <SummaryStat label="المصدر" value={summaryStats?.sourceLabel} />
            <SummaryStat label="عدد الدروس المتوقع" value={summaryStats?.lessonCount} />
            <SummaryStat label="عدد الفيديوهات" value={summaryStats?.videoCount} />
            <SummaryStat label="مدة الدورة" value={summaryStats?.duration} />
          </div>
        </div>
      ) : null}

      <div className="oh-admin-courses__composer-surface">
        <h3 className="oh-admin-courses__composer-surface-title">اختبار بعد الدورة</h3>
        <p className="oh-admin-courses__composer-surface-desc">
          يمكنك تفعيل اختبار يطلب من الطالب رفع إجابة أو إرسال نص بعد إنهاء الدورة.
        </p>
        <label className="oh-admin-courses__toggle">
          <input
            type="checkbox"
            checked={Boolean(form.isTestingEnabled)}
            onChange={(e) => setForm((s) => ({ ...s, isTestingEnabled: e.target.checked }))}
          />
          <span>إضافة اختبار نهائي بعد إكمال الدروس</span>
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
              <h4 className="oh-admin-courses__exam-block-title">
                <span className="oh-admin-courses__exam-block-icon" aria-hidden>
                  📄
                </span>
                ملف الاختبار النهائي
              </h4>
              <CourseFileUploadField
                label="رفع ملف من الجهاز"
                fileUrl={isEdit || !pendingCreateTestFile ? form.testFileUrl : ""}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={testFileUploading}
                pendingFile={isEdit ? pendingTestFile : createTestPending}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pickButtonLabel="رفع ملف من الجهاز"
                onFileSelected={handleTestFileSelected}
                onValidationError={onUploadError}
                courseId={editingCourseId || null}
                fileKind="test"
              />
              <p className="oh-admin-courses__exam-or">أو</p>
              <CourseUrlField
                label="إدخال رابط الملف"
                optional
                value={form.testFileUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((s) => ({ ...s, testFileUrl: next }));
                  if (!isEdit && next.trim()) onPendingCreateTestFile?.(null);
                }}
                updatedAt={assetUpdatedAt}
                linkTitle="رابط ملف الاختبار"
              />
              <p className="oh-admin-courses__exam-help">
                يمكنك رفع الملف الآن أو إضافته لاحقاً من إدارة الدورة.
              </p>
            </div>

            <div className="oh-admin-courses__exam-block">
              <h4 className="oh-admin-courses__exam-block-title">
                <span className="oh-admin-courses__exam-block-icon" aria-hidden>
                  📄
                </span>
                ملف تعليمات / Prompt التقييم
              </h4>
              <CourseFileUploadField
                label="رفع ملف من الجهاز"
                fileUrl={isEdit || !pendingCreatePromptFile ? form.testPromptFileUrl : ""}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={promptFileUploading}
                pendingFile={isEdit ? pendingPromptFile : createPromptPending}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pickButtonLabel="رفع ملف من الجهاز"
                onFileSelected={handlePromptFileSelected}
                onValidationError={onUploadError}
                courseId={editingCourseId || null}
                fileKind="prompt"
              />
              <p className="oh-admin-courses__exam-or">أو</p>
              <CourseUrlField
                label="إدخال رابط الملف"
                optional
                value={form.testPromptFileUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((s) => ({ ...s, testPromptFileUrl: next }));
                  if (!isEdit && next.trim()) onPendingCreatePromptFile?.(null);
                }}
                updatedAt={assetUpdatedAt}
                linkTitle="رابط ملف التعليمات"
              />
              <p className="oh-admin-courses__exam-help">
                يمكنك رفع ملف التعليمات الآن أو إضافته لاحقاً من إدارة الدورة.
              </p>
            </div>

            <div className="oh-admin-courses__exam-block">
              <h4 className="oh-admin-courses__exam-block-title">
                <span className="oh-admin-courses__exam-block-icon" aria-hidden>
                  📄
                </span>
                ملف الإجابة النموذجية
              </h4>
              <CourseFileUploadField
                label="رفع ملف من الجهاز"
                fileUrl={isEdit || !pendingCreateModelAnswerFile ? form.testModelAnswerFileUrl : ""}
                updatedAt={assetUpdatedAt}
                disabled={creating}
                uploading={modelAnswerFileUploading}
                pendingFile={isEdit ? pendingModelAnswerFile : createModelAnswerPending}
                isEdit={isEdit}
                allowPickBeforeSave={!isEdit}
                pickButtonLabel="رفع ملف من الجهاز"
                onFileSelected={handleModelAnswerFileSelected}
                onValidationError={onUploadError}
                courseId={editingCourseId || null}
                fileKind="model-answer"
              />
              <p className="oh-admin-courses__exam-or">أو</p>
              <CourseUrlField
                label="إدخال رابط الملف"
                optional
                value={form.testModelAnswerFileUrl}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((s) => ({ ...s, testModelAnswerFileUrl: next }));
                  if (!isEdit && next.trim()) onPendingCreateModelAnswerFile?.(null);
                }}
                updatedAt={assetUpdatedAt}
                linkTitle="رابط ملف الإجابة النموذجية"
              />
              <p className="oh-admin-courses__exam-help">
                يُستخدم مع ملف الاختبار وملف التعليمات في ChatGPT عند تقييم إجابة المستقل.
              </p>
            </div>

            <div className="oh-admin-courses__exam-block">
              <h4 className="oh-admin-courses__exam-block-title">
                <span className="oh-admin-courses__exam-block-icon" aria-hidden>
                  ✍️
                </span>
                إعدادات التقييم
              </h4>
              <label className="oh-admin-courses__field">
                <span>عدد أسئلة الاختبار</span>
                <input
                  className="oh-admin-courses__input"
                  type="number"
                  min={1}
                  step={1}
                  value={form.testQuestionCount ?? ""}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      testQuestionCount: e.target.value,
                    }))
                  }
                  placeholder="مثال: 5"
                />
                <span className="oh-admin-courses__field-hint">
                  يظهر للمستقل حقول «سؤال 1»، «سؤال 2»، … بعد التقييم في ChatGPT.
                </span>
              </label>
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
            title="سيتوفر قريباً"
            aria-disabled="true"
          >
            حفظ كمسودة
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={creating} onClick={onCancelEdit}>
            إلغاء التعديل
          </button>
        )}
        <button className="btn btn-primary oh-admin-courses__btn-primary" disabled={creating} type="submit">
          {creating
            ? isEdit
              ? "جاري الحفظ…"
              : "جاري إنشاء الدورة…"
            : isEdit
              ? "حفظ التعديلات"
              : "إنشاء الدورة"}
        </button>
      </div>
    </form>
  );
}
