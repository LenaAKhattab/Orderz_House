import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Lock,
  Play,
  Send,
  Sparkles,
  Star,
  Upload,
  Video,
  X,
} from "lucide-react";
import {
  downloadFreelancerCourseFile,
  freelancerGetCourseDetailsRequest,
  freelancerMarkLessonCompleteRequest,
  freelancerSubmitCourseCompletionRequest,
  openPdfPreviewTab,
  viewFreelancerCourseFile,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import CourseDetailsPageSkeleton from "../../components/dashboard/courses/CourseDetailsPageSkeleton";
import {
  getStudentCourseFileDownloadName,
  isLegacyBrokenCloudinaryPdfUrl,
  resolveStudentCourseFileDisplay,
} from "../../admin/courses/courseAssetDisplayUtils";
import "../../styles/dashboardHub.css";
import "./freelancerCourseDetails.css";

const FINAL_TEST_STEP_ID = "final-test";
const FINAL_TEST_TITLE = "الاختبار النهائي بعد الدورة";
const MAX_RESPONSE_CHARS = 15000;

function parseQuestionCount(course) {
  const n = Number(course?.testQuestionCount);
  return Number.isInteger(n) && n >= 1 ? n : 0;
}

function emptyMarksArray(count) {
  return Array.from({ length: count }, () => "");
}

function computeExamAverage(marks, questionCount) {
  const nums = marks.slice(0, questionCount).map((m) => Number(m));
  if (nums.length !== questionCount || nums.some((n) => !Number.isFinite(n))) return null;
  return Math.round(nums.reduce((acc, n) => acc + n, 0) / questionCount);
}

function validateClientExamMarks(marks, questionCount) {
  const fieldErrors = {};
  let ok = true;
  for (let i = 0; i < questionCount; i += 1) {
    const raw = marks[i];
    if (raw === "" || raw == null) {
      fieldErrors[`q${i + 1}`] = "الدرجة مطلوبة.";
      ok = false;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      fieldErrors[`q${i + 1}`] = "الدرجة بين 0 و 100.";
      ok = false;
    }
  }
  return { ok, fieldErrors, previewGrade: ok ? computeExamAverage(marks, questionCount) : null };
}

const FIXED_EXAM_INSTRUCTIONS = [
  "افتح ملف الاختبار وأجب عن الأسئلة.",
  "افتح ملف تعليمات التقييم.",
  "افتح ملف الإجابة النموذجية.",
  "أرسل إجابتك مع تعليمات التقييم والإجابة النموذجية إلى ChatGPT.",
  "بعد أن يعطيك ChatGPT علامة كل سؤال من 100، أدخل العلامات في الحقول الموجودة في المنصة.",
  "سيتم حساب النتيجة النهائية تلقائيًا.",
];

const COURSE_FILE_LEGACY_MESSAGE = "هذا الملف يحتاج إلى إعادة رفع من الإدارة.";
const COURSE_FILE_OPEN_FAILED_TOAST = "تعذر فتح الملف. يرجى إبلاغ الإدارة لإعادة رفعه.";

function toEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(videoId || ""))}?rel=0&modestbranding=1&playsinline=1`;
}

function formatLessonDuration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r > 0 ? `${h} ساعة و ${r} دقيقة` : `${h} ساعة`;
}

function formatTotalCourseDuration(lessons) {
  const totalSec = (lessons || []).reduce((sum, l) => sum + (Number(l.durationSeconds) || 0), 0);
  if (totalSec <= 0) return null;
  return formatLessonDuration(totalSec) || null;
}

function formatLastActivityLabel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} يوم`;
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

/** Presentation-only copy for the course header (does not affect progress math). */
function getHeaderCompletionPresentation({
  courseDone,
  finalTestReady,
  allLessonsComplete,
  completedLessons,
  totalLessons,
  testingEnabled,
}) {
  if (courseDone) {
    return {
      label: "تم إكمال الدورة بالكامل",
      ringCaption: "مكتمل",
      tone: "complete",
      accent: "full",
    };
  }
  if (finalTestReady || (allLessonsComplete && testingEnabled)) {
    return {
      label: "جاهز للاختبار النهائي",
      ringCaption: "جاهز",
      tone: "final-test",
      accent: "full",
    };
  }
  if (allLessonsComplete) {
    return {
      label: "تم إكمال جميع الدروس",
      ringCaption: "الدروس",
      tone: "lessons-done",
      accent: "full",
    };
  }
  const done = Number(completedLessons) || 0;
  const total = Number(totalLessons) || 0;
  return {
    label: total > 0 ? `${done} من ${total} درس مكتمل` : "لم يبدأ التقدم بعد",
    ringCaption: "التقدم",
    tone: "in-progress",
    accent: "muted",
  };
}

function CircularProgressRing({ percent, size = 92, caption = "التقدم الكلي", ariaLabel }) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const cx = size / 2;
  const label = ariaLabel || `${caption} — ${pct}%`;
  return (
    <div
      className="fcd-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="fcd-ring__track"
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className="fcd-ring__fill"
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="fcd-ring__center">
        <strong className="fcd-ring__pct">{pct}%</strong>
        <span className="fcd-ring__caption">{caption}</span>
      </div>
    </div>
  );
}

function formatUploadFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} بايت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ك.ب`;
  return `${(n / (1024 * 1024)).toFixed(1)} م.ب`;
}

function FlowStepMarker({ step, done, active, isLast }) {
  return (
    <div className="fcd-flow__rail">
      <div
        className={[
          "fcd-flow__marker",
          done ? "fcd-flow__marker--done" : "",
          active && !done ? "fcd-flow__marker--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      >
        {done ? <Check size={15} strokeWidth={2.8} /> : step}
      </div>
      {!isLast ? <div className={`fcd-flow__line${done ? " fcd-flow__line--done" : ""}`} aria-hidden /> : null}
    </div>
  );
}

function FlowStepRow({ step, stepTitle, done, active, isLast, children }) {
  return (
    <article
      className={[
        "fcd-flow__step",
        done ? "fcd-flow__step--done" : "",
        active && !done ? "fcd-flow__step--active" : "",
        isLast ? "fcd-flow__step--last" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <FlowStepMarker step={step} done={done} active={active} isLast={isLast} />
      <div className="fcd-flow__step-body">
        {stepTitle ? <h4 className="fcd-flow__step-heading">{stepTitle}</h4> : null}
        {children}
      </div>
    </article>
  );
}

function FlowPhase({ phaseNum, title, subtitle, tone = "default", children }) {
  return (
    <section className={`fcd-flow__phase fcd-flow__phase--${tone}`}>
      <header className="fcd-flow__phase-head">
        <span className="fcd-flow__phase-tag">المرحلة {phaseNum}</span>
        <div className="fcd-flow__phase-copy">
          <h3 className="fcd-flow__phase-title">{title}</h3>
          {subtitle ? <p className="fcd-flow__phase-sub">{subtitle}</p> : null}
        </div>
      </header>
      <div className="fcd-flow__phase-body">{children}</div>
    </section>
  );
}

function FlowTrackHeader({ steps }) {
  return (
    <nav className="fcd-flow__track" aria-label="مسار الخطوات 1 إلى 5">
      <ol className="fcd-flow__track-list">
        {steps.map((s, index) => (
          <li
            key={s.id}
            className={[
              "fcd-flow__track-item",
              s.done ? "fcd-flow__track-item--done" : "",
              s.active ? "fcd-flow__track-item--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="fcd-flow__track-dot" aria-hidden>
              {s.done ? <Check size={12} strokeWidth={3} /> : s.id}
            </span>
            <span className="fcd-flow__track-label">{s.label}</span>
            {index < steps.length - 1 ? (
              <span
                className={`fcd-flow__track-seg${s.done ? " fcd-flow__track-seg--done" : ""}`}
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function FinalExamFileCard({
  stepNum,
  title,
  description,
  displayTitle,
  fileUrl,
  legacy,
  fileAction,
  onView,
  onDownload,
  onCopy,
  primary = false,
  embedded = false,
  viewLabel = "عرض الملف",
  downloadLabel = "تحميل الملف",
}) {
  const friendlyTitle = displayTitle || title;
  const hasFile = Boolean(fileUrl);
  const available = hasFile && !legacy;
  const statusLabel = legacy ? "يحتاج إعادة رفع" : hasFile ? "متاح" : "غير متوفر";
  const statusClass = legacy ? "fcd-final__status--warn" : hasFile ? "fcd-final__status--ok" : "fcd-final__status--empty";

  return (
    <div
      className={[
        "fcd-final__file-card",
        primary ? "fcd-final__file-card--primary" : "fcd-final__file-card--secondary",
        available ? "fcd-final__file-card--available" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="fcd-final__file-card-top">
        {!embedded ? <span className="fcd-final__step-badge">{stepNum}</span> : null}
        <div className="fcd-final__file-card-head">
          <span className="fcd-final__file-card-icon" aria-hidden>
            <FileText size={20} strokeWidth={2} />
          </span>
          <div className="fcd-final__file-card-titles">
            <h4 className="fcd-final__file-card-title">{title}</h4>
            <p className="fcd-final__file-card-desc">{description}</p>
          </div>
        </div>
        <span className={`fcd-final__status ${statusClass}`}>{statusLabel}</span>
      </div>

      {legacy ? (
        <p className="fcd-final__legacy-warn" role="alert">
          <CircleAlert size={16} aria-hidden />
          <span>
            <span className="fcd-final__legacy-badge">يحتاج إعادة رفع الملف</span>
            {COURSE_FILE_LEGACY_MESSAGE}
          </span>
        </p>
      ) : null}

      {hasFile ? (
        <div className="fcd-final__file-meta fcd-final__file-meta--friendly">
          <span className="fcd-final__file-type-badge" aria-hidden>
            <FileText size={18} strokeWidth={2} />
            <span>PDF</span>
          </span>
          <div className="fcd-final__file-meta-copy">
            <strong className="fcd-final__file-display-title">{friendlyTitle}</strong>
          </div>
        </div>
      ) : (
        <p className="fcd-final__resource-empty">
          <CircleAlert size={16} aria-hidden />
          لم يُرفق هذا الملف من الإدارة بعد.
        </p>
      )}

      {hasFile ? (
        <div className="fcd-final__file-actions">
          <button
            type="button"
            className="fcd-final__action-btn fcd-final__action-btn--outline"
            disabled={!available || Boolean(fileAction)}
            onClick={onView}
          >
            {fileAction === "view" ? <Loader2 size={16} className="fcd-btn__spinner" aria-hidden /> : <Eye size={16} aria-hidden />}
            {viewLabel}
          </button>
          <button
            type="button"
            className="fcd-final__action-btn"
            disabled={!available || Boolean(fileAction)}
            onClick={onDownload}
          >
            {fileAction === "download" ? (
              <Loader2 size={16} className="fcd-btn__spinner" aria-hidden />
            ) : (
              <Download size={16} aria-hidden />
            )}
            {downloadLabel}
          </button>
          {onCopy ? (
            <button type="button" className="fcd-final__action-btn fcd-final__action-btn--ghost" onClick={onCopy}>
              <Copy size={16} aria-hidden />
              نسخ التعليمات
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function openExternalFileInTab(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed.startsWith("http")) return false;
  const preview = openPdfPreviewTab();
  if (preview && !preview.closed) {
    preview.location.href = trimmed;
    return true;
  }
  const w = window.open(trimmed, "_blank", "noopener,noreferrer");
  return Boolean(w);
}

function downloadExternalFile(url, fileName) {
  const trimmed = String(url || "").trim();
  if (!trimmed.startsWith("http")) return;
  const a = document.createElement("a");
  a.href = trimmed;
  a.download = String(fileName || "file").trim() || "file";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function CompletedActionButton({ label, icon: Icon, variant = "solid", loading, disabled, onClick }) {
  return (
    <button
      type="button"
      className={[
        "fcd-final__completed-btn",
        variant === "outline" ? "fcd-final__completed-btn--outline" : "",
        variant === "ghost" ? "fcd-final__completed-btn--ghost" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? <Loader2 size={16} className="fcd-btn__spinner" aria-hidden /> : Icon ? <Icon size={16} aria-hidden /> : null}
      {label}
    </button>
  );
}

function FinalTestCompletedSection({ courseId, testLink, promptFileLink, modelAnswerFileLink, assignment, course }) {
  const toast = useToast();
  const [fileAction, setFileAction] = useState({ test: null, prompt: null, modelAnswer: null, answer: null });
  const [showAnswerText, setShowAnswerText] = useState(false);

  const testLegacy = testLink ? isLegacyBrokenCloudinaryPdfUrl(testLink) : false;
  const promptLegacy = promptFileLink ? isLegacyBrokenCloudinaryPdfUrl(promptFileLink) : false;
  const modelAnswerLegacy = modelAnswerFileLink ? isLegacyBrokenCloudinaryPdfUrl(modelAnswerFileLink) : false;
  const submittedText = String(assignment?.auditResponseText || "").trim();
  const answerFileUrl = String(assignment?.auditResponseFileUrl || "").trim();
  const hasTestFile = Boolean(testLink) && !testLegacy;
  const hasPromptFile = Boolean(promptFileLink) && !promptLegacy;
  const hasModelAnswerFile = Boolean(modelAnswerFileLink) && !modelAnswerLegacy;
  const hasAnswerFile = Boolean(answerFileUrl);
  const hasAnswerText = Boolean(submittedText);

  const testDownloadName = getStudentCourseFileDownloadName("test");
  const promptDownloadName = getStudentCourseFileDownloadName("prompt");
  const modelAnswerDownloadName = getStudentCourseFileDownloadName("model-answer");

  const runCourseFile = async (kind, mode) => {
    const legacy =
      kind === "test" ? testLegacy : kind === "prompt" ? promptLegacy : modelAnswerLegacy;
    if (legacy) {
      toast.error(COURSE_FILE_LEGACY_MESSAGE);
      return;
    }
    if (fileAction[kind]) return;
    setFileAction((prev) => ({ ...prev, [kind]: mode }));
    const apiKind = kind === "modelAnswer" ? "model-answer" : kind;
    const fallbackName =
      kind === "test"
        ? testDownloadName
        : kind === "prompt"
          ? promptDownloadName
          : modelAnswerDownloadName;
    const preview = mode === "view" ? openPdfPreviewTab() : null;
    try {
      if (mode === "view") {
        await viewFreelancerCourseFile(courseId, apiKind, fallbackName, preview);
      } else {
        await downloadFreelancerCourseFile(courseId, apiKind, fallbackName);
      }
    } catch (err) {
      if (preview && !preview.closed) {
        try {
          preview.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || COURSE_FILE_OPEN_FAILED_TOAST);
    } finally {
      setFileAction((prev) => ({ ...prev, [kind]: null }));
    }
  };

  const runAnswerFile = (mode) => {
    if (!hasAnswerFile || fileAction.answer) return;
    setFileAction((prev) => ({ ...prev, answer: mode }));
    try {
      if (mode === "view") {
        if (!openExternalFileInTab(answerFileUrl)) {
          toast.error("تعذر فتح الملف. جرّب التحميل.");
        }
      } else {
        downloadExternalFile(answerFileUrl, getStudentCourseFileDownloadName("answer"));
      }
    } catch {
      toast.error(COURSE_FILE_OPEN_FAILED_TOAST);
    } finally {
      setFileAction((prev) => ({ ...prev, answer: null }));
    }
  };

  const hasAnyFileAction = hasTestFile || hasPromptFile || hasModelAnswerFile || hasAnswerFile;
  const finalGrade = assignment?.examFinalGrade;
  const examMarks = Array.isArray(assignment?.examQuestionMarks) ? assignment.examQuestionMarks : [];
  const submittedAt = assignment?.auditSubmittedAt || assignment?.completedAt || null;
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(new Date(submittedAt))
    : null;

  return (
    <div className="fcd-final fcd-final--completed">
      <header className="fcd-final__completed-hero fdash-surface-inset">
        <h2 className="fcd-final__completed-title">أحسنت! اكتملت الدورة بنجاح</h2>
        <p className="fcd-final__completed-sub">
          تم تسجيل استجابة الاختبار النهائي وإتمام الدورة. يمكنك مراجعة ملفات الاختبار والتسليم في أي وقت.
        </p>
        {finalGrade != null ? (
          <p className="fcd-final__completed-grade" role="status">
            <strong>الدرجة النهائية: {finalGrade}%</strong>
            {submittedLabel ? <span> — تاريخ التسليم: {submittedLabel}</span> : null}
          </p>
        ) : null}
      </header>

      {examMarks.length > 0 ? (
        <section className="fcd-final__completed-grades" aria-labelledby="fcd-completed-grades-title">
          <h3 id="fcd-completed-grades-title" className="fcd-final__section-title">
            درجات الأسئلة
            {parseQuestionCount(course) > 0 ? ` (${parseQuestionCount(course)} أسئلة)` : ""}
          </h3>
          <ul className="fcd-final__marks-grid fcd-final__marks-grid--readonly">
            {examMarks.map((mark, idx) => (
              <li key={`done-q-${idx}`} className="fcd-final__mark-readonly">
                <span className="fcd-final__mark-readonly-label">سؤال {idx + 1}</span>
                <strong>{mark}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasAnyFileAction ? (
        <section className="fcd-final__completed-files" aria-labelledby="fcd-completed-files-title">
          <h3 id="fcd-completed-files-title" className="fcd-final__completed-files-title">
            ملفات وتسليم الاختبار
          </h3>
          <div className="fcd-final__completed-actions">
            {hasTestFile ? (
              <CompletedActionButton
                label="تحميل ملف الاختبار"
                icon={Download}
                loading={fileAction.test === "download"}
                onClick={() => void runCourseFile("test", "download")}
              />
            ) : null}
            {hasPromptFile ? (
              <CompletedActionButton
                label="تحميل ملف التعليمات"
                icon={Download}
                loading={fileAction.prompt === "download"}
                onClick={() => void runCourseFile("prompt", "download")}
              />
            ) : null}
            {hasModelAnswerFile ? (
              <CompletedActionButton
                label="تحميل ملف الإجابة النموذجية"
                icon={Download}
                loading={fileAction.modelAnswer === "download"}
                onClick={() => void runCourseFile("modelAnswer", "download")}
              />
            ) : null}
            {hasAnswerFile ? (
              <>
                <CompletedActionButton
                  label="عرض ملف الإجابة المرفوع"
                  icon={Eye}
                  variant="outline"
                  loading={fileAction.answer === "view"}
                  onClick={() => runAnswerFile("view")}
                />
                <CompletedActionButton
                  label="تحميل ملف الإجابة المرفوع"
                  icon={Download}
                  loading={fileAction.answer === "download"}
                  onClick={() => runAnswerFile("download")}
                />
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {(hasAnswerText || hasAnswerFile) && (
        <section className="fcd-final__completed-summary" aria-labelledby="fcd-completed-summary-title">
          <h3 id="fcd-completed-summary-title" className="fcd-final__section-title">
            ملخص التسليم
          </h3>
          {hasAnswerText ? (
            <div className="fcd-final__completed-text-block">
              {!showAnswerText ? (
                <CompletedActionButton
                  label="عرض نص الإجابة"
                  icon={FileText}
                  variant="outline"
                  onClick={() => setShowAnswerText(true)}
                />
              ) : (
                <>
                  <div className="fcd-final__submitted-text">
                    <span className="fcd-final__submitted-label">نص الإجابة</span>
                    <p className="fcd-final__answer-text-body">{submittedText}</p>
                  </div>
                  <button
                    type="button"
                    className="fcd-final__completed-collapse"
                    onClick={() => setShowAnswerText(false)}
                  >
                    إخفاء النص
                  </button>
                </>
              )}
            </div>
          ) : null}
          {hasAnswerFile && !hasAnswerText ? (
            <p className="fcd-final__completed-summary-note" role="status">
              تم إرسال ملف الإجابة. استخدم الأزرار أعلاه لعرضه أو تحميله.
            </p>
          ) : null}
        </section>
      )}

      {testLegacy || promptLegacy || modelAnswerLegacy ? (
        <p className="fcd-final__legacy-warn" role="alert">
          <CircleAlert size={16} aria-hidden />
          <span>{COURSE_FILE_LEGACY_MESSAGE}</span>
        </p>
      ) : null}
    </div>
  );
}

function FinalTestSidebarItem({ isActive, locked, completed, ready, onSelect }) {
  const statusLabel = completed ? "مكتمل" : locked ? "أكمل جميع الدروس لفتح الاختبار النهائي" : "جاهز للتسليم";

  return (
    <li className="fcd-final-item-wrap">
      <button
        type="button"
        className={[
          "fcd-final-item",
          isActive ? "fcd-final-item--active" : "",
          locked ? "fcd-final-item--locked" : "",
          ready ? "fcd-final-item--ready" : "",
          completed ? "fcd-final-item--completed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onSelect}
        aria-disabled={locked}
      >
        <span className="fcd-final-item__glow" aria-hidden />
        <span className="fcd-final-item__icon" aria-hidden>
          {completed ? <Check size={18} strokeWidth={2.4} /> : locked ? <Lock size={17} strokeWidth={2.2} /> : <Star size={17} strokeWidth={2.2} />}
        </span>
        <span className="fcd-final-item__body">
          <span className="fcd-final-item__badge">الخطوة الأخيرة</span>
          <span className="fcd-final-item__title">{FINAL_TEST_TITLE}</span>
          <span className="fcd-final-item__status">{statusLabel}</span>
        </span>
        <span className="fcd-final-item__chev" aria-hidden>
          ‹
        </span>
      </button>
    </li>
  );
}

function FinalTestPanel({
  courseId,
  course,
  courseDone,
  allLessonsComplete,
  testLink,
  promptFileLink,
  modelAnswerFileLink,
  auditResponseText,
  setAuditResponseText,
  auditResponseFile,
  setAuditResponseFile,
  questionMarks,
  setQuestionMarks,
  markErrors,
  setMarkErrors,
  submitting,
  onSubmit,
  assignment,
  progress,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const [fileAction, setFileAction] = useState({ test: null, prompt: null, modelAnswer: null });
  const [flowTouched, setFlowTouched] = useState({ test: false, prompt: false, modelAnswer: false });
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? 0;

  if (courseDone) {
    return (
      <FinalTestCompletedSection
        courseId={courseId}
        course={course}
        testLink={testLink}
        promptFileLink={promptFileLink}
        modelAnswerFileLink={modelAnswerFileLink}
        assignment={assignment}
      />
    );
  }

  if (!allLessonsComplete) {
    return (
      <div className="fcd-final">
        <div className="fcd-final__hero fcd-final__hero--locked">
          <div className="fcd-final__hero-inner fcd-final__hero-inner--center">
            <div className="fcd-final__lock-hero" aria-hidden>
              🔒
            </div>
            <h2 className="fcd-final__hero-title">الاختبار النهائي مقفول</h2>
            <p className="fcd-final__hero-sub">
              أكمل جميع دروس الفيديو ({completedLessons}/{totalLessons}) لفتح هذه الخطوة النهائية وإتمام الدورة.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const questionCount = parseQuestionCount(course);
  const marksCheck = questionCount > 0 ? validateClientExamMarks(questionMarks, questionCount) : { ok: true, fieldErrors: {}, previewGrade: null };
  const hasTextResponse = auditResponseText.trim().length > 0;
  const hasFileResponse = auditResponseFile instanceof File;
  const hasResponse = hasTextResponse || hasFileResponse;
  const canSubmit = hasResponse && !submitting && marksCheck.ok;
  const testLegacy = testLink ? isLegacyBrokenCloudinaryPdfUrl(testLink) : false;
  const promptLegacy = promptFileLink ? isLegacyBrokenCloudinaryPdfUrl(promptFileLink) : false;
  const modelAnswerLegacy = modelAnswerFileLink ? isLegacyBrokenCloudinaryPdfUrl(modelAnswerFileLink) : false;
  const testFileDisplay = resolveStudentCourseFileDisplay({ url: testLink, fileKind: "test" });
  const promptFileDisplay = resolveStudentCourseFileDisplay({ url: promptFileLink, fileKind: "prompt" });
  const modelAnswerFileDisplay = resolveStudentCourseFileDisplay({
    url: modelAnswerFileLink,
    fileKind: "model-answer",
  });
  const testDownloadName = testLink ? getStudentCourseFileDownloadName("test") : undefined;
  const promptDownloadName = promptFileLink ? getStudentCourseFileDownloadName("prompt") : undefined;
  const modelAnswerDownloadName = modelAnswerFileLink
    ? getStudentCourseFileDownloadName("model-answer")
    : undefined;
  const charCount = auditResponseText.length;
  const uploadSizeLabel = auditResponseFile ? formatUploadFileSize(auditResponseFile.size) : null;

  const clearAuditFile = () => {
    setAuditResponseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runCourseFileAction = async (kind, mode, previewWindow = null) => {
    const legacy =
      kind === "test" ? testLegacy : kind === "prompt" ? promptLegacy : modelAnswerLegacy;
    if (legacy) {
      toast.error(COURSE_FILE_LEGACY_MESSAGE);
      return;
    }
    if (fileAction[kind]) return;
    setFileAction((prev) => ({ ...prev, [kind]: mode }));
    const apiKind = kind === "modelAnswer" ? "model-answer" : kind;
    const fallbackName =
      kind === "test"
        ? testDownloadName
        : kind === "prompt"
          ? promptDownloadName
          : modelAnswerDownloadName;
    try {
      if (mode === "view") {
        await viewFreelancerCourseFile(courseId, apiKind, fallbackName, previewWindow);
      } else {
        await downloadFreelancerCourseFile(courseId, apiKind, fallbackName);
      }
      setFlowTouched((prev) => ({
        ...prev,
        ...(kind === "test"
          ? { test: true }
          : kind === "prompt"
            ? { prompt: true }
            : { modelAnswer: true }),
      }));
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || COURSE_FILE_OPEN_FAILED_TOAST);
    } finally {
      setFileAction((prev) => ({ ...prev, [kind]: null }));
    }
  };

  const step1Done = flowTouched.test;
  const step2Done = flowTouched.prompt;
  const step3Done = flowTouched.modelAnswer;
  const step4Done = step1Done && step2Done && step3Done;
  const step5Done = hasResponse;
  const activeStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : !step5Done ? 5 : 6;

  const trackSteps = [
    { id: 1, label: "الاختبار", done: step1Done, active: activeStep === 1 },
    { id: 2, label: "التعليمات", done: step2Done, active: activeStep === 2 },
    { id: 3, label: "النموذج", done: step3Done, active: activeStep === 3 },
    { id: 4, label: "ChatGPT", done: step4Done, active: activeStep === 4 },
    { id: 5, label: "التسليم", done: step5Done, active: activeStep === 5 },
    { id: 6, label: "الإتمام", done: false, active: activeStep === 6 },
  ];

  const phase1Done = step4Done;

  return (
    <div className="fcd-final fcd-final--flow">
      <div className="fcd-final__congrats fdash-surface-inset" role="status">
        <Sparkles size={20} className="fcd-final__congrats-icon" aria-hidden />
        <p>
          <strong>🎉 مبروك! أنهيت جميع الدروس.</strong> تبقى فقط إرسال الاختبار النهائي لإتمام الدورة.
          <span className="fcd-final__congrats-meta">
            ({completedLessons}/{totalLessons} درس مكتمل)
          </span>
        </p>
      </div>

      <header className="fcd-final__intro">
        <span className="fcd-final__intro-kicker">الخطوة الأخيرة</span>
        <h2 className="fcd-final__intro-title">{FINAL_TEST_TITLE}</h2>
        <p className="fcd-final__intro-lead">
          اتبع الخطوات بالترتيب: حمّل ملفات الاختبار والتعليمات والإجابة النموذجية، استخدمها في ChatGPT، أدخل
          درجات كل سؤال، ثم سلّم إجابتك لإتمام الدورة.
        </p>
      </header>

      <section className="fcd-final__exam-brief fdash-surface-inset" aria-labelledby="fcd-exam-brief-title">
        <h3 id="fcd-exam-brief-title" className="fcd-final__section-title">
          تعليمات الاختبار
        </h3>
        {questionCount > 0 ? (
          <p className="fcd-final__exam-meta">
            عدد الأسئلة: <strong>{questionCount}</strong>
          </p>
        ) : null}
        <ol className="fcd-final__exam-instructions-list">
          {FIXED_EXAM_INSTRUCTIONS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      <div className="fcd-workflow">
        <FlowTrackHeader steps={trackSteps} />

        <FlowPhase
          phaseNum={1}
          title="التحضير"
          subtitle="حمّل ملف الاختبار وملف التعليمات وملف الإجابة النموذجية قبل البدء في ChatGPT"
          tone={phase1Done ? "done" : "prep"}
        >
          <FlowStepRow
            step={1}
            stepTitle="تحميل ملف الاختبار"
            done={step1Done}
            active={activeStep === 1}
            isLast={false}
          >
            <FinalExamFileCard
              embedded
              stepNum={1}
              primary
              title="ملف الاختبار"
              description="حمّل الملف واستخدمه مع عملك داخل ChatGPT."
              displayTitle={testFileDisplay.title}
              fileUrl={testLink}
              legacy={testLegacy}
              fileAction={fileAction.test}
              onView={() => {
                const preview = openPdfPreviewTab();
                void runCourseFileAction("test", "view", preview);
              }}
              onDownload={() => void runCourseFileAction("test", "download")}
            />
          </FlowStepRow>

          <FlowStepRow
            step={2}
            stepTitle="فتح ملف التعليمات"
            done={step2Done}
            active={activeStep === 2}
            isLast={false}
          >
            <FinalExamFileCard
              embedded
              stepNum={2}
              title="ملف تعليمات / Prompt التقييم"
              description="افتح ملف التعليمات لاستخدامه مع ChatGPT."
              displayTitle={promptFileDisplay.title}
              fileUrl={promptFileLink}
              legacy={promptLegacy}
              fileAction={fileAction.prompt}
              viewLabel="فتح ملف التعليمات"
              downloadLabel="تنزيل الملف"
              onView={() => {
                const preview = openPdfPreviewTab();
                void runCourseFileAction("prompt", "view", preview);
              }}
              onDownload={() => void runCourseFileAction("prompt", "download")}
            />
          </FlowStepRow>

          <FlowStepRow
            step={3}
            stepTitle="فتح ملف الإجابة النموذجية"
            done={step3Done}
            active={activeStep === 3}
            isLast={false}
          >
            <FinalExamFileCard
              embedded
              stepNum={3}
              title="ملف الإجابة النموذجية"
              description="افتح الملف لاستخدامه مع ChatGPT عند تقييم إجابتك."
              displayTitle={modelAnswerFileDisplay.title}
              fileUrl={modelAnswerFileLink}
              legacy={modelAnswerLegacy}
              fileAction={fileAction.modelAnswer}
              viewLabel="فتح ملف الإجابة النموذجية"
              downloadLabel="تنزيل الملف"
              onView={() => {
                const preview = openPdfPreviewTab();
                void runCourseFileAction("modelAnswer", "view", preview);
              }}
              onDownload={() => void runCourseFileAction("modelAnswer", "download")}
            />
          </FlowStepRow>

          <FlowStepRow
            step={4}
            stepTitle="استخدام ChatGPT"
            done={step4Done}
            active={activeStep === 4}
            isLast
          >
            <p className="fcd-flow__step-note">
              نفّذ الخطوات في قسم «تعليمات الاختبار» أعلاه باستخدام الملفات الثلاثة، ثم انتقل للتسليم أدناه.
            </p>
          </FlowStepRow>
        </FlowPhase>

        <div className="fcd-flow__bridge fcd-flow__bridge--submit" aria-hidden>
          <span className="fcd-flow__bridge-line" />
        </div>

        <FlowPhase
          phaseNum={2}
          title="التسليم"
          subtitle="اختر طريقة التسليم ثم أرسل إجابتك لإتمام الدورة"
          tone="submit"
        >
          <form className="fcd-flow__destination" onSubmit={onSubmit}>
            <FlowStepRow
              step={5}
              stepTitle="رفع الإجابة أو لصق النص"
              done={step5Done}
              active={activeStep === 5 && !step5Done}
              isLast={false}
            >
              <div className="fcd-final__delivery" aria-label="اختر طريقة التسليم">
                <p className="fcd-final__delivery-heading">اختر طريقة التسليم</p>
                <div className="fcd-final__delivery-options">
                  <span className={`fcd-final__delivery-chip ${hasFileResponse ? "fcd-final__delivery-chip--on" : ""}`}>
                    <Upload size={15} aria-hidden />
                    رفع ملف (PDF / Word / نص / صورة)
                  </span>
                  <span className="fcd-final__delivery-or">أو</span>
                  <span className={`fcd-final__delivery-chip ${hasTextResponse ? "fcd-final__delivery-chip--on" : ""}`}>
                    <FileText size={15} aria-hidden />
                    لصق نص الاستجابة
                  </span>
                </div>
              </div>

              <div className="fcd-final__submit-split">
                <div className={`fcd-final__upload-zone ${hasFileResponse ? "fcd-final__upload-zone--filled" : ""}`}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="fcd-final__upload-input"
                    accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.ppt,.pptx"
                    disabled={submitting}
                    onChange={(e) => setAuditResponseFile(e.target.files?.[0] || null)}
                  />
                  {hasFileResponse ? (
                    <div className="fcd-final__upload-selected" role="status">
                      <span className="fcd-final__upload-selected-icon" aria-hidden>
                        <CheckCircle2 size={22} />
                      </span>
                      <div className="fcd-final__upload-selected-copy">
                        <strong>{auditResponseFile.name}</strong>
                        {uploadSizeLabel ? (
                          <span className="fcd-final__upload-selected-size">{uploadSizeLabel}</span>
                        ) : null}
                        <span className="fcd-final__upload-selected-ok">تم اختيار الملف بنجاح</span>
                      </div>
                      <div className="fcd-final__upload-selected-actions">
                        <button
                          type="button"
                          className="fcd-final__upload-mini-btn"
                          disabled={submitting}
                          onClick={() => fileInputRef.current?.click()}
                        >
                          استبدال
                        </button>
                        <button
                          type="button"
                          className="fcd-final__upload-mini-btn fcd-final__upload-mini-btn--danger"
                          disabled={submitting}
                          onClick={clearAuditFile}
                          aria-label="إزالة الملف"
                        >
                          <X size={14} aria-hidden />
                          إزالة
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="fcd-final__upload-icon" aria-hidden>
                        <Upload size={22} />
                      </span>
                      <span className="fcd-final__upload-title">ارفع ملف الاستجابة من جهازك</span>
                      <span className="fcd-final__upload-hint">PDF، Word، نص، صور — حتى 5 ميجابايت</span>
                      <button
                        type="button"
                        className="fcd-final__upload-btn"
                        disabled={submitting}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        اختيار ملف
                      </button>
                    </>
                  )}
                </div>

                <label className="fcd-final__field fcd-final__field--text">
                  <span className="fcd-final__field-label">لصق نص استجابة ChatGPT</span>
                  <textarea
                    rows={7}
                    maxLength={MAX_RESPONSE_CHARS}
                    value={auditResponseText}
                    onChange={(e) => setAuditResponseText(e.target.value)}
                    disabled={submitting}
                    placeholder="الصق هنا النص الكامل أو الملخص الذي أعطاك إياه ChatGPT…"
                    className="fcd-final__textarea"
                  />
                  <span className="fcd-final__char-count" aria-live="polite">
                    {charCount.toLocaleString("ar")} / {MAX_RESPONSE_CHARS.toLocaleString("ar")}
                  </span>
                </label>
              </div>
            </FlowStepRow>

            {questionCount > 0 ? (
              <FlowStepRow
                step={6}
                stepTitle="إدخال درجات الأسئلة (من ChatGPT)"
                done={marksCheck.ok}
                active={activeStep === 5 && step5Done && !marksCheck.ok}
                isLast={false}
              >
                <p className="fcd-flow__step-note">
                  انسخ درجة كل سؤال كما أعطاك إياها ChatGPT (من 0 إلى 100). يُحسب المتوسط تلقائياً.
                </p>
                <div className="fcd-final__marks-grid">
                  {Array.from({ length: questionCount }, (_, idx) => {
                    const key = `q${idx + 1}`;
                    const err = markErrors[key];
                    return (
                      <label key={key} className={`fcd-final__mark-field${err ? " fcd-final__mark-field--error" : ""}`}>
                        <span className="fcd-final__mark-label">سؤال {idx + 1}</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className="fcd-final__mark-input"
                          value={questionMarks[idx] ?? ""}
                          disabled={submitting}
                          onChange={(e) => {
                            const next = [...questionMarks];
                            next[idx] = e.target.value;
                            setQuestionMarks(next);
                            setMarkErrors((prev) => {
                              const copy = { ...prev };
                              delete copy[key];
                              return copy;
                            });
                          }}
                          aria-invalid={Boolean(err)}
                          aria-describedby={err ? `${key}-err` : undefined}
                        />
                        {err ? (
                          <span id={`${key}-err`} className="fcd-final__mark-error" role="alert">
                            {err}
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {marksCheck.previewGrade != null ? (
                  <p className="fcd-final__grade-preview" role="status">
                    الدرجة النهائية المحسوبة: <strong>{marksCheck.previewGrade}%</strong>
                  </p>
                ) : null}
              </FlowStepRow>
            ) : null}

            <FlowStepRow
              step={questionCount > 0 ? 7 : 6}
              stepTitle="إرسال الاستجابة وإتمام الدورة"
              done={false}
              active={activeStep === 6}
              isLast
            >
              <div className="fcd-flow__finale">
                <p className="fcd-flow__finale-lead">هذه هي الخطوة الأخيرة — بعد الإرسال تُسجَّل الدورة كمكتملة.</p>
                <div className="fcd-final__submit-footer">
                  <button
                    type="submit"
                    className="fcd-final__submit fcd-final__submit--finale"
                    disabled={!canSubmit}
                    aria-busy={submitting}
                  >
                    {submitting ? (
                      <Loader2 size={20} className="fcd-btn__spinner" aria-hidden />
                    ) : (
                      <Send size={18} aria-hidden />
                    )}
                    {submitting ? "جاري الإرسال..." : "إرسال الاستجابة وإتمام الدورة"}
                  </button>
                  {!canSubmit && !submitting ? (
                    <p className="fcd-final__submit-hint" role="status">
                      {questionCount > 0 && !marksCheck.ok
                        ? "أكمل درجات جميع الأسئلة وأضف نص الاستجابة أو ارفع ملفاً."
                        : "أكمل متطلبات التسليم أولاً — أضف نص الاستجابة أو ارفع ملفاً."}
                    </p>
                  ) : (
                    <p className="fcd-final__submit-note" role="note">
                      يمكنك إرسال النص فقط، أو الملف فقط، أو كليهما معاً.
                      {questionCount > 0 ? " يجب أيضاً إدخال درجة كل سؤال." : ""}
                    </p>
                  )}
                </div>
              </div>
            </FlowStepRow>
          </form>
        </FlowPhase>
      </div>

      <aside className="fcd-final__info-banner" role="note">
        <span className="fcd-final__info-icon" aria-hidden>
          <Sparkles size={16} />
        </span>
        <p>
          {questionCount > 0 ? (
            <>
              <strong>معلومة:</strong> بعد التقييم في ChatGPT أدخل درجة كل سؤال (0–100). تُحسب الدرجة النهائية
              كمتوسط تلقائي.
            </>
          ) : (
            <>
              <strong>معلومة:</strong> هذا ليس اختباراً بدرجات، بل خطوة لتطبيق ما تعلمته. راجع إجابتك قبل الإرسال.
            </>
          )}
        </p>
      </aside>
    </div>
  );
}

export default function FreelancerCourseDetailsPage() {
  const { id } = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [markingLessonComplete, setMarkingLessonComplete] = useState(false);
  const markCompleteInFlightRef = useRef(false);
  const [data, setData] = useState(null);
  const [mainView, setMainView] = useState("lesson");
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [auditResponseText, setAuditResponseText] = useState("");
  const [auditResponseFile, setAuditResponseFile] = useState(null);
  const [questionMarks, setQuestionMarks] = useState([]);
  const [markErrors, setMarkErrors] = useState({});
  const [lessonNotes, setLessonNotes] = useState({});
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const loadDetails = useCallback(
    async ({ openFinalTest = false, silent = false, preferLessonId = null } = {}) => {
      if (!id) return null;
      if (!silent) setLoading(true);
      try {
        const res = await freelancerGetCourseDetailsRequest(id);
        const out = res?.data || null;
        setData(out);

        const testingOn = Boolean(out?.completion?.testingEnabled);

        setMainView((prev) => {
          if (openFinalTest && testingOn) return "final-test";
          if (prev === "final-test" && testingOn) return "final-test";
          return "lesson";
        });

        if (!openFinalTest) {
          setActiveLessonId((prev) => {
            if (
              preferLessonId != null &&
              out?.lessons?.some((l) => String(l.id) === String(preferLessonId))
            ) {
              return preferLessonId;
            }
            if (prev && prev !== FINAL_TEST_STEP_ID && out?.lessons?.some((l) => String(l.id) === String(prev))) {
              return prev;
            }
            if (out?.lessons?.length) {
              const firstIncomplete = out.lessons.find((l) => !l.isCompleted);
              return firstIncomplete?.id ?? out.lessons[0].id;
            }
            return null;
          });
        }

        if (out?.assignment?.auditResponseText) setAuditResponseText(out.assignment.auditResponseText);
        else setAuditResponseText("");
        const qCount = parseQuestionCount(out?.course);
        if (qCount > 0) {
          const stored = out?.assignment?.examQuestionMarks;
          if (Array.isArray(stored) && stored.length === qCount) {
            setQuestionMarks(stored.map((m) => String(m)));
          } else {
            setQuestionMarks(emptyMarksArray(qCount));
          }
        } else {
          setQuestionMarks([]);
        }
        setMarkErrors({});
        setAuditResponseFile(null);
        return out;
      } catch (err) {
        toast.error(err?.response?.data?.message || "تعذر تحميل الدورة.");
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, toast],
  );

  useEffect(() => {
    loadDetails();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessons = useMemo(() => data?.lessons || [], [data?.lessons]);
  const completion = data?.completion;
  const course = data?.course;
  const assignment = data?.assignment;
  const progress = data?.progress;

  const testingEnabled = Boolean(completion?.testingEnabled);
  const allLessonsComplete = Boolean(completion?.allLessonsComplete);
  const courseDone = Boolean(completion?.courseCompleted);

  const finalTestLocked = testingEnabled && !allLessonsComplete && !courseDone;
  const finalTestCompleted = testingEnabled && courseDone;
  const finalTestReady = testingEnabled && allLessonsComplete && !courseDone;
  const showFinalTestInSidebar = testingEnabled && lessons.length > 0;

  const activeLesson = useMemo(
    () => lessons.find((x) => String(x.id) === String(activeLessonId)) || lessons[0],
    [lessons, activeLessonId],
  );

  const activeIndex = useMemo(
    () => lessons.findIndex((x) => String(x.id) === String(activeLesson?.id)),
    [lessons, activeLesson],
  );

  const isFinalTestView = mainView === "final-test" && testingEnabled;

  const selectLesson = (lessonId) => {
    setMainView("lesson");
    setActiveLessonId(lessonId);
  };

  const selectFinalTest = () => {
    if (!testingEnabled) return;
    if (finalTestLocked) {
      toast.error("أكمل جميع دروس الفيديو أولاً لفتح الاختبار النهائي.");
      return;
    }
    setMainView("final-test");
  };

  const goPrevLesson = () => {
    if (activeIndex <= 0) return;
    selectLesson(lessons[activeIndex - 1].id);
  };

  const goNextLesson = () => {
    if (activeIndex < 0 || activeIndex >= lessons.length - 1) {
      if (finalTestReady) selectFinalTest();
      return;
    }
    selectLesson(lessons[activeIndex + 1].id);
  };

  const onComplete = async () => {
    if (!id || !activeLesson?.id || isFinalTestView) return;
    if (markCompleteInFlightRef.current || markingLessonComplete) return;

    const markedLessonId = activeLesson.id;
    const markedIdx = lessons.findIndex((l) => String(l.id) === String(markedLessonId));
    const nextLessonId =
      markedIdx >= 0 && markedIdx < lessons.length - 1 ? lessons[markedIdx + 1].id : null;

    markCompleteInFlightRef.current = true;
    setMarkingLessonComplete(true);
    toast.info("يتم حفظ تقدمك ونقلك للدرس التالي...");

    try {
      await freelancerMarkLessonCompleteRequest(id, markedLessonId);
      toast.success("تم تسجيل إكمال المشاهدة.");
      const out = await loadDetails({
        silent: true,
        preferLessonId: nextLessonId,
      });
      const testingOn = Boolean(out?.completion?.testingEnabled);
      const allDone = Boolean(out?.completion?.allLessonsComplete);
      const completed = Boolean(out?.completion?.courseCompleted);

      if (testingOn && allDone && !completed) {
        setMainView("final-test");
        toast.success("تم فتح الاختبار النهائي — أكمل التسليم الآن.");
      } else if (nextLessonId) {
        setMainView("lesson");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر حفظ التقدم، حاول مرة أخرى.");
    } finally {
      markCompleteInFlightRef.current = false;
      setMarkingLessonComplete(false);
    }
  };

  const onSubmitCompletion = async (e) => {
    e?.preventDefault?.();
    if (!id) return;

    if (!allLessonsComplete) {
      toast.error("يجب إكمال جميع دروس الفيديو قبل التسليم.");
      return;
    }

    const hasText = auditResponseText.trim().length > 0;
    const hasFile = auditResponseFile instanceof File;
    if (testingEnabled && !hasText && !hasFile) {
      toast.error("يرجى لصق استجابة ChatGPT أو رفع ملف الاستجابة.");
      return;
    }

    const qCount = parseQuestionCount(course);
    let marksPayload;
    if (testingEnabled && qCount > 0) {
      const check = validateClientExamMarks(questionMarks, qCount);
      if (!check.ok) {
        setMarkErrors(check.fieldErrors);
        toast.error("أكمل درجات جميع الأسئلة (من 0 إلى 100) قبل الإرسال.");
        return;
      }
      marksPayload = check.previewGrade != null ? questionMarks.map((m) => Number(m)) : undefined;
    }

    setSubmitting(true);
    try {
      const payload = testingEnabled
        ? {
            auditResponseText: auditResponseText.trim() || undefined,
            auditResponseFile: auditResponseFile || undefined,
            questionMarks: marksPayload,
          }
        : {};
      await freelancerSubmitCourseCompletionRequest(id, payload);
      toast.success("تم إنهاء الدورة بنجاح.");
      await loadDetails({ openFinalTest: true });
    } catch (err) {
      const fieldErrors = err?.response?.data?.fieldErrors;
      if (fieldErrors && typeof fieldErrors === "object") {
        setMarkErrors(fieldErrors);
      }
      toast.error(err?.response?.data?.message || "تعذر إنهاء الدورة.");
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = progress?.percentage ?? 0;
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? lessons.length;
  const lastActivityAt =
    assignment?.auditSubmittedAt || assignment?.completedAt || course?.updatedAt || course?.createdAt || null;
  const activeLessonDuration = formatLessonDuration(activeLesson?.durationSeconds);
  const activeNoteKey = activeLesson?.id ? String(activeLesson.id) : "";

  const totalDurationLabel = formatTotalCourseDuration(lessons) || "غير محددة";
  const lastActivityLabel = formatLastActivityLabel(lastActivityAt) || "لا يوجد";

  const lessonNavLocked = markingLessonComplete;

  const headerCompletion = useMemo(
    () =>
      getHeaderCompletionPresentation({
        courseDone,
        finalTestReady,
        allLessonsComplete,
        completedLessons,
        totalLessons,
        testingEnabled,
      }),
    [
      courseDone,
      finalTestReady,
      allLessonsComplete,
      completedLessons,
      totalLessons,
      testingEnabled,
    ],
  );

  return (
    <DashboardHubPage className="fdash-page--course-details">
      <div className="fcd-page" lang="ar">
        {loading ? <CourseDetailsPageSkeleton /> : null}

        {!loading && course ? (
          <div className="fcd-page__content fcd-page--loaded">
          <header className="fcd-header fdash-surface-3d fdash-surface-3d--soft">
            <div className="fcd-header__top">
              <span className="fcd-header__chip">دورة تدريبية</span>
              <NavLink to="/dashboard/freelancer/courses" className="fcd-header__back" dir="ltr">
                <ArrowLeft size={18} strokeWidth={2.2} aria-hidden />
                العودة إلى الدورات
              </NavLink>
            </div>

            <div className="fcd-header__main">
              <div className="fcd-header__copy">
                <h1 className="fcd-header__title">{course.title}</h1>
                {course.description ? <p className="fcd-header__desc">{course.description}</p> : null}
                <div
                  className={`fcd-header__status-rail fcd-header__status-rail--${headerCompletion.tone}`}
                  role="status"
                  aria-live="polite"
                >
                  <span className="fcd-header__status-main">
                    <Check size={15} strokeWidth={2.5} className="fcd-header__status-check" aria-hidden />
                    <span className="fcd-header__status-label">{headerCompletion.label}</span>
                  </span>
                  <span
                    className={`fcd-header__status-accent fcd-header__status-accent--${headerCompletion.accent}`}
                    aria-hidden
                  />
                </div>
              </div>
              <div
                className={`fcd-ring-wrap${courseDone ? " fcd-ring-wrap--complete" : finalTestReady ? " fcd-ring-wrap--ready" : ""}`}
              >
                <CircularProgressRing
                  percent={progressPct}
                  caption={headerCompletion.ringCaption}
                  ariaLabel={`${headerCompletion.label} — ${progressPct}%`}
                />
              </div>
            </div>

            <ul className="fcd-header__meta" aria-label="ملخص الدورة">
              <li>
                <Clock size={16} strokeWidth={2} aria-hidden />
                <span>
                  الدروس المكتملة: <strong>{completedLessons}</strong> من <strong>{totalLessons}</strong> درس
                </span>
              </li>
              <li>
                <Play size={16} strokeWidth={2} aria-hidden />
                <span>
                  المدة الإجمالية: <strong>{totalDurationLabel}</strong>
                </span>
              </li>
              <li>
                <FileText size={16} strokeWidth={2} aria-hidden />
                <span>
                  آخر نشاط: <strong>{lastActivityLabel}</strong>
                </span>
              </li>
            </ul>
          </header>

          {courseDone && !isFinalTestView ? (
            <div className="fcd-banner fcd-banner--success fdash-surface-3d fdash-surface-3d--soft" role="status">
              <span className="fcd-banner__icon" aria-hidden>
                <Check size={20} strokeWidth={2.4} />
              </span>
              <div className="fcd-banner__copy">
                <strong>تم إنهاء هذه الدورة بنجاح.</strong>
                {assignment?.completedAt ? (
                  <span className="fcd-banner__sub">تاريخ الإنهاء مسجّل في النظام.</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="fcd-layout">
            <aside className="fcd-sidebar fdash-surface-3d fdash-surface-3d--soft" aria-label="محتوى الدورة">
              <h2 className="fcd-sidebar__title">محتوى الدورة</h2>
              <ol className={`fcd-sidebar__list${sidebarExpanded ? " fcd-sidebar__list--expanded" : ""}`}>
                {lessons.map((lesson, idx) => {
                  const isActive = !isFinalTestView && String(lesson.id) === String(activeLesson?.id);
                  const duration = formatLessonDuration(lesson.durationSeconds);
                  const statusLine = lesson.isCompleted
                    ? duration
                      ? `${duration} • مكتمل`
                      : "مكتمل"
                    : isActive
                      ? duration
                        ? `${duration} • قيد المشاهدة`
                        : "قيد المشاهدة"
                      : duration || "بدون مدة";

                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        className={[
                          "fcd-sidebar__item",
                          isActive ? "fcd-sidebar__item--active" : "",
                          lesson.isCompleted ? "fcd-sidebar__item--done" : "",
                          isFinalTestView && lesson.isCompleted && !isActive ? "fcd-sidebar__item--faded" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => selectLesson(lesson.id)}
                        disabled={lessonNavLocked}
                      >
                        <span className="fcd-sidebar__num">{idx + 1}</span>
                        <span className="fcd-sidebar__body">
                          <span className="fcd-sidebar__lesson-title">{lesson.title}</span>
                          <span className="fcd-sidebar__lesson-meta">{statusLine}</span>
                        </span>
                        <span className="fcd-sidebar__status" aria-hidden>
                          {lesson.isCompleted ? (
                            <Check size={16} strokeWidth={2.5} />
                          ) : isActive ? (
                            <Circle size={16} strokeWidth={2.2} className="fcd-sidebar__status--active" />
                          ) : (
                            <Play size={15} strokeWidth={2} />
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}

                {showFinalTestInSidebar ? (
                  <FinalTestSidebarItem
                    isActive={isFinalTestView}
                    locked={finalTestLocked}
                    completed={finalTestCompleted}
                    ready={finalTestReady}
                    onSelect={selectFinalTest}
                  />
                ) : null}
              </ol>
              {lessons.length > 6 ? (
                <button
                  type="button"
                  className="fcd-sidebar__expand"
                  onClick={() => setSidebarExpanded((v) => !v)}
                  aria-expanded={sidebarExpanded}
                >
                  <span>
                    عرض جميع الدروس ({lessons.length})
                  </span>
                  <ChevronDown
                    size={18}
                    strokeWidth={2.2}
                    className={sidebarExpanded ? "fcd-sidebar__expand-icon--open" : ""}
                    aria-hidden
                  />
                </button>
              ) : null}
            </aside>

            <main className="fcd-main">
              {isFinalTestView ? (
                <div className="fcd-final-wrap fdash-surface-3d fdash-surface-3d--soft">
                  <FinalTestPanel
                    courseId={id}
                    course={course}
                    courseDone={courseDone}
                    allLessonsComplete={allLessonsComplete}
                    testLink={course?.testFileUrl}
                    promptFileLink={course?.testPromptFileUrl}
                    modelAnswerFileLink={course?.testModelAnswerFileUrl}
                    auditResponseText={auditResponseText}
                    setAuditResponseText={setAuditResponseText}
                    auditResponseFile={auditResponseFile}
                    setAuditResponseFile={setAuditResponseFile}
                    questionMarks={questionMarks}
                    setQuestionMarks={setQuestionMarks}
                    markErrors={markErrors}
                    setMarkErrors={setMarkErrors}
                    submitting={submitting}
                    onSubmit={onSubmitCompletion}
                    assignment={assignment}
                    progress={progress}
                  />
                </div>
              ) : (
                <>
                  <article className="fcd-lesson-card fdash-surface-3d fdash-surface-3d--soft">
                    {lessonNavLocked ? (
                      <div className="fcd-lesson-card__saving-banner" role="status" aria-live="polite">
                        <Loader2 size={16} className="fcd-btn__spinner" aria-hidden />
                        يتم حفظ تقدمك ونقلك للدرس التالي...
                      </div>
                    ) : null}
                    <div className="fcd-lesson-card__video">
                      {activeLesson?.youtubeVideoId ? (
                        <div className="fcd-lesson-card__player">
                          <iframe
                            title={activeLesson.title}
                            src={toEmbedUrl(activeLesson.youtubeVideoId)}
                            className="fcd-lesson-card__iframe"
                            referrerPolicy="strict-origin-when-cross-origin"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="fcd-lesson-card__no-video">
                          <Video size={32} strokeWidth={1.6} aria-hidden />
                          <p>لا يوجد فيديو متاح لهذا الدرس.</p>
                        </div>
                      )}
                    </div>

                    <div className="fcd-lesson-card__body">
                      <div className="fcd-lesson-card__head">
                        <h2 className="fcd-lesson-card__title">{activeLesson?.title || "درس بدون عنوان"}</h2>
                        {activeIndex >= 0 ? (
                          <span className="fcd-lesson-card__badge">{activeIndex + 1}</span>
                        ) : null}
                      </div>

                      <div className="fcd-lesson-card__chips">
                        <span className="fcd-lesson-card__chip">
                          <Video size={14} strokeWidth={2} aria-hidden />
                          فيديو
                        </span>
                        {activeLessonDuration ? (
                          <span className="fcd-lesson-card__chip">
                            <Clock size={14} strokeWidth={2} aria-hidden />
                            {activeLessonDuration}
                          </span>
                        ) : null}
                        <span className="fcd-lesson-card__chip">
                          الدرس {activeIndex >= 0 ? activeIndex + 1 : 0} من {lessons.length}
                        </span>
                      </div>

                      {activeLesson?.description ? (
                        <p className="fcd-lesson-card__desc">{activeLesson.description}</p>
                      ) : null}

                      {finalTestReady ? (
                        <p className="fcd-lesson-card__hint">
                          أكملت جميع الفيديوهات — <strong>الاختبار النهائي</strong> جاهز في القائمة الجانبية.
                        </p>
                      ) : null}

                      <div className="fcd-lesson-card__actions">
                        <button
                          type="button"
                          className="fcd-btn fcd-btn--ghost"
                          onClick={goPrevLesson}
                          disabled={courseDone || activeIndex <= 0 || lessonNavLocked}
                        >
                          <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
                          الدرس السابق
                        </button>
                        <button
                          type="button"
                          className={`fcd-btn fcd-btn--primary${markingLessonComplete ? " fcd-btn--loading" : ""}`}
                          onClick={() => void onComplete()}
                          disabled={courseDone || !activeLesson || lessonNavLocked || Boolean(activeLesson?.isCompleted)}
                          aria-busy={markingLessonComplete}
                        >
                          {markingLessonComplete ? (
                            <>
                              <Loader2 size={18} strokeWidth={2.4} className="fcd-btn__spinner" aria-hidden />
                              جارٍ حفظ التقدم...
                            </>
                          ) : (
                            <>
                              <Check size={18} strokeWidth={2.4} aria-hidden />
                              تعليم الدرس كمكتمل
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`fcd-btn ${finalTestReady && activeIndex >= lessons.length - 1 ? "fcd-btn--accent" : "fcd-btn--ghost"}`}
                          onClick={goNextLesson}
                          disabled={courseDone || lessonNavLocked}
                        >
                          {activeIndex >= lessons.length - 1 && finalTestReady ? "الاختبار النهائي" : "الدرس التالي"}
                          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </article>

                  <section className="fcd-summary-card fdash-surface-3d fdash-surface-3d--soft" aria-labelledby="fcd-summary-title">
                    <h3 id="fcd-summary-title" className="fcd-summary-card__title">
                      ملخص الدرس / استجابتك
                    </h3>
                    <div className="fcd-summary-card__field fdash-surface-inset">
                      <textarea
                        className="fcd-summary-card__textarea"
                        rows={5}
                        placeholder="اكتب ملخصك هنا..."
                        value={activeNoteKey ? lessonNotes[activeNoteKey] || "" : ""}
                        onChange={(e) => {
                          if (!activeNoteKey) return;
                          setLessonNotes((prev) => ({ ...prev, [activeNoteKey]: e.target.value }));
                        }}
                        aria-label="ملخص الدرس"
                      />
                      <span className="fcd-summary-card__icon" aria-hidden>
                        <FileText size={20} strokeWidth={1.9} />
                      </span>
                    </div>
                  </section>
                </>
              )}
            </main>
          </div>

          {!testingEnabled && allLessonsComplete && !courseDone ? (
            <div className="fcd-finish-card fdash-surface-3d fdash-surface-3d--soft">
              <p className="fcd-finish-card__text">
                أكملت جميع الدروس. إذا لم يُسجَّل الإنهاء تلقائياً، اضغط الزر أدناه.
              </p>
              <button
                type="button"
                className="fcd-btn fcd-btn--primary"
                disabled={submitting}
                onClick={() => void onSubmitCompletion()}
              >
                {submitting ? "جارٍ التسجيل…" : "إنهاء الدورة"}
              </button>
            </div>
          ) : null}
          </div>
        ) : null}

        {!loading && !course ? (
          <div className="fcd-empty fdash-surface-3d fdash-surface-3d--soft">
            <p>تعذر عرض الدورة. عد إلى قائمة الدورات وحاول مجدداً.</p>
            <NavLink to="/dashboard/freelancer/courses" className="fcd-btn fcd-btn--primary">
              الدورات التدريبية
            </NavLink>
          </div>
        ) : null}
      </div>
    </DashboardHubPage>
  );
}

