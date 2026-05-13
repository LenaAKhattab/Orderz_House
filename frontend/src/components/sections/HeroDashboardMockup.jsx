import { useEffect, useState } from "react";
import {
  FALLBACK_DEMO,
  resolveNumber,
  resolveProjectNumber,
  showAnalyticsSkeleton,
  showProjectSkeleton,
} from "./heroHomeStatUtils";

/** Auto-rotate dashboard tabs (ms) */
const ROTATE_INTERVAL_MS = 3600;

/** Page 1 — analytics only */
const ANALYTICS_STATS = [
  { key: "views", label: "مشاهدات", demo: FALLBACK_DEMO.views, tone: "purple" },
  { key: "active", label: "مستخدمون نشطون", demo: FALLBACK_DEMO.activeUsers, tone: "blue" },
];

/** Page 2 — project pipeline only (order: مفتوحة, قيد التنفيذ, then مكتملة full row) */
const PROJECT_STATS = [
  { key: "open", label: "مفتوحة", demo: FALLBACK_DEMO.open, tone: "orange" },
  { key: "inProgress", label: "قيد التنفيذ", demo: FALLBACK_DEMO.inProgress, tone: "gold" },
  { key: "completed", label: "مكتملة", demo: FALLBACK_DEMO.completed, tone: "green", fullWidth: true },
];

function IconEye({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconUsers({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCheckCircle({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconInbox({ className }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22 12h-6l-2-3h-4L8 12H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M5.45 5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-7A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StatIcon({ k }) {
  const ic = "block h-5 w-5";
  if (k === "views") return <IconEye className={ic} />;
  if (k === "active") return <IconUsers className={ic} />;
  if (k === "completed") return <IconCheckCircle className={ic} />;
  if (k === "inProgress") return <IconClock className={ic} />;
  return <IconInbox className={ic} />;
}

function IconHome({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconFolder({ className }) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function statDisplayValue({ mode, row, statsPayload }) {
  if (mode === "projects") {
    if (showProjectSkeleton(statsPayload)) return "…";
    return resolveProjectNumber(statsPayload, row.key, row.demo);
  }
  if (showAnalyticsSkeleton(statsPayload, row.key)) return "…";
  return resolveNumber(statsPayload, row.key, row.demo);
}

function StatCards({ stats, statsPayload, mode }) {
  const gridClass =
    mode === "analytics" ? "home-hero__dash-stats home-hero__dash-stats--analytics" : "home-hero__dash-stats home-hero__dash-stats--projects";

  return (
    <div className="home-hero__dash-panel">
      <div className={gridClass}>
        {stats.map((row) => (
          <div
            key={row.key}
            className={`home-hero__dash-stat home-hero__dash-stat--${row.tone} ${row.fullWidth ? "home-hero__dash-stat--full" : ""}`}
          >
            <div className="home-hero__dash-stat-top">
              <span className="home-hero__dash-stat-ic" aria-hidden="true">
                <StatIcon k={row.key} />
              </span>
              <span className="home-hero__dash-stat-label">{row.label}</span>
            </div>
            <div className="home-hero__dash-stat-value-wrap">
              <span className="home-hero__dash-stat-value">{statDisplayValue({ mode, row, statsPayload })}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HeroDashboardMockup({ statsPayload }) {
  const [page, setPage] = useState("analytics");
  const [rotatePaused, setRotatePaused] = useState(false);
  /** Bump to reset the auto-rotate timer after manual tab selection */
  const [rotateEpoch, setRotateEpoch] = useState(0);

  useEffect(() => {
    if (rotatePaused) return undefined;
    const id = window.setInterval(() => {
      setPage((p) => (p === "analytics" ? "projects" : "analytics"));
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [rotatePaused, rotateEpoch]);

  const selectPage = (next) => {
    setPage(next);
    setRotateEpoch((n) => n + 1);
  };

  const headSub =
    page === "analytics" ? "مؤشرات الزوار والنشاط على المنصة" : "حالة الطلبات والمشاريع في لمحة";

  return (
    <div className="home-hero__dash-stage">
      <div className="home-hero__dash-glow" aria-hidden="true" />
      <div className="home-hero__dash-rings" aria-hidden="true">
        <span className="home-hero__dash-ring home-hero__dash-ring--a" />
        <span className="home-hero__dash-ring home-hero__dash-ring--b" />
      </div>

      <div
        className="home-hero__dash"
        role="region"
        aria-label="معاينة لوحة تحكم"
        onMouseEnter={() => setRotatePaused(true)}
        onMouseLeave={() => setRotatePaused(false)}
      >
        <div className="home-hero__dash-body">
          <aside className="home-hero__dash-side" aria-label="أقسام لوحة التحكم">
            <button
              type="button"
              className={`home-hero__dash-side-btn ${page === "analytics" ? "home-hero__dash-side-btn--on home-hero__dash-side-btn--analytics" : "home-hero__dash-side-btn--idle"}`}
              onClick={() => selectPage("analytics")}
              aria-pressed={page === "analytics"}
              title="نظرة عامة والتحليلات"
            >
              <IconHome className="home-hero__dash-side-ic" />
            </button>
            <button
              type="button"
              className={`home-hero__dash-side-btn ${page === "projects" ? "home-hero__dash-side-btn--on home-hero__dash-side-btn--projects" : "home-hero__dash-side-btn--idle"}`}
              onClick={() => selectPage("projects")}
              aria-pressed={page === "projects"}
              title="المشاريع والطلبات"
            >
              <IconFolder className="home-hero__dash-side-ic" />
            </button>
          </aside>

          <div className="home-hero__dash-main" dir="rtl">
            <header className="home-hero__dash-head">
              <div className="home-hero__dash-head-text">
                <p className="home-hero__dash-welcome">مرحباً بك</p>
                <p className="home-hero__dash-sub" aria-live="polite">
                  {headSub}
                </p>
              </div>
            </header>

            <div className="home-hero__dash-panels home-hero__dash-panels--rotate">
              <div
                className={`home-hero__dash-panel-layer ${page === "analytics" ? "is-active" : ""}`}
                aria-hidden={page !== "analytics"}
              >
                <StatCards stats={ANALYTICS_STATS} statsPayload={statsPayload} mode="analytics" />
              </div>
              <div
                className={`home-hero__dash-panel-layer ${page === "projects" ? "is-active" : ""}`}
                aria-hidden={page !== "projects"}
              >
                <StatCards stats={PROJECT_STATS} statsPayload={statsPayload} mode="projects" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
