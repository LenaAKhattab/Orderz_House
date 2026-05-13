import {
  FALLBACK_DEMO,
  statDisplayValueAnalytics,
  statDisplayValueProjects,
} from "./heroHomeStatUtils";
import "./home-hero-metrics.css";

/** RTL grid order: first item = visual right (مفتوحة … مستخدمون). */
const STRIP_STATS = [
  { key: "open", label: "مفتوحة", hint: "طلبات بحاجة لبدء", demo: FALLBACK_DEMO.open, tone: "orange", kind: "project" },
  { key: "inProgress", label: "قيد التنفيذ", hint: "طلبات جارية", demo: FALLBACK_DEMO.inProgress, tone: "gold", kind: "project" },
  { key: "completed", label: "مكتملة", hint: "طلبات منجزة", demo: FALLBACK_DEMO.completed, tone: "green", kind: "project" },
  { key: "views", label: "مشاهدات", hint: "هذا الأسبوع", demo: FALLBACK_DEMO.views, tone: "blue", kind: "analytics" },
  { key: "active", label: "مستخدمون نشطون", hint: "هذا الأسبوع", demo: FALLBACK_DEMO.activeUsers, tone: "purple", kind: "analytics" },
];

function displayForRow(row, statsPayload) {
  if (row.kind === "project") return statDisplayValueProjects(row, statsPayload);
  return statDisplayValueAnalytics(row, statsPayload);
}

export default function HeroStatsStrip({ statsPayload }) {
  return (
    <div className="home-hero-metrics w-full min-w-0" role="group" aria-label="إحصائيات المنصة">
      {STRIP_STATS.map((row) => (
        <div key={row.key} className="home-hero-metrics__item min-w-0">
          <p className="home-hero-metrics__value">
            {displayForRow(row, statsPayload)}
          </p>
          <div className="home-hero-metrics__text w-full min-w-0">
            <p className="home-hero-metrics__label">{row.label}</p>
            <p className="home-hero-metrics__hint">{row.hint}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
