import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Lock,
  Play,
  Star,
  Video,
} from "lucide-react";
import {
  freelancerGetCourseDetailsRequest,
  freelancerMarkLessonCompleteRequest,
  freelancerSubmitCourseCompletionRequest,
} from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import CourseDetailsPageSkeleton from "../../components/dashboard/courses/CourseDetailsPageSkeleton";
import "../../styles/dashboardHub.css";
import "./freelancerCourseDetails.css";

const FINAL_TEST_STEP_ID = "final-test";
const FINAL_TEST_TITLE = "الاختبار النهائي بعد الدورة";
const MAX_RESPONSE_CHARS = 15000;

const PROMPT_USAGE_HINT =
  "افتح ملف الموجه المرفق من الإدارة، انسخ محتواه بالكامل، والصقه في ChatGPT مع ملف الاختبار وعملك/تكليفك، ثم انسخ الاستجابة للتسليم هنا.";

function toEmbedUrl(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(String(videoId || ""))}?rel=0&modestbranding=1&playsinline=1`;
}

function fileLabelFromUrl(url, fallback = "ملف مرفق") {
  if (!url) return fallback;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return name && name !== "/" ? name : fallback;
  } catch {
    return fallback;
  }
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

function CircularProgressRing({ percent, size = 92 }) {
  const pct = Math.min(100, Math.max(0, Number(percent) || 0));
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const cx = size / 2;
  return (
    <div className="fcd-ring" style={{ width: size, height: size }} aria-hidden>
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
        <span className="fcd-ring__caption">التقدم الكلي</span>
      </div>
    </div>
  );
}

function fileExtLabel(url) {
  const name = fileLabelFromUrl(url, "");
  const ext = name.includes(".") ? name.split(".").pop()?.toUpperCase() : "";
  return ext && ext.length <= 5 ? ext : "ملف";
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
  courseDone,
  allLessonsComplete,
  testLink,
  promptFileLink,
  auditResponseText,
  setAuditResponseText,
  auditResponseFile,
  setAuditResponseFile,
  submitting,
  onSubmit,
  assignment,
  progress,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);
  const completedLessons = progress?.completedLessons ?? 0;
  const totalLessons = progress?.totalLessons ?? 0;

  if (courseDone) {
    return (
      <div className="fcd-final">
        <div className="fcd-final__hero fcd-final__hero--success">
          <div className="fcd-final__hero-sparkles" aria-hidden />
          <div className="fcd-final__hero-inner">
            <div className="fcd-final__success-ring" aria-hidden>
              ✓
            </div>
            <h2 className="fcd-final__hero-title">أحسنت! اكتملت الدورة بنجاح</h2>
            <p className="fcd-final__hero-sub">
              تم تسجيل استجابة الاختبار النهائي وإنهاء الدورة. يمكنك مراجعة الدروس من القائمة الجانبية في أي وقت.
            </p>
            {assignment?.auditSubmittedAt ? (
              <p className="fcd-final__hero-meta">تم حفظ تاريخ التسليم في سجلك التدريبي.</p>
            ) : null}
          </div>
        </div>

        <div className="fcd-final__card fcd-final__card--success-detail">
          <h3 className="fcd-final__section-title">ملخص التسليم</h3>
          {assignment?.auditResponseText ? (
            <div className="fcd-final__submitted-text">
              <span className="fcd-final__submitted-label">نص الاستجابة</span>
              <p>{assignment.auditResponseText.slice(0, 500)}{assignment.auditResponseText.length > 500 ? "…" : ""}</p>
            </div>
          ) : null}
          {assignment?.auditResponseFileUrl ? (
            <a
              href={assignment.auditResponseFileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="fcd-final__resource-action fcd-final__resource-action--solid"
            >
              <span className="fcd-final__resource-action-icon" aria-hidden>
                ↓
              </span>
              عرض ملف الاستجابة المُرسل
            </a>
          ) : null}
        </div>
      </div>
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

  const hasResponse = auditResponseText.trim().length > 0 || auditResponseFile;
  const resourcesReady = Boolean(testLink || promptFileLink);
  const testFileName = fileLabelFromUrl(testLink, "ملف الاختبار");
  const promptFileName = fileLabelFromUrl(promptFileLink, "ملف الموجه");
  const charCount = auditResponseText.length;

  const copyPromptHint = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_USAGE_HINT);
      toast.success("تم نسخ تعليمات استخدام الموجه.");
    } catch {
      toast.error("تعذر النسخ. انسخ النص يدوياً من الصندوق.");
    }
  };

  return (
    <div className="fcd-final">
      {/* A) Hero */}
      <section className="fcd-final__hero">
        <div className="fcd-final__hero-sparkles" aria-hidden />
        <div className="fcd-final__hero-art" aria-hidden>
          <span className="fcd-final__hero-art-piece fcd-final__hero-art-piece--trophy">🏆</span>
          <span className="fcd-final__hero-art-piece fcd-final__hero-art-piece--board">📋</span>
        </div>
        <div className="fcd-final__hero-inner">
          <span className="fcd-final__hero-kicker">الخطوة الأخيرة</span>
          <h2 className="fcd-final__hero-title">{FINAL_TEST_TITLE}</h2>
          <p className="fcd-final__hero-sub">
            أنت الآن في المرحلة النهائية قبل إتمام الدورة بنجاح. استخدم ملف الاختبار والموجه في ChatGPT، ثم أرسل استجابتك.
          </p>
          <div className="fcd-final__milestones" role="list">
            <div className="fcd-final__milestone fcd-final__milestone--done" role="listitem">
              <span className="fcd-final__milestone-icon" aria-hidden>✓</span>
              <span className="fcd-final__milestone-text">
                <strong>أكمل جميع الدروس</strong>
                <small>{completedLessons}/{totalLessons}</small>
              </span>
            </div>
            <div
              className={`fcd-final__milestone ${resourcesReady ? "fcd-final__milestone--done" : "fcd-final__milestone--current"}`}
              role="listitem"
            >
              <span className="fcd-final__milestone-icon" aria-hidden>{resourcesReady ? "✓" : "📄"}</span>
              <span className="fcd-final__milestone-text">
                <strong>استخدم الملف والموجه</strong>
                <small>في ChatGPT</small>
              </span>
            </div>
            <div className={`fcd-final__milestone ${hasResponse ? "fcd-final__milestone--current" : ""}`} role="listitem">
              <span className="fcd-final__milestone-icon" aria-hidden>{hasResponse ? "✓" : "✈"}</span>
              <span className="fcd-final__milestone-text">
                <strong>أرسل استجابة ChatGPT</strong>
                <small>لإنهاء الدورة</small>
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="fcd-final__resources-grid">
          <article className="fcd-final__resource-card">
            <div className="fcd-final__resource-card-head">
              <span className="fcd-final__resource-card-icon" aria-hidden>
                📄
              </span>
              <div>
                <h4 className="fcd-final__resource-card-title">ملف الاختبار</h4>
                <p className="fcd-final__resource-card-desc">حمّل الملف واستخدمه مع عملك في ChatGPT.</p>
              </div>
            </div>
            {testLink ? (
              <>
                <div className="fcd-final__file-row">
                  <span className="fcd-final__file-row-badge">{fileExtLabel(testLink)}</span>
                  <div className="fcd-final__file-row-meta">
                    <strong>{testFileName}</strong>
                    <small>ملف الاختبار</small>
                  </div>
                </div>
                <a href={testLink} target="_blank" rel="noopener noreferrer" className="fcd-final__download-btn" download>
                  <span aria-hidden>↓</span>
                  تحميل الملف
                </a>
              </>
            ) : (
              <p className="fcd-final__resource-empty">لم يُرفق ملف اختبار من الإدارة بعد.</p>
            )}
          </article>

          <article className="fcd-final__resource-card fcd-final__resource-card--prompt">
            <div className="fcd-final__resource-card-head">
              <span className="fcd-final__resource-card-icon" aria-hidden>
                ✦
              </span>
              <div>
                <h4 className="fcd-final__resource-card-title">موجه ChatGPT (تعليمات)</h4>
                <p className="fcd-final__resource-card-desc">انسخ التعليمات أو افتح ملف الموجه من الإدارة.</p>
              </div>
            </div>
            {promptFileLink ? (
              <>
                <div className="fcd-final__prompt-box">
                  <p className="fcd-final__prompt-box-text">{PROMPT_USAGE_HINT}</p>
                  <p className="fcd-final__prompt-box-file">
                    الملف المرفق: <strong>{promptFileName}</strong>
                  </p>
                </div>
                <div className="fcd-final__resource-actions">
                  <button type="button" className="fcd-final__copy-btn" onClick={() => void copyPromptHint()}>
                    نسخ التعليمات
                  </button>
                  <a href={promptFileLink} target="_blank" rel="noopener noreferrer" className="fcd-final__download-btn fcd-final__download-btn--outline">
                    <span aria-hidden>↓</span>
                    فتح ملف الموجه
                  </a>
                </div>
              </>
            ) : (
              <p className="fcd-final__resource-empty">لم يُرفق ملف موجه من الإدارة بعد.</p>
            )}
          </article>
        </div>

      {/* D) Submission */}
      <form className="fcd-final__card fcd-final__card--submit" onSubmit={onSubmit}>
        <header className="fcd-final__submit-head">
          <span className="fcd-final__submit-head-icon" aria-hidden>
            ✎
          </span>
          <div>
            <h3 className="fcd-final__section-title">إرسال استجابة ChatGPT</h3>
            <p className="fcd-final__section-lead">الصق النص أو ارفع ملف الاستجابة — مطلوب أحدهما على الأقل.</p>
          </div>
        </header>

        <div className="fcd-final__submit-split">
          <label className="fcd-final__field fcd-final__field--text">
            <span className="fcd-final__field-label">نص الاستجابة</span>
            <textarea
              rows={9}
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

          <div className="fcd-final__upload-zone">
          <input
            ref={fileInputRef}
            type="file"
            className="fcd-final__upload-input"
            accept=".pdf,.doc,.docx,.txt,.zip,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.ppt,.pptx"
            disabled={submitting}
            onChange={(e) => setAuditResponseFile(e.target.files?.[0] || null)}
          />
          <span className="fcd-final__upload-icon" aria-hidden>
            ↑
          </span>
          <span className="fcd-final__upload-title">
            {auditResponseFile ? auditResponseFile.name : "اسحب الملف هنا أو اختر من جهازك"}
          </span>
          <span className="fcd-final__upload-hint">PDF، Word، نص، صور — حتى 5 ميجابايت</span>
          <button
            type="button"
            className="fcd-final__upload-btn"
            disabled={submitting}
            onClick={() => fileInputRef.current?.click()}
          >
            {auditResponseFile ? "تغيير الملف" : "اختيار ملف"}
          </button>
        </div>
        </div>

        <div className="fcd-final__submit-footer">
          <button type="submit" className="fcd-final__submit" disabled={submitting || !hasResponse}>
            <span className="fcd-final__submit-glow" aria-hidden />
            <span className="fcd-final__submit-icon" aria-hidden>
              ✈
            </span>
            {submitting ? "جارٍ الإرسال والإنهاء…" : "إرسال الاستجابة وإتمام الدورة"}
          </button>
          <p className="fcd-final__submit-note" role="note">
            <span aria-hidden>ℹ</span>
            لا يمكن إتمام الدورة دون تسليم استجابة ChatGPT (نص أو ملف).
          </p>
        </div>
      </form>

      {/* Info banner */}
      <aside className="fcd-final__info-banner" role="note">
        <span className="fcd-final__info-icon" aria-hidden>
          💡
        </span>
        <p>
          <strong>معلومة:</strong> هذا ليس اختباراً تقنياً بدرجات، بل خطوة لتطبيق ما تعلمته. قدّم أفضل استجابة منك قبل الإرسال.
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
  const [data, setData] = useState(null);
  const [mainView, setMainView] = useState("lesson");
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [auditResponseText, setAuditResponseText] = useState("");
  const [auditResponseFile, setAuditResponseFile] = useState(null);
  const [lessonNotes, setLessonNotes] = useState({});
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const loadDetails = useCallback(
    async ({ openFinalTest = false } = {}) => {
      if (!id) return null;
      setLoading(true);
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
        setAuditResponseFile(null);
        return out;
      } catch (err) {
        toast.error(err?.response?.data?.message || "تعذر تحميل الدورة.");
        return null;
      } finally {
        setLoading(false);
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
    try {
      await freelancerMarkLessonCompleteRequest(id, activeLesson.id);
      toast.success("تم تسجيل إكمال المشاهدة.");
      const out = await loadDetails();
      const testingOn = Boolean(out?.completion?.testingEnabled);
      const allDone = Boolean(out?.completion?.allLessonsComplete);
      const completed = Boolean(out?.completion?.courseCompleted);
      if (testingOn && allDone && !completed) {
        setMainView("final-test");
        toast.success("تم فتح الاختبار النهائي — أكمل التسليم الآن.");
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "تعذر تسجيل الإكمال.");
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

    setSubmitting(true);
    try {
      const payload = testingEnabled
        ? {
            auditResponseText: auditResponseText.trim() || undefined,
            auditResponseFile: auditResponseFile || undefined,
          }
        : {};
      await freelancerSubmitCourseCompletionRequest(id, payload);
      toast.success("تم إنهاء الدورة بنجاح.");
      await loadDetails({ openFinalTest: true });
    } catch (err) {
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
              </div>
              <CircularProgressRing percent={progressPct} />
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

            <div
              className="fcd-header__bar"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="تقدم الدورة"
            >
              <span className="fcd-header__bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
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
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() => selectLesson(lesson.id)}
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
                    courseDone={courseDone}
                    allLessonsComplete={allLessonsComplete}
                    testLink={course?.testFileUrl}
                    promptFileLink={course?.testPromptFileUrl}
                    auditResponseText={auditResponseText}
                    setAuditResponseText={setAuditResponseText}
                    auditResponseFile={auditResponseFile}
                    setAuditResponseFile={setAuditResponseFile}
                    submitting={submitting}
                    onSubmit={onSubmitCompletion}
                    assignment={assignment}
                    progress={progress}
                  />
                </div>
              ) : (
                <>
                  <article className="fcd-lesson-card fdash-surface-3d fdash-surface-3d--soft">
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
                          disabled={courseDone || activeIndex <= 0}
                        >
                          <ChevronRight size={18} strokeWidth={2.2} aria-hidden />
                          الدرس السابق
                        </button>
                        <button
                          type="button"
                          className="fcd-btn fcd-btn--primary"
                          onClick={onComplete}
                          disabled={courseDone || !activeLesson}
                        >
                          <Check size={18} strokeWidth={2.4} aria-hidden />
                          تعليم الدرس كمكتمل
                        </button>
                        <button
                          type="button"
                          className={`fcd-btn ${finalTestReady && activeIndex >= lessons.length - 1 ? "fcd-btn--accent" : "fcd-btn--ghost"}`}
                          onClick={goNextLesson}
                          disabled={courseDone}
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

