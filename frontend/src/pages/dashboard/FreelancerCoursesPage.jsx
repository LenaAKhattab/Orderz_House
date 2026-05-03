import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { freelancerListMyCoursesRequest } from "../../services/api";
import { useToast } from "../../components/ui/toastContext";

function prog(course) {
  const p = course?.progress;
  const completed = p?.completedLessons ?? 0;
  const total = p?.totalLessons ?? 0;
  const pct = typeof p?.percentage === "number" ? Math.min(100, Math.max(0, p.percentage)) : total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct };
}

export default function FreelancerCoursesPage() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const summary = useMemo(() => {
    const n = courses.length;
    if (n === 0) return { count: 0, avgPct: 0, completedCourses: 0 };
    let sumPct = 0;
    let completedCourses = 0;
    for (const c of courses) {
      const { pct } = prog(c);
      sumPct += pct;
      if (pct >= 100) completedCourses += 1;
    }
    return {
      count: n,
      avgPct: Math.round(sumPct / n),
      completedCourses,
    };
  }, [courses]);

  return (
    <div className="container page-content dash-shell freelancer-courses-page" dir="rtl">
      <div className="dash freelancer-courses-page__root">
        <header className="dash-hero dash-hero--elevated">
          <div className="dash-hero__copy">
            <p className="dash-hero__kicker">لوحة المستقل</p>
            <h1 className="dash-hero__title">الدورات التدريبية</h1>
            <p className="dash-hero__subtitle">
              دوراتك المسندة لك فقط: تابع التقدم في الدروس وافتح كل دورة لمتابعة المحتوى والإنجاز.
            </p>
          </div>
        </header>

        <div className="freelancer-courses-page__stats" aria-label="ملخص الدورات">
          <div className="freelancer-courses-page__stat">
            <span className="freelancer-courses-page__stat-label">عدد الدورات</span>
            <strong className="freelancer-courses-page__stat-value">{loading ? "—" : summary.count}</strong>
          </div>
          <div className="freelancer-courses-page__stat freelancer-courses-page__stat--accent">
            <span className="freelancer-courses-page__stat-label">متوسط الإنجاز</span>
            <strong className="freelancer-courses-page__stat-value">{loading ? "—" : `${summary.avgPct}%`}</strong>
          </div>
          <div className="freelancer-courses-page__stat freelancer-courses-page__stat--muted">
            <span className="freelancer-courses-page__stat-label">دورات مكتملة</span>
            <strong className="freelancer-courses-page__stat-value">{loading ? "—" : summary.completedCourses}</strong>
          </div>
        </div>

        <section className="dash-section freelancer-courses-page__list-section">
          <div className="dash-section__head">
            <h2 className="dash-section__title">دوراتك</h2>
          </div>
          <div className="dash-section__body freelancer-courses-page__list-body">
            {loading ? (
              <p className="help" style={{ margin: 0 }}>
                جارٍ تحميل الدورات…
              </p>
            ) : courses.length === 0 ? (
              <div className="dash-empty freelancer-courses-page__empty">
                <div className="dash-empty__icon" aria-hidden="true">
                  ◌
                </div>
                <div className="dash-empty__copy">
                  <h3 className="dash-empty__title">لا توجد دورات مسندة</h3>
                  <p className="dash-empty__subtitle">عند إسناد دورة لحسابك ستظهر هنا مع شريط التقدم وملخص الدروس.</p>
                </div>
              </div>
            ) : (
              <div className="cards-grid freelancer-courses-page__grid">
                {courses.map((course) => {
                  const { completed, total, pct } = prog(course);
                  return (
                    <article className="card freelancer-courses-page__card" key={course.id}>
                      <div className="freelancer-courses-page__card-top">
                        <h3 className="freelancer-courses-page__card-title">{course.title || "—"}</h3>
                        <span className="freelancer-courses-page__pct-badge" aria-label={`نسبة الإنجاز ${pct}%`}>
                          {pct}%
                        </span>
                      </div>
                      <p className="freelancer-courses-page__desc">{course.description?.trim() || "بدون وصف"}</p>
                      <div className="freelancer-courses-page__progress-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <span className="freelancer-courses-page__progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="freelancer-courses-page__meta help">
                        التقدم: {completed}/{total} درس
                      </p>
                      <Link className="btn btn-primary freelancer-courses-page__cta" to={`/dashboard/freelancer/courses/${course.id}`}>
                        متابعة الدورة
                      </Link>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
