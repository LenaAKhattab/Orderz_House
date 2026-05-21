import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Circle,
  Clock,
  GraduationCap,
  LayoutGrid,
  Play,
  Search,
  Star,
} from "lucide-react";
import { freelancerListMyCoursesRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";
import DashboardHubPage from "../../components/dashboard/hub/DashboardHubPage";
import DashboardHubEmpty from "../../components/dashboard/hub/DashboardHubEmpty";
import HubMetricSkeleton from "../../components/dashboard/hub/HubMetricSkeleton";
import CoursesPageSkeleton from "../../components/dashboard/courses/CoursesPageSkeleton";
import DashboardBannerIllustration from "../../components/dashboard/hub/DashboardBannerIllustration";
import "../../styles/dashboardHub.css";
import "./freelancerCourses.css";

const FAVORITES_KEY = "oh_freelancer_course_favorites";

const STATUS_TABS = [
  { id: "all", label: "الكل", Icon: LayoutGrid },
  { id: "in_progress", label: "في تقدم", Icon: Play },
  { id: "completed", label: "مكتملة", Icon: Check },
  { id: "not_started", label: "لم تبدأ", Icon: Circle },
  { id: "favorites", label: "المفضلة", Icon: Star },
];

const SORT_OPTIONS = [
  { value: "newest", label: "الأحدث" },
  { value: "oldest", label: "الأقدم" },
  { value: "progress_high", label: "الأعلى تقدماً" },
  { value: "progress_low", label: "الأقل تقدماً" },
  { value: "title", label: "الاسم (أ–ي)" },
];

function prog(course) {
  const p = course?.progress;
  const completed = p?.completedLessons ?? 0;
  const total = p?.totalLessons ?? 0;
  const pct =
    typeof p?.percentage === "number"
      ? Math.min(100, Math.max(0, p.percentage))
      : total > 0
        ? Math.round((completed / total) * 100)
        : 0;
  return { completed, total, pct };
}

function isCourseCompleted(course) {
  if (course?.courseCompletedAt) return true;
  const { pct } = prog(course);
  return !course?.isTestingEnabled && pct >= 100;
}

function courseStatus(course) {
  if (isCourseCompleted(course)) return "completed";
  const { completed, total, pct } = prog(course);
  if (total > 0 && completed === 0) return "not_started";
  if (pct > 0) return "in_progress";
  return "not_started";
}

function testingInfo(course) {
  if (!course?.isTestingEnabled) return null;
  if (isCourseCompleted(course)) {
    return { tone: "done", label: "اكتمل الاختبار النهائي" };
  }
  const { completed, total } = prog(course);
  if (total > 0 && completed >= total) {
    return { tone: "pending", label: "بانتظار الاختبار النهائي" };
  }
  return { tone: "included", label: "يتضمن اختبار نهائي" };
}

function formatJoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", { dateStyle: "medium" }).format(d);
}

function courseHaystack(course) {
  return [course?.title, course?.description].filter(Boolean).join(" ").toLowerCase();
}

function sortCourses(list, sortBy) {
  const arr = [...list];
  arr.sort((a, b) => {
    if (sortBy === "progress_high") return prog(b).pct - prog(a).pct;
    if (sortBy === "progress_low") return prog(a).pct - prog(b).pct;
    if (sortBy === "title") return String(a.title || "").localeCompare(String(b.title || ""), "ar");
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    if (sortBy === "oldest") return ta - tb;
    return tb - ta;
  });
  return arr;
}

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeFavorites(ids) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function statusUi(status) {
  if (status === "completed") {
    return { label: "مكتملة", className: "fc-course-card__badge--done", Icon: Check };
  }
  if (status === "in_progress") {
    return { label: "في تقدم", className: "fc-course-card__badge--active", Icon: Play };
  }
  return { label: "لم تبدأ بعد", className: "fc-course-card__badge--idle", Icon: Circle };
}

function ctaLabel(status) {
  if (status === "completed") return "مراجعة الدورة";
  if (status === "not_started") return "ابدأ الدورة";
  return "متابعة التعلم";
}

function StatSegment({ tone, Icon, value, label, loading }) {
  return (
    <div className={`fc-stat-segment fc-stat-segment--${tone}`}>
      <span className="fc-stat-segment__icon" aria-hidden>
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="fc-stat-segment__copy">
        {loading ? (
          <HubMetricSkeleton variant="stat" />
        ) : (
          <strong className="fc-stat-segment__value">{value}</strong>
        )}
        <span className="fc-stat-segment__label">{label}</span>
      </div>
    </div>
  );
}

function CourseCard({ course, isFavorite, onToggleFavorite }) {
  const { completed, total, pct } = prog(course);
  const status = courseStatus(course);
  const test = testingInfo(course);
  const lastTouch = formatJoDate(course.updatedAt || course.courseCompletedAt);
  const cover = course.coverImage?.trim() || null;
  const badge = statusUi(status);
  const BadgeIcon = badge.Icon;

  return (
    <article
      className={[
        "fc-course-card fc-surface-3d fc-surface-3d--soft",
        status === "completed" ? "fc-course-card--completed" : "",
        test?.tone === "pending" ? "fc-course-card--test-pending" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="fc-course-card__media">
        {cover ? (
          <img src={cover} alt="" className="fc-course-card__thumb" loading="lazy" />
        ) : (
          <div className="fc-course-card__thumb fc-course-card__thumb--placeholder" aria-hidden>
            <BookOpen size={32} strokeWidth={1.6} />
          </div>
        )}
        <span className={`fc-course-card__badge ${badge.className}`}>
          <BadgeIcon size={12} strokeWidth={2.4} aria-hidden />
          {badge.label}
        </span>
        <button
          type="button"
          className={`fc-course-card__fav${isFavorite ? " is-active" : ""}`}
          onClick={() => onToggleFavorite(course.id)}
          aria-label={isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
          aria-pressed={isFavorite}
        >
          <Star size={16} strokeWidth={2} fill={isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <div className="fc-course-card__main">
        <div className="fc-course-card__head">
          <h3 className="fc-course-card__title">{course.title || "دورة بدون عنوان"}</h3>
          {test ? <span className={`fc-course-card__test fc-course-card__test--${test.tone}`}>{test.label}</span> : null}
        </div>

        <p className="fc-course-card__desc">
          {course.description?.trim() || "تابع دروس الفيديو وأكمل متطلبات الدورة خطوة بخطوة."}
        </p>

        <ul className="fc-course-card__meta">
          <li>
            <BookOpen size={14} strokeWidth={2} aria-hidden />
            {total > 0 ? `${total} درس` : "بدون دروس"}
          </li>
          <li>
            <span className="fc-course-card__meta-dot" aria-hidden>
              •
            </span>
            متوسط
          </li>
          {lastTouch ? (
            <li>
              <Clock size={14} strokeWidth={2} aria-hidden />
              آخر تحديث {lastTouch}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="fc-course-card__aside">
        <div className="fc-course-card__pct" aria-hidden>
          {pct}%
        </div>
        <div
          className="fc-course-card__progress"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`التقدم ${pct}%`}
        >
          <span
            className={`fc-course-card__progress-fill${status === "completed" ? " fc-course-card__progress-fill--done" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="fc-course-card__progress-sub">
          {completed}/{total} درس مكتمل
        </span>
        <Link className="fc-course-card__cta" to={`/dashboard/freelancer/courses/${course.id}`}>
          {ctaLabel(status)}
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

export default function FreelancerCoursesPage() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [searchInput, setSearchInput] = useState("");
  const [favorites, setFavorites] = useState(() => readFavorites());

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        const res = await freelancerListMyCoursesRequest();
        if (!mounted) return;
        setCourses(res?.data?.courses || []);
      } catch (err) {
        if (!mounted) return;
        toast.error(err?.response?.data?.message || "تعذر تحميل الدورات.");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [toast]);

  const toggleFavorite = useCallback((courseId) => {
    const id = String(courseId);
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeFavorites(next);
      return next;
    });
  }, []);

  const summary = useMemo(() => {
    const n = courses.length;
    if (n === 0) {
      return { count: 0, avgPct: 0, completedCourses: 0, inProgressCourses: 0 };
    }
    let sumPct = 0;
    let completedCourses = 0;
    let inProgressCourses = 0;
    for (const c of courses) {
      const { pct } = prog(c);
      sumPct += pct;
      const st = courseStatus(c);
      if (st === "completed") completedCourses += 1;
      else if (st === "in_progress") inProgressCourses += 1;
    }
    return {
      count: n,
      avgPct: Math.round(sumPct / n),
      completedCourses,
      inProgressCourses,
    };
  }, [courses]);

  const filterCounts = useMemo(() => {
    const counts = { all: courses.length, in_progress: 0, completed: 0, not_started: 0, favorites: 0 };
    for (const c of courses) {
      counts[courseStatus(c)] += 1;
      if (favorites.includes(String(c.id))) counts.favorites += 1;
    }
    return counts;
  }, [courses, favorites]);

  const displayedCourses = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    let list = courses;

    if (filter === "favorites") {
      list = list.filter((c) => favorites.includes(String(c.id)));
    } else if (filter !== "all") {
      list = list.filter((c) => courseStatus(c) === filter);
    }

    if (q) {
      list = list.filter((c) => courseHaystack(c).includes(q));
    }

    return sortCourses(list, sortBy);
  }, [courses, filter, searchInput, sortBy, favorites]);

  const emptyCopy = useMemo(() => {
    if (courses.length === 0) {
      return {
        title: "لا توجد دورات مسندة",
        sub: "عند إسناد دورة لحسابك ستظهر هنا مع التقدم والاختبار النهائي إن وُجد.",
      };
    }
    if (searchInput.trim()) {
      return {
        title: "لا توجد نتائج للبحث",
        sub: "جرّب كلمات أخرى أو امسح البحث لعرض القائمة كاملة.",
        actionLabel: "مسح البحث",
        onAction: () => setSearchInput(""),
      };
    }
    if (filter === "favorites") {
      return {
        title: "لا توجد دورات في المفضلة",
        sub: "اضغط على نجمة أي دورة لإضافتها إلى قائمتك المفضلة.",
      };
    }
    if (filter === "completed") {
      return {
        title: "لا توجد دورات مكتملة بعد",
        sub: "أكمل دروس الدورة والاختبار النهائي إن وُجد لتظهر هنا.",
      };
    }
    if (filter === "in_progress") {
      return {
        title: "لا توجد دورات قيد التنفيذ",
        sub: "ابدأ درساً في إحدى دوراتك لتظهر في هذا التبويب.",
      };
    }
    if (filter === "not_started") {
      return {
        title: "لا توجد دورات لم تبدأ",
        sub: "جميع دوراتك المسندة بدأت أو اكتملت.",
      };
    }
    return { title: "لا توجد نتائج", sub: "جرّب تبويباً أو تصفية أخرى." };
  }, [courses.length, filter, searchInput]);

  return (
    <DashboardHubPage className="fdash-page--courses">
      {loading ? (
        <CoursesPageSkeleton />
      ) : (
        <div className="fc-page fc-page--loaded">
          <header className="fc-surface fc-hero">
            <div className="fc-hero__copy">
              <h1 className="fc-hero__title">طور مهاراتك، وارتق بمستقبلك</h1>
              <p className="fc-hero__subtitle">
                استكشف الدورات المسندة لك، تابع تقدمك، وأكمل دروسك واختباراتك النهائية في تجربة تعلم
                متصلة بلوحة التحكم.
              </p>
              <div className="fc-hero__search">
                <Search size={18} strokeWidth={2} className="fc-hero__search-icon" aria-hidden />
                <input
                  type="search"
                  className="fc-hero__search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="ابحث عن دورة أو مهارة..."
                  aria-label="ابحث عن دورة"
                />
              </div>
            </div>
            <div className="fc-hero__art" aria-hidden>
              <DashboardBannerIllustration className="fc-hero__art-img" />
            </div>
          </header>

          <div className="fc-surface fc-stats-bar" aria-label="ملخص الدورات">
            <StatSegment tone="blue" Icon={BookOpen} value={summary.count} label="إجمالي الدورات" loading={loading} />
            <StatSegment
              tone="green"
              Icon={Check}
              value={summary.completedCourses}
              label="مكتملة"
              loading={loading}
            />
            <StatSegment
              tone="amber"
              Icon={Play}
              value={summary.inProgressCourses}
              label="في تقدم"
              loading={loading}
            />
            <StatSegment
              tone="purple"
              Icon={GraduationCap}
              value={`${summary.avgPct}%`}
              label="متوسط التقدم"
              loading={loading}
            />
          </div>

          <div className="fc-surface fc-toolbar">
            <nav className="fc-tabs-bar" aria-label="تصفية الدورات">
              {STATUS_TABS.map(({ id, label, Icon }) => {
                const active = filter === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`fc-tabs-bar__btn${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setFilter(id)}
                  >
                    <Icon size={15} strokeWidth={2.1} aria-hidden />
                    <span>{label}</span>
                    <span className="fc-tabs-bar__count">{filterCounts[id] ?? 0}</span>
                  </button>
                );
              })}
            </nav>
            <label className="fc-toolbar__sort">
              <span className="fc-toolbar__sort-prefix">ترتيب:</span>
              <select
                className="fc-toolbar__sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="ترتيب الدورات"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="fc-list" aria-labelledby="fc-courses-list-heading">
            <div className="fc-list__head">
              <h2 id="fc-courses-list-heading" className="fc-list__title">
                دوراتك
              </h2>
              {displayedCourses.length > 0 ? (
                <span className="fc-list__count">{displayedCourses.length} دورة</span>
              ) : null}
            </div>

            {displayedCourses.length === 0 ? (
              <DashboardHubEmpty
                title={emptyCopy.title}
                subtitle={emptyCopy.sub}
                actionLabel={emptyCopy.actionLabel}
                onAction={emptyCopy.onAction}
              />
            ) : (
              <div className="fc-list__items">
                {displayedCourses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    isFavorite={favorites.includes(String(course.id))}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </DashboardHubPage>
  );
}
