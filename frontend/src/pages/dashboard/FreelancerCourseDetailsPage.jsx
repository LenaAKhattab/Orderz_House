import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
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
  freelancerUploadCompletedExamFileRequest,
  openPdfPreviewTab,
  viewFreelancerCourseFile,
  viewFreelancerCompletedExamFile,
  downloadFreelancerCompletedExamFile,
} from "../../services/api";
import {
  emptyMarksArray,
  resolveExamQuestions,
  validateClientExamMarks,
} from "../../utils/courseExamQuestions";
import LinkifiedText from "../../components/ui/LinkifiedText";
import { useToast } from "../../components/ui/toastContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import CourseDetailsPageSkeleton from "../../components/dashboard/courses/CourseDetailsPageSkeleton";
import CourseSideTextAd from "../../components/dashboard/courses/CourseSideTextAd";
import {
  getStudentCourseFileDownloadName,
  isLegacyBrokenCloudinaryPdfUrl,
  resolveStudentCourseFileDisplay,
} from "../../admin/courses/courseAssetDisplayUtils";
import "../../styles/dashboardHub.css";
import "./freelancerCourseDetails.css";

const FINAL_TEST_STEP_ID = "final-test";
const MAX_RESPONSE_CHARS = 15000;
const CD = "freelancerDashboard.courseDetails";

function preventNumberInputScroll(e) {
  e.currentTarget.blur();
}

function sanitizeExamMarkInput(raw, maxMark, t) {
  const value = String(raw ?? "");
  if (value === "") return { value: "", fieldError: null };

  const max = Number(maxMark);
  const n = Number(value);
  if (!Number.isFinite(n)) return { value, fieldError: null };

  if (n < 0) return { value: "0", fieldError: t(`${CD}.examMarkNegativeError`) };
  if (Number.isFinite(max) && n > max) {
    return { value: String(max), fieldError: t(`${CD}.examMarkMaxError`) };
  }
  return { value, fieldError: null };
}

function examQuestionsForCourse(course) {
  return resolveExamQuestions(course);
}

function stepStatusLabel(status, t) {
  const map = {
    done: `${CD}.stepStatus.done`,
    available: `${CD}.stepStatus.available`,
    locked: `${CD}.stepStatus.locked`,
    waiting_upload: `${CD}.stepStatus.waitingUpload`,
    waiting_chatgpt: `${CD}.stepStatus.waitingChatgpt`,
    waiting_marks: `${CD}.stepStatus.waitingMarks`,
  };
  return t(map[status] || map.locked);
}

function chatGptDraftStorageKey(courseId, userId) {
  return `oh_course_exam_chatgpt_draft_${String(userId || "anon")}_${String(courseId)}`;
}

function readChatGptDraft(courseId, userId) {
  try {
    return localStorage.getItem(chatGptDraftStorageKey(courseId, userId)) || "";
  } catch {
    return "";
  }
}

function writeChatGptDraft(courseId, userId, text) {
  try {
    const key = chatGptDraftStorageKey(courseId, userId);
    const value = String(text || "");
    if (!value.trim()) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    /* ignore */
  }
}

function clearChatGptDraft(courseId, userId) {
  try {
    localStorage.removeItem(chatGptDraftStorageKey(courseId, userId));
  } catch {
    /* ignore */
  }
}

function resolveExamStepStatus({ done, locked, isCurrent }) {
  if (done) return "done";
  if (locked) return "locked";
  if (isCurrent) return "available";
  return "locked";
}

function toEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(videoId || ""))}?rel=0&modestbranding=1&playsinline=1`;
}

function formatLessonDuration(seconds, t) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return null;
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) {
    return t(mins === 1 ? `${CD}.duration.minute` : `${CD}.duration.minute_plural`, { count: mins });
  }
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  if (r > 0) {
    return t(`${CD}.duration.hoursAndMinutes`, { hours: h, minutes: r });
  }
  return t(h === 1 ? `${CD}.duration.hoursOnly` : `${CD}.duration.hoursOnly_plural`, { count: h });
}

function formatTotalCourseDuration(lessons, t) {
  const totalSec = (lessons || []).reduce((sum, l) => sum + (Number(l.durationSeconds) || 0), 0);
  if (totalSec <= 0) return null;
  return formatLessonDuration(totalSec, t) || null;
}

function formatLastActivityLabel(value, t, locale) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t(`${CD}.activity.now`);
  if (mins < 60) {
    return t(mins === 1 ? `${CD}.activity.minutesAgo` : `${CD}.activity.minutesAgo_plural`, { count: mins });
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return t(hours === 1 ? `${CD}.activity.hoursAgo` : `${CD}.activity.hoursAgo_plural`, { count: hours });
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return t(days === 1 ? `${CD}.activity.daysAgo` : `${CD}.activity.daysAgo_plural`, { count: days });
  }
  const tag = locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(d);
}

/** Presentation-only copy for the course header (does not affect progress math). */
function getHeaderCompletionPresentation({
  courseDone,
  finalTestReady,
  allLessonsComplete,
  completedLessons,
  totalLessons,
  testingEnabled,
  t,
}) {
  if (courseDone) {
    return {
      label: t(`${CD}.progress.fullyCompleted`),
      ringCaption: t(`${CD}.progress.completed`),
      tone: "complete",
      accent: "full",
    };
  }
  if (finalTestReady || (allLessonsComplete && testingEnabled)) {
    return {
      label: t(`${CD}.progress.readyForTest`),
      ringCaption: t(`${CD}.progress.ready`),
      tone: "final-test",
      accent: "full",
    };
  }
  if (allLessonsComplete) {
    return {
      label: t(`${CD}.progress.lessonsCompleted`),
      ringCaption: t(`${CD}.progress.lessons`),
      tone: "lessons-done",
      accent: "full",
    };
  }
  const done = Number(completedLessons) || 0;
  const total = Number(totalLessons) || 0;
  return {
    label:
      total > 0
        ? t(total === 1 ? `${CD}.progress.lessonsProgress` : `${CD}.progress.lessonsProgress_plural`, {
            done,
            total,
          })
        : t(`${CD}.progress.notStarted`),
    ringCaption: t(`${CD}.progress.ringCaption`),
    tone: "in-progress",
    accent: "muted",
  };
}

function CircularProgressRing({ percent, size = 92, caption, ariaLabel }) {
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

function formatUploadFileSize(bytes, t) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return t(`${CD}.fileSize.bytes`, { count: n });
  if (n < 1024 * 1024) return t(`${CD}.fileSize.kb`, { size: (n / 1024).toFixed(1) });
  return t(`${CD}.fileSize.mb`, { size: (n / (1024 * 1024)).toFixed(1) });
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

function FlowPhase({ phaseNum, title, subtitle, tone = "default", children, t }) {
  return (
    <section className={`fcd-flow__phase fcd-flow__phase--${tone}`}>
      <header className="fcd-flow__phase-head">
        <span className="fcd-flow__phase-tag">{t(`${CD}.flow.phaseTag`, { num: phaseNum })}</span>
        <div className="fcd-flow__phase-copy">
          <h3 className="fcd-flow__phase-title">{title}</h3>
          {subtitle ? <p className="fcd-flow__phase-sub">{subtitle}</p> : null}
        </div>
      </header>
      <div className="fcd-flow__phase-body">{children}</div>
    </section>
  );
}

function FlowTrackHeader({ steps, t }) {
  return (
    <nav className="fcd-flow__track" aria-label={t(`${CD}.flow.trackAria`)}>
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
  viewLabel,
  downloadLabel,
  t,
}) {
  const friendlyTitle = displayTitle || title;
  const hasFile = Boolean(fileUrl);
  const available = hasFile && !legacy;
  const statusLabel = legacy
    ? t(`${CD}.file.needsReuploadShort`)
    : hasFile
      ? t(`${CD}.file.available`)
      : t(`${CD}.file.unavailable`);
  const statusClass = legacy ? "fcd-final__status--warn" : hasFile ? "fcd-final__status--ok" : "fcd-final__status--empty";
  const resolvedViewLabel = viewLabel || t(`${CD}.file.viewFile`);
  const resolvedDownloadLabel = downloadLabel || t(`${CD}.file.downloadFile`);

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
            <p className="fcd-final__file-card-desc">
              <LinkifiedText text={description} />
            </p>
          </div>
        </div>
        <span className={`fcd-final__status ${statusClass}`}>{statusLabel}</span>
      </div>

      {legacy ? (
        <p className="fcd-final__legacy-warn" role="alert">
          <CircleAlert size={16} aria-hidden />
          <span>
            <span className="fcd-final__legacy-badge">{t(`${CD}.file.needsReuploadBadge`)}</span>
            {t(`${CD}.fileLegacy`)}
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
          {t(`${CD}.file.notAttachedByAdmin`)}
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
            {resolvedViewLabel}
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
            {resolvedDownloadLabel}
          </button>
          {onCopy ? (
            <button type="button" className="fcd-final__action-btn fcd-final__action-btn--ghost" onClick={onCopy}>
              <Copy size={16} aria-hidden />
              {t(`${CD}.file.copyInstructions`)}
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
  const { t, locale } = useTranslation();
  const [fileAction, setFileAction] = useState({
    test: null,
    prompt: null,
    modelAnswer: null,
    answer: null,
    completedExam: null,
  });
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
  const completedExamUrl = String(assignment?.completedExamFileUrl || "").trim();
  const hasCompletedExamFile = Boolean(completedExamUrl);
  const completedExamLabel = hasCompletedExamFile ? fileNameFromCompletedUrl(completedExamUrl) : null;

  const testDownloadName = getStudentCourseFileDownloadName("test");
  const promptDownloadName = getStudentCourseFileDownloadName("prompt");
  const modelAnswerDownloadName = getStudentCourseFileDownloadName("model-answer");
  const completedExamDownloadName = getStudentCourseFileDownloadName("completed-exam");

  const runCompletedExamFile = async (mode) => {
    if (!hasCompletedExamFile || fileAction.completedExam) return;
    setFileAction((prev) => ({ ...prev, completedExam: mode }));
    const preview = mode === "view" ? openPdfPreviewTab() : null;
    try {
      if (mode === "view") {
        await viewFreelancerCompletedExamFile(courseId, completedExamDownloadName, preview);
      } else {
        await downloadFreelancerCompletedExamFile(courseId, completedExamDownloadName);
      }
    } catch (err) {
      if (preview && !preview.closed) {
        try {
          preview.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || t(`${CD}.fileOpenFailed`));
    } finally {
      setFileAction((prev) => ({ ...prev, completedExam: null }));
    }
  };

  const runCourseFile = async (kind, mode) => {
    const legacy =
      kind === "test" ? testLegacy : kind === "prompt" ? promptLegacy : modelAnswerLegacy;
    if (legacy) {
      toast.error(t(`${CD}.fileLegacy`));
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
      toast.error(err?.message || t(`${CD}.fileOpenFailed`));
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
          toast.error(t(`${CD}.file.openFailedTryDownload`));
        }
      } else {
        downloadExternalFile(answerFileUrl, getStudentCourseFileDownloadName("answer"));
      }
    } catch {
      toast.error(t(`${CD}.file.openFailedTryDownload`));
    } finally {
      setFileAction((prev) => ({ ...prev, answer: null }));
    }
  };

  const hasAnyFileAction =
    hasTestFile || hasPromptFile || hasModelAnswerFile || hasAnswerFile || hasCompletedExamFile;
  const finalGrade = assignment?.examFinalGrade;
  const examMarks = Array.isArray(assignment?.examQuestionMarks) ? assignment.examQuestionMarks : [];
  const submittedAt = assignment?.auditSubmittedAt || assignment?.completedAt || null;
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB", { dateStyle: "medium" }).format(
        new Date(submittedAt),
      )
    : null;

  return (
    <div className="fcd-final fcd-final--completed">
      <header className="fcd-final__completed-hero fdash-surface-inset">
        <h2 className="fcd-final__completed-title">{t(`${CD}.completed.congratsTitle`)}</h2>
        <p className="fcd-final__completed-sub">{t(`${CD}.completed.congratsSub`)}</p>
        {finalGrade != null ? (
          <p className="fcd-final__completed-grade" role="status">
            <strong>{t(`${CD}.completed.finalGrade`, { grade: finalGrade })}</strong>
            {submittedLabel ? <span>{t(`${CD}.completed.submittedAt`, { date: submittedLabel })}</span> : null}
          </p>
        ) : null}
      </header>

      {examMarks.length > 0 ? (
        <section className="fcd-final__completed-grades" aria-labelledby="fcd-completed-grades-title">
          <h3 id="fcd-completed-grades-title" className="fcd-final__section-title">
            {t(`${CD}.completed.questionGrades`)}
            {examQuestionsForCourse(course).length > 0
              ? t(`${CD}.completed.questionCount`, { count: examQuestionsForCourse(course).length })
              : ""}
          </h3>
          <ul className="fcd-final__marks-grid fcd-final__marks-grid--readonly">
            {examMarks.map((mark, idx) => (
              <li key={`done-q-${idx}`} className="fcd-final__mark-readonly">
                <span className="fcd-final__mark-readonly-label">{t(`${CD}.completed.questionLabel`, { num: idx + 1 })}</span>
                <strong>{mark}</strong>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasAnyFileAction ? (
        <section className="fcd-final__completed-files" aria-labelledby="fcd-completed-files-title">
          <h3 id="fcd-completed-files-title" className="fcd-final__completed-files-title">
            {t(`${CD}.completed.filesAndSubmission`)}
          </h3>
          <div className="fcd-final__completed-actions">
            {hasTestFile ? (
              <CompletedActionButton
                label={t(`${CD}.completed.downloadTestFile`)}
                icon={Download}
                loading={fileAction.test === "download"}
                onClick={() => void runCourseFile("test", "download")}
              />
            ) : null}
            {hasPromptFile ? (
              <CompletedActionButton
                label={t(`${CD}.completed.downloadInstructionsFile`)}
                icon={Download}
                loading={fileAction.prompt === "download"}
                onClick={() => void runCourseFile("prompt", "download")}
              />
            ) : null}
            {hasModelAnswerFile ? (
              <CompletedActionButton
                label={t(`${CD}.completed.downloadModelAnswer`)}
                icon={Download}
                loading={fileAction.modelAnswer === "download"}
                onClick={() => void runCourseFile("modelAnswer", "download")}
              />
            ) : null}
            {hasAnswerFile ? (
              <>
                <CompletedActionButton
                  label={t(`${CD}.completed.viewAnswerFile`)}
                  icon={Eye}
                  variant="outline"
                  loading={fileAction.answer === "view"}
                  onClick={() => runAnswerFile("view")}
                />
                <CompletedActionButton
                  label={t(`${CD}.completed.downloadAnswerFile`)}
                  icon={Download}
                  loading={fileAction.answer === "download"}
                  onClick={() => runAnswerFile("download")}
                />
              </>
            ) : null}
          </div>
          {hasCompletedExamFile ? (
            <div className="fcd-final__completed-work-file" role="status">
              <span className="fcd-final__completed-work-file-icon" aria-hidden>
                <CheckCircle2 size={20} />
              </span>
              <div className="fcd-final__completed-work-file-copy">
                <strong>{t(`${CD}.file.completedWorkFile`)}</strong>
                <span>{completedExamLabel || t(`${CD}.file.completedWorkFileDefault`)}</span>
                <span className="fcd-final__completed-work-file-ok">{t(`${CD}.file.uploadedSuccessfully`)}</span>
              </div>
              <div className="fcd-final__completed-work-file-actions">
                <CompletedActionButton
                  label={t(`${CD}.file.viewFile`)}
                  icon={Eye}
                  variant="outline"
                  loading={fileAction.completedExam === "view"}
                  onClick={() => void runCompletedExamFile("view")}
                />
                <CompletedActionButton
                  label={t(`${CD}.file.downloadFile`)}
                  icon={Download}
                  loading={fileAction.completedExam === "download"}
                  onClick={() => void runCompletedExamFile("download")}
                />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {(hasAnswerText || hasAnswerFile) && (
        <section className="fcd-final__completed-summary" aria-labelledby="fcd-completed-summary-title">
          <h3 id="fcd-completed-summary-title" className="fcd-final__section-title">
            {t(`${CD}.completed.submissionSummary`)}
          </h3>
          {hasAnswerText ? (
            <div className="fcd-final__completed-text-block">
              {!showAnswerText ? (
                <CompletedActionButton
                  label={t(`${CD}.completed.viewAnswerText`)}
                  icon={FileText}
                  variant="outline"
                  onClick={() => setShowAnswerText(true)}
                />
              ) : (
                <>
                  <div className="fcd-final__submitted-text">
                    <span className="fcd-final__submitted-label">{t(`${CD}.completed.answerText`)}</span>
                    <p className="fcd-final__answer-text-body">{submittedText}</p>
                  </div>
                  <button
                    type="button"
                    className="fcd-final__completed-collapse"
                    onClick={() => setShowAnswerText(false)}
                  >
                    {t(`${CD}.completed.hideText`)}
                  </button>
                </>
              )}
            </div>
          ) : null}
          {hasAnswerFile && !hasAnswerText ? (
            <p className="fcd-final__completed-summary-note" role="status">
              {t(`${CD}.completed.answerFileOnlyNote`)}
            </p>
          ) : null}
        </section>
      )}

      {testLegacy || promptLegacy || modelAnswerLegacy ? (
        <p className="fcd-final__legacy-warn" role="alert">
          <CircleAlert size={16} aria-hidden />
          <span>{t(`${CD}.fileLegacy`)}</span>
        </p>
      ) : null}
    </div>
  );
}

function FinalTestSidebarItem({ isActive, locked, completed, ready, onSelect }) {
  const { t } = useTranslation();
  const statusLabel = completed
    ? t(`${CD}.sidebar.statusCompleted`)
    : locked
      ? t(`${CD}.sidebar.statusLocked`)
      : t(`${CD}.sidebar.statusReady`);

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
          <span className="fcd-final-item__badge">{t(`${CD}.sidebar.finalStepBadge`)}</span>
          <span className="fcd-final-item__title">{t(`${CD}.finalTestTitle`)}</span>
          <span className="fcd-final-item__status">{statusLabel}</span>
        </span>
        <span className="fcd-final-item__chev" aria-hidden>
          ‹
        </span>
      </button>
    </li>
  );
}

function ExamStepCard({ step, title, status, locked, children }) {
  const { t } = useTranslation();
  const statusClass =
    status === "done"
      ? "fcd-exam-step--done"
      : status === "available"
        ? "fcd-exam-step--available"
        : "fcd-exam-step--locked";
  return (
    <section className={`fcd-exam-step ${statusClass}${locked ? " fcd-exam-step--blocked" : ""}`}>
      <header className="fcd-exam-step__head">
        <span className="fcd-exam-step__num">{step}</span>
        <div className="fcd-exam-step__copy">
          <h3 className="fcd-exam-step__title">{title}</h3>
          <span className="fcd-exam-step__status">{stepStatusLabel(status, t)}</span>
        </div>
        {status === "done" ? (
          <span className="fcd-exam-step__done-icon" aria-hidden>
            <Check size={16} strokeWidth={2.6} />
          </span>
        ) : locked ? (
          <span className="fcd-exam-step__lock-icon" aria-hidden>
            <Lock size={15} strokeWidth={2.2} />
          </span>
        ) : null}
      </header>
      {!locked ? <div className="fcd-exam-step__body">{children}</div> : null}
    </section>
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
  onRefreshDetails,
  assignment,
  progress,
}) {
  const toast = useToast();
  const { t, locale } = useTranslation();
  const fileInputRef = useRef(null);
  const completedFileInputRef = useRef(null);
  const [fileAction, setFileAction] = useState({ test: null, prompt: null, modelAnswer: null, completedExam: null });
  const [uploadingCompleted, setUploadingCompleted] = useState(false);
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? 0;
  const examQuestions = useMemo(() => examQuestionsForCourse(course), [course]);

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
            <h2 className="fcd-final__hero-title">{t(`${CD}.exam.lockedTitle`)}</h2>
            <p className="fcd-final__hero-sub">
              {t(`${CD}.exam.lockedSub`, { completed: completedLessons, total: totalLessons })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const questionCount = examQuestions.length;
  const marksCheck =
    questionCount > 0
      ? validateClientExamMarks(questionMarks, examQuestions)
      : { ok: true, fieldErrors: {}, previewGrade: null };
  const hasTextResponse = auditResponseText.trim().length > 0;
  const hasFileResponse = auditResponseFile instanceof File;
  const hasChatGptResponse = hasTextResponse || hasFileResponse;
  const completedExamUrl = String(assignment?.completedExamFileUrl || "").trim();
  const step1Done = Boolean(completedExamUrl);
  const step2Done = hasChatGptResponse;
  const step3Done = questionCount === 0 || marksCheck.ok;
  const canSubmit = step1Done && step2Done && step3Done && !submitting;

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
  const uploadSizeLabel = auditResponseFile ? formatUploadFileSize(auditResponseFile.size, t) : null;
  const completedFileName = completedExamUrl ? fileNameFromCompletedUrl(completedExamUrl, t) : null;

  const clearAuditFile = () => {
    setAuditResponseFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runCourseFileAction = async (kind, mode, previewWindow = null) => {
    const legacy =
      kind === "test" ? testLegacy : kind === "prompt" ? promptLegacy : modelAnswerLegacy;
    if (legacy) {
      toast.error(t(`${CD}.fileLegacy`));
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
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || t(`${CD}.fileOpenFailed`));
    } finally {
      setFileAction((prev) => ({ ...prev, [kind]: null }));
    }
  };

  const runCompletedExamFileAction = async (mode, previewWindow = null) => {
    if (!step1Done || fileAction.completedExam) return;
    setFileAction((prev) => ({ ...prev, completedExam: mode }));
    const fallbackName = getStudentCourseFileDownloadName("completed-exam");
    try {
      if (mode === "view") {
        await viewFreelancerCompletedExamFile(courseId, fallbackName, previewWindow);
      } else {
        await downloadFreelancerCompletedExamFile(courseId, fallbackName);
      }
    } catch (err) {
      if (previewWindow && !previewWindow.closed) {
        try {
          previewWindow.close();
        } catch {
          /* ignore */
        }
      }
      toast.error(err?.message || t(`${CD}.fileOpenFailed`));
    } finally {
      setFileAction((prev) => ({ ...prev, completedExam: null }));
    }
  };

  const onUploadCompletedExam = async (file) => {
    if (!file || uploadingCompleted) return;
    if (String(file.type || "").toLowerCase() !== "application/pdf") {
      toast.error(t(`${CD}.uploadError`));
      return;
    }
    setUploadingCompleted(true);
    try {
      await freelancerUploadCompletedExamFileRequest(courseId, file);
      toast.success(t(`${CD}.uploadSuccess`));
      if (completedFileInputRef.current) completedFileInputRef.current.value = "";
      await onRefreshDetails?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || t(`${CD}.uploadCompletedError`));
    } finally {
      setUploadingCompleted(false);
    }
  };

  const currentStep = !step1Done ? 1 : !step2Done ? 2 : !step3Done ? 3 : null;
  const step1Status = resolveExamStepStatus({
    done: step1Done,
    locked: false,
    isCurrent: currentStep === 1,
  });
  const step2Status = resolveExamStepStatus({
    done: step2Done,
    locked: !step1Done,
    isCurrent: currentStep === 2,
  });
  const step3Status = resolveExamStepStatus({
    done: step3Done,
    locked: !step2Done,
    isCurrent: currentStep === 3,
  });

  return (
    <div className="fcd-final fcd-final--flow">
      <div className="fcd-final__congrats fdash-surface-inset" role="status">
        <Sparkles size={20} className="fcd-final__congrats-icon" aria-hidden />
        <p>
          <strong>{t(`${CD}.exam.lessonsDoneBanner`)}</strong> {t(`${CD}.exam.lessonsDoneBannerSub`)}
          <span className="fcd-final__congrats-meta">
            {t(`${CD}.exam.lessonsCompletedCount`, { completed: completedLessons, total: totalLessons })}
          </span>
        </p>
      </div>

      <header className="fcd-final__intro">
        <span className="fcd-final__intro-kicker">{t(`${CD}.sidebar.finalStepBadge`)}</span>
        <h2 className="fcd-final__intro-title">{t(`${CD}.finalTestTitle`)}</h2>
        <p className="fcd-final__intro-lead">{t(`${CD}.exam.introSub`)}</p>
      </header>

      <form className="fcd-exam-flow" onSubmit={onSubmit}>
        <ExamStepCard
          step={1}
          title={t(`${CD}.exam.step1Title`)}
          status={step1Status}
          locked={false}
        >
          <FinalExamFileCard
            embedded
            primary
            t={t}
            title={t(`${CD}.exam.testFileTitle`)}
            description={t(`${CD}.exam.testFileDesc`)}
            displayTitle={testFileDisplay.title}
            fileUrl={testLink}
            legacy={testLegacy}
            fileAction={fileAction.test}
            downloadLabel={t(`${CD}.exam.downloadTestFile`)}
            onView={() => {
              const preview = openPdfPreviewTab();
              void runCourseFileAction("test", "view", preview);
            }}
            onDownload={() => void runCourseFileAction("test", "download")}
          />

          <div className={`fcd-final__upload-zone ${step1Done ? "fcd-final__upload-zone--filled" : ""}`}>
            <input
              ref={completedFileInputRef}
              type="file"
              className="fcd-final__upload-input"
              accept=".pdf,application/pdf"
              disabled={submitting || uploadingCompleted}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onUploadCompletedExam(file);
              }}
            />
            {step1Done ? (
              <div className="fcd-final__upload-selected" role="status">
                <span className="fcd-final__upload-selected-icon" aria-hidden>
                  <CheckCircle2 size={22} />
                </span>
                <div className="fcd-final__upload-selected-copy">
                  <strong>{completedFileName || t(`${CD}.file.completedWorkFile`)}</strong>
                  <span className="fcd-final__upload-selected-ok">{t(`${CD}.exam.uploadCompletedSuccess`)}</span>
                </div>
                <div className="fcd-final__upload-selected-actions">
                  <button
                    type="button"
                    className="fcd-final__upload-mini-btn"
                    disabled={submitting || uploadingCompleted || Boolean(fileAction.completedExam)}
                    onClick={() => {
                      const preview = openPdfPreviewTab();
                      void runCompletedExamFileAction("view", preview);
                    }}
                  >
                    {fileAction.completedExam === "view" ? (
                      <Loader2 size={14} className="fcd-btn__spinner" aria-hidden />
                    ) : (
                      <Eye size={14} aria-hidden />
                    )}
                    {t(`${CD}.file.viewFile`)}
                  </button>
                  <button
                    type="button"
                    className="fcd-final__upload-mini-btn"
                    disabled={submitting || uploadingCompleted || Boolean(fileAction.completedExam)}
                    onClick={() => void runCompletedExamFileAction("download")}
                  >
                    {fileAction.completedExam === "download" ? (
                      <Loader2 size={14} className="fcd-btn__spinner" aria-hidden />
                    ) : (
                      <Download size={14} aria-hidden />
                    )}
                    {t(`${CD}.file.downloadFile`)}
                  </button>
                  <button
                    type="button"
                    className="fcd-final__upload-mini-btn"
                    disabled={submitting || uploadingCompleted}
                    onClick={() => completedFileInputRef.current?.click()}
                  >
                    {t(`${CD}.file.replaceFile`)}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <span className="fcd-final__upload-icon" aria-hidden>
                  <Upload size={22} />
                </span>
                <span className="fcd-final__upload-title">{t(`${CD}.exam.uploadCompletedTitle`)}</span>
                <span className="fcd-final__upload-hint">{t(`${CD}.exam.uploadCompletedHint`)}</span>
                <button
                  type="button"
                  className="fcd-final__upload-btn"
                  disabled={submitting || uploadingCompleted}
                  onClick={() => completedFileInputRef.current?.click()}
                >
                  {uploadingCompleted ? t(`${CD}.exam.uploading`) : t(`${CD}.exam.uploadCompletedBtn`)}
                </button>
              </>
            )}
          </div>
          {!step1Done ? (
            <p className="fcd-exam-step__hint" role="status">
              {t(`${CD}.exam.step1Required`)}
            </p>
          ) : null}
        </ExamStepCard>

        <ExamStepCard
          step={2}
          title={t(`${CD}.exam.step2Title`)}
          status={step2Status}
          locked={!step1Done}
        >
          <p className="fcd-flow__step-note">{t(`${CD}.exam.step2Note`)}</p>

          <div className="fcd-exam-step__file-grid">
            <FinalExamFileCard
              embedded
              t={t}
              title={t(`${CD}.exam.promptFileTitle`)}
              description={t(`${CD}.exam.promptFileDesc`)}
              displayTitle={promptFileDisplay.title}
              fileUrl={promptFileLink}
              legacy={promptLegacy}
              fileAction={fileAction.prompt}
              downloadLabel={t(`${CD}.exam.downloadPromptFile`)}
              onView={() => {
                const preview = openPdfPreviewTab();
                void runCourseFileAction("prompt", "view", preview);
              }}
              onDownload={() => void runCourseFileAction("prompt", "download")}
            />
            <FinalExamFileCard
              embedded
              t={t}
              title={t(`${CD}.exam.modelAnswerTitle`)}
              description={t(`${CD}.exam.modelAnswerDesc`)}
              displayTitle={modelAnswerFileDisplay.title}
              fileUrl={modelAnswerFileLink}
              legacy={modelAnswerLegacy}
              fileAction={fileAction.modelAnswer}
              downloadLabel={t(`${CD}.exam.downloadModelAnswer`)}
              onView={() => {
                const preview = openPdfPreviewTab();
                void runCourseFileAction("modelAnswer", "view", preview);
              }}
              onDownload={() => void runCourseFileAction("modelAnswer", "download")}
            />
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
                    <span className="fcd-final__upload-selected-ok">{t(`${CD}.exam.chatgptFileSelected`)}</span>
                  </div>
                  <div className="fcd-final__upload-selected-actions">
                    <button
                      type="button"
                      className="fcd-final__upload-mini-btn"
                      disabled={submitting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {t(`${CD}.file.replace`)}
                    </button>
                    <button
                      type="button"
                      className="fcd-final__upload-mini-btn fcd-final__upload-mini-btn--danger"
                      disabled={submitting}
                      onClick={clearAuditFile}
                      aria-label={t(`${CD}.file.removeFileAria`)}
                    >
                      <X size={14} aria-hidden />
                      {t(`${CD}.file.remove`)}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="fcd-final__upload-icon" aria-hidden>
                    <Upload size={22} />
                  </span>
                  <span className="fcd-final__upload-title">{t(`${CD}.exam.uploadChatgptTitle`)}</span>
                  <button
                    type="button"
                    className="fcd-final__upload-btn"
                    disabled={submitting}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t(`${CD}.file.chooseFile`)}
                  </button>
                </>
              )}
            </div>

            <label className="fcd-final__field fcd-final__field--text">
              <span className="fcd-final__field-label">{t(`${CD}.exam.pasteChatgptLabel`)}</span>
              <textarea
                rows={6}
                maxLength={MAX_RESPONSE_CHARS}
                value={auditResponseText}
                onChange={(e) => setAuditResponseText(e.target.value)}
                disabled={submitting}
                placeholder={t(`${CD}.exam.pasteChatgptPlaceholder`)}
                className="fcd-final__textarea"
              />
              <span className="fcd-final__char-count" aria-live="polite">
                {charCount.toLocaleString(locale)} / {MAX_RESPONSE_CHARS.toLocaleString(locale)}
              </span>
            </label>
          </div>
        </ExamStepCard>

        <ExamStepCard
          step={3}
          title={t(`${CD}.exam.step3Title`)}
          status={step3Status}
          locked={!step2Done}
        >
          {questionCount > 0 ? (
            <>
              <p className="fcd-flow__step-note">{t(`${CD}.exam.step3Note`)}</p>
              <div className="fcd-final__marks-grid fcd-final__marks-grid--rows">
                {examQuestions.map((q, idx) => {
                  const key = `q${q.number}`;
                  const err = markErrors[key] || marksCheck.fieldErrors[key];
                  const label = q.text
                    ? t(`${CD}.exam.questionWithText`, { num: q.number, text: q.text })
                    : t(`${CD}.exam.questionNumber`, { num: q.number });
                  return (
                    <label key={key} className={`fcd-final__mark-row${err ? " fcd-final__mark-row--error" : ""}`}>
                      <span className="fcd-final__mark-row-label">{label}</span>
                      <div className="fcd-final__mark-row-input-wrap">
                        <span className="fcd-final__mark-row-prefix">{t(`${CD}.exam.markLabel`)}</span>
                        <input
                          type="number"
                          min={0}
                          max={q.maxMark}
                          step={1}
                          inputMode="numeric"
                          className="fcd-final__mark-input fcd-final__mark-input--compact"
                          value={questionMarks[idx] ?? ""}
                          disabled={submitting}
                          onWheel={preventNumberInputScroll}
                          onChange={(e) => {
                            const { value, fieldError } = sanitizeExamMarkInput(e.target.value, q.maxMark, t);
                            const next = [...questionMarks];
                            next[idx] = value;
                            setQuestionMarks(next);
                            setMarkErrors((prev) => {
                              const copy = { ...prev };
                              if (fieldError) copy[key] = fieldError;
                              else delete copy[key];
                              return copy;
                            });
                          }}
                          aria-invalid={Boolean(err)}
                          aria-describedby={err ? `${key}-err` : undefined}
                        />
                        <span className="fcd-final__mark-row-max">/ {q.maxMark}</span>
                      </div>
                      {err ? (
                        <span id={`${key}-err`} className="fcd-final__mark-error" role="alert">
                          {err}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="fcd-flow__step-note">{t(`${CD}.exam.noGradedQuestions`)}</p>
          )}

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
              {submitting ? t(`${CD}.exam.submitting`) : t(`${CD}.exam.submitFinale`)}
            </button>
            {!canSubmit && !submitting ? (
              <p className="fcd-final__submit-hint" role="status">
                {!step1Done
                  ? t(`${CD}.exam.hintUploadFirst`)
                  : !step2Done
                    ? t(`${CD}.exam.hintChatgptRequired`)
                    : !step3Done
                      ? t(`${CD}.exam.hintCompleteMarks`)
                      : t(`${CD}.exam.hintCompleteAllSteps`)}
              </p>
            ) : null}
          </div>
        </ExamStepCard>
      </form>
    </div>
  );
}

function fileNameFromCompletedUrl(url, t) {
  const fallback = t(`${CD}.file.defaultCompletedPdf`);
  try {
    const tail = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return tail && tail.length < 120 ? tail : fallback;
  } catch {
    return fallback;
  }
}

export default function FreelancerCourseDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { t, locale, dir } = useTranslation();
  const freelancerUserId = user?.id != null ? String(user.id) : "";
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

        if (out?.assignment?.auditResponseText) {
          setAuditResponseText(out.assignment.auditResponseText);
        } else if (id && freelancerUserId) {
          setAuditResponseText(readChatGptDraft(id, freelancerUserId));
        } else {
          setAuditResponseText("");
        }
        const questions = examQuestionsForCourse(out?.course);
        if (questions.length > 0) {
          const stored = out?.assignment?.examQuestionMarks;
          if (Array.isArray(stored) && stored.length === questions.length) {
            setQuestionMarks(stored.map((m) => String(m)));
          } else {
            setQuestionMarks(emptyMarksArray(questions.length));
          }
        } else {
          setQuestionMarks([]);
        }
        setMarkErrors({});
        setAuditResponseFile(null);
        return out;
      } catch (err) {
        toast.error(err?.response?.data?.message || t(`${CD}.loadError`));
        return null;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [id, toast, freelancerUserId, t],
  );

  useEffect(() => {
    loadDetails();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!id || !freelancerUserId || !data?.completion?.testingEnabled || data?.completion?.courseCompleted) {
      return;
    }
    if (data?.assignment?.auditResponseText) return;
    writeChatGptDraft(id, freelancerUserId, auditResponseText);
  }, [
    auditResponseText,
    data?.assignment?.auditResponseText,
    data?.completion?.courseCompleted,
    data?.completion?.testingEnabled,
    freelancerUserId,
    id,
  ]);

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
      toast.error(t(`${CD}.completeLessonsFirst`));
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
    toast.info(t(`${CD}.saveProgressInfo`));

    try {
      await freelancerMarkLessonCompleteRequest(id, markedLessonId);
      toast.success(t(`${CD}.lessonCompleteSuccess`));
      const out = await loadDetails({
        silent: true,
        preferLessonId: nextLessonId,
      });
      const testingOn = Boolean(out?.completion?.testingEnabled);
      const allDone = Boolean(out?.completion?.allLessonsComplete);
      const completed = Boolean(out?.completion?.courseCompleted);

      if (testingOn && allDone && !completed) {
        setMainView("final-test");
        toast.success(t(`${CD}.testUnlocked`));
      } else if (nextLessonId) {
        setMainView("lesson");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t(`${CD}.saveProgressError`));
    } finally {
      markCompleteInFlightRef.current = false;
      setMarkingLessonComplete(false);
    }
  };

  const onSubmitCompletion = async (e) => {
    e?.preventDefault?.();
    if (!id) return;

    if (!allLessonsComplete) {
      toast.error(t(`${CD}.mustCompleteLessons`));
      return;
    }

    const hasText = auditResponseText.trim().length > 0;
    const hasFile = auditResponseFile instanceof File;
    if (testingEnabled && !hasText && !hasFile) {
      toast.error(t(`${CD}.chatgptRequired`));
      return;
    }

    const questions = examQuestionsForCourse(course);
    let marksPayload;
    if (testingEnabled && questions.length > 0) {
      const check = validateClientExamMarks(questionMarks, questions);
      if (!check.ok) {
        setMarkErrors(check.fieldErrors);
        toast.error(t(`${CD}.completeAllMarks`));
        return;
      }
      marksPayload = check.previewGrade != null ? questionMarks.map((m) => Number(m)) : undefined;
    }

    if (testingEnabled && !assignment?.completedExamFileUrl) {
      toast.error(t(`${CD}.uploadCompletedFirst`));
      return;
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
      if (freelancerUserId) clearChatGptDraft(id, freelancerUserId);
      toast.success(t(`${CD}.courseFinishedSuccess`));
      await loadDetails({ openFinalTest: true });
    } catch (err) {
      const fieldErrors = err?.response?.data?.fieldErrors;
      if (fieldErrors && typeof fieldErrors === "object") {
        setMarkErrors(fieldErrors);
      }
      toast.error(err?.response?.data?.message || t(`${CD}.courseFinishError`));
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = progress?.percentage ?? 0;
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? lessons.length;
  const lastActivityAt =
    assignment?.auditSubmittedAt || assignment?.completedAt || course?.updatedAt || course?.createdAt || null;
  const activeLessonDuration = formatLessonDuration(activeLesson?.durationSeconds, t);
  const activeNoteKey = activeLesson?.id ? String(activeLesson.id) : "";

  const totalDurationLabel = formatTotalCourseDuration(lessons, t) || t(`${CD}.header.durationUnknown`);
  const lastActivityLabel = formatLastActivityLabel(lastActivityAt, t, locale) || t(`${CD}.header.noActivity`);

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
        t,
      }),
    [
      courseDone,
      finalTestReady,
      allLessonsComplete,
      completedLessons,
      totalLessons,
      testingEnabled,
      t,
    ],
  );

  return (
    <DashboardHubPage className="fdash-page--course-details">
      <div className="fcd-page" lang={locale} dir={dir}>
        {loading ? <CourseDetailsPageSkeleton /> : null}

        {!loading && course ? (
          <div className="fcd-page__content fcd-page--loaded">
          <header className="fcd-header fdash-surface-3d fdash-surface-3d--soft">
            <div className="fcd-header__top">
              <span className="fcd-header__chip">{t(`${CD}.header.trainingChip`)}</span>
              <NavLink to="/dashboard/freelancer/courses" className="fcd-header__back" dir="ltr">
                <ArrowLeft size={18} strokeWidth={2.2} aria-hidden />
                {t(`${CD}.header.backToCourses`)}
              </NavLink>
            </div>

            <div className="fcd-header__main">
              <div className="fcd-header__copy">
                <h1 className="fcd-header__title">{course.title}</h1>
                {course.description ? (
                  <p className="fcd-header__desc">
                    <LinkifiedText text={course.description} />
                  </p>
                ) : null}
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

            <ul className="fcd-header__meta" aria-label={t(`${CD}.header.summaryAria`)}>
              <li>
                <Clock size={16} strokeWidth={2} aria-hidden />
                <span>
                  {t(`${CD}.header.lessonsCompleted`, { completed: completedLessons, total: totalLessons })}
                </span>
              </li>
              <li>
                <Play size={16} strokeWidth={2} aria-hidden />
                <span>
                  {t(`${CD}.header.totalDuration`, { duration: totalDurationLabel })}
                </span>
              </li>
              <li>
                <FileText size={16} strokeWidth={2} aria-hidden />
                <span>
                  {t(`${CD}.header.lastActivity`, { activity: lastActivityLabel })}
                </span>
              </li>
            </ul>
          </header>

          <CourseSideTextAd context="course_details" courseId={id} />

          {courseDone && !isFinalTestView ? (
            <div className="fcd-banner fcd-banner--success fdash-surface-3d fdash-surface-3d--soft" role="status">
              <span className="fcd-banner__icon" aria-hidden>
                <Check size={20} strokeWidth={2.4} />
              </span>
              <div className="fcd-banner__copy">
                <strong>{t(`${CD}.header.courseFinishedBanner`)}</strong>
                {assignment?.completedAt ? (
                  <span className="fcd-banner__sub">{t(`${CD}.header.completionRecorded`)}</span>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="fcd-layout">
            <aside className="fcd-sidebar fdash-surface-3d fdash-surface-3d--soft" aria-label={t(`${CD}.sidebar.contentAria`)}>
              <h2 className="fcd-sidebar__title">{t(`${CD}.sidebar.contentTitle`)}</h2>
              <ol className={`fcd-sidebar__list${sidebarExpanded ? " fcd-sidebar__list--expanded" : ""}`}>
                {lessons.map((lesson, idx) => {
                  const isActive = !isFinalTestView && String(lesson.id) === String(activeLesson?.id);
                  const duration = formatLessonDuration(lesson.durationSeconds, t);
                  const statusLine = lesson.isCompleted
                    ? duration
                      ? t(`${CD}.sidebar.completedWithDuration`, { duration })
                      : t(`${CD}.sidebar.completed`)
                    : isActive
                      ? duration
                        ? t(`${CD}.sidebar.watchingWithDuration`, { duration })
                        : t(`${CD}.sidebar.watching`)
                      : duration || t(`${CD}.sidebar.noDuration`);

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
                    {t(`${CD}.sidebar.showAllLessons`, { count: lessons.length })}
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
                    onRefreshDetails={() => loadDetails({ silent: true, openFinalTest: true })}
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
                        {t(`${CD}.saveProgressInfo`)}
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
                          <p>{t(`${CD}.lesson.noVideo`)}</p>
                        </div>
                      )}
                    </div>

                    <div className="fcd-lesson-card__body">
                      <div className="fcd-lesson-card__head">
                        <h2 className="fcd-lesson-card__title">{activeLesson?.title || t(`${CD}.lesson.untitled`)}</h2>
                        {activeIndex >= 0 ? (
                          <span className="fcd-lesson-card__badge">{activeIndex + 1}</span>
                        ) : null}
                      </div>

                      <div className="fcd-lesson-card__chips">
                        <span className="fcd-lesson-card__chip">
                          <Video size={14} strokeWidth={2} aria-hidden />
                          {t(`${CD}.lesson.videoChip`)}
                        </span>
                        {activeLessonDuration ? (
                          <span className="fcd-lesson-card__chip">
                            <Clock size={14} strokeWidth={2} aria-hidden />
                            {activeLessonDuration}
                          </span>
                        ) : null}
                        <span className="fcd-lesson-card__chip">
                          {t(`${CD}.lesson.lessonOf`, {
                            current: activeIndex >= 0 ? activeIndex + 1 : 0,
                            total: lessons.length,
                          })}
                        </span>
                      </div>

                      {activeLesson?.description ? (
                        <p className="fcd-lesson-card__desc">
                          <LinkifiedText text={activeLesson.description} />
                        </p>
                      ) : null}

                      {finalTestReady ? (
                        <p className="fcd-lesson-card__hint">{t(`${CD}.lesson.finalTestReadyHint`)}</p>
                      ) : null}

                      <div className="fcd-lesson-card__actions">
                        <button
                          type="button"
                          className="fcd-btn fcd-btn--ghost"
                          onClick={goPrevLesson}
                          disabled={courseDone || activeIndex <= 0 || lessonNavLocked}
                        >
                          <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
                          {t(`${CD}.lesson.prevLesson`)}
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
                              {t(`${CD}.lesson.savingProgress`)}
                            </>
                          ) : (
                            <>
                              <Check size={18} strokeWidth={2.4} aria-hidden />
                              {t(`${CD}.lesson.markComplete`)}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`fcd-btn ${finalTestReady && activeIndex >= lessons.length - 1 ? "fcd-btn--accent" : "fcd-btn--ghost"}`}
                          onClick={goNextLesson}
                          disabled={courseDone || lessonNavLocked}
                        >
                          {activeIndex >= lessons.length - 1 && finalTestReady
                            ? t(`${CD}.lesson.finalTestNav`)
                            : t(`${CD}.lesson.nextLesson`)}
                          <ChevronLeft size={18} strokeWidth={2.2} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </article>

                  <section className="fcd-summary-card fdash-surface-3d fdash-surface-3d--soft" aria-labelledby="fcd-summary-title">
                    <h3 id="fcd-summary-title" className="fcd-summary-card__title">
                      {t(`${CD}.lesson.summaryTitle`)}
                    </h3>
                    <div className="fcd-summary-card__field fdash-surface-inset">
                      <textarea
                        className="fcd-summary-card__textarea"
                        rows={5}
                        placeholder={t(`${CD}.lesson.summaryPlaceholder`)}
                        value={activeNoteKey ? lessonNotes[activeNoteKey] || "" : ""}
                        onChange={(e) => {
                          if (!activeNoteKey) return;
                          setLessonNotes((prev) => ({ ...prev, [activeNoteKey]: e.target.value }));
                        }}
                        aria-label={t(`${CD}.lesson.summaryAria`)}
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
              <p className="fcd-finish-card__text">{t(`${CD}.finish.allLessonsDone`)}</p>
              <button
                type="button"
                className="fcd-btn fcd-btn--primary"
                disabled={submitting}
                onClick={() => void onSubmitCompletion()}
              >
                {submitting ? t(`${CD}.finish.submitting`) : t(`${CD}.finish.finishCourse`)}
              </button>
            </div>
          ) : null}
          </div>
        ) : null}

        {!loading && !course ? (
          <div className="fcd-empty fdash-surface-3d fdash-surface-3d--soft">
            <p>{t(`${CD}.empty.loadFailed`)}</p>
            <NavLink to="/dashboard/freelancer/courses" className="fcd-btn fcd-btn--primary">
              {t(`${CD}.empty.backToCourses`)}
            </NavLink>
          </div>
        ) : null}
      </div>
    </DashboardHubPage>
  );
}

