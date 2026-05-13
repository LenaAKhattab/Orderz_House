import "./home-hero-ipad-overview-analytics.css";

/** Mini spark SVGs (viewBox 0 0 40 14) — varied slopes, no flat lines */
const SPARK_NAVY = (
  <svg className="hi-oa__spark" viewBox="0 0 40 14" preserveAspectRatio="none" aria-hidden>
    <path
      d="M0,11 L6,9 L12,10 L18,6 L24,7 L30,3 L36,4 L40,2"
      fill="none"
      stroke="url(#hi-oa-sp-navy)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="nonScalingStroke"
    />
    <defs>
      <linearGradient id="hi-oa-sp-navy" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#2f3b65" stopOpacity="0.35" />
        <stop offset="1" stopColor="#76cfdf" stopOpacity="0.75" />
      </linearGradient>
    </defs>
  </svg>
);

const SPARK_CYAN = (
  <svg className="hi-oa__spark" viewBox="0 0 40 14" preserveAspectRatio="none" aria-hidden>
    <path
      d="M0,8 L7,10 L14,5 L21,7 L28,4 L34,6 L40,3"
      fill="none"
      stroke="url(#hi-oa-sp-cyan)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="nonScalingStroke"
    />
    <defs>
      <linearGradient id="hi-oa-sp-cyan" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#5ba8a8" />
        <stop offset="1" stopColor="#76cfdf" />
      </linearGradient>
    </defs>
  </svg>
);

const SPARK_TEAL = (
  <svg className="hi-oa__spark" viewBox="0 0 40 14" preserveAspectRatio="none" aria-hidden>
    <path
      d="M0,10 L8,7 L16,9 L24,4 L32,5 L40,2"
      fill="none"
      stroke="url(#hi-oa-sp-teal)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="nonScalingStroke"
    />
    <defs>
      <linearGradient id="hi-oa-sp-teal" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3d8a8a" />
        <stop offset="1" stopColor="#e8873a" stopOpacity="0.85" />
      </linearGradient>
    </defs>
  </svg>
);

const SERVICE_BARS = [
  { key: "dev", label: "برمجة", pct: 88, gradient: "linear-gradient(180deg, #6366f1 0%, #4f46b5 100%)" },
  { key: "design", label: "تصميم", pct: 62, gradient: "linear-gradient(180deg, #76cfdf 0%, #3d8a9e 100%)" },
  { key: "content", label: "محتوى", pct: 71, gradient: "linear-gradient(180deg, #5ba8a8 0%, #2f5c6a 100%)" },
  { key: "biz", label: "أعمال", pct: 48, gradient: "linear-gradient(180deg, #e8873a 0%, #c56a1c 100%)" },
  { key: "acad", label: "أكاديمي", pct: 36, gradient: "linear-gradient(180deg, #2f3b65 0%, #1a263f 100%)" },
];

const ACTIVITY_HEIGHTS = [42, 68, 55, 80, 52, 74, 48, 88, 62, 58, 72, 50];

/**
 * Premium compact analytics for the hero iPad «لوحة التحكم» preview (SVG + CSS only).
 */
export default function HeroIpadOverviewAnalytics() {
  return (
    <div className="hi-oa">
      <div className="hi-oa__kpis">
        <article className="hi-oa__kpi hi-oa__kpi--navy">
          <span className="hi-oa__kpi-label">الزيارات</span>
          <span className="hi-oa__kpi-value">١٢٫٤k</span>
          <div className="hi-oa__kpi-meta">
            <span className="hi-oa__kpi-delta hi-oa__kpi-delta--up">↑ ٩٪</span>
            {SPARK_NAVY}
          </div>
        </article>
        <article className="hi-oa__kpi hi-oa__kpi--cyan">
          <span className="hi-oa__kpi-label">الطلبات النشطة</span>
          <span className="hi-oa__kpi-value">١٢٤</span>
          <div className="hi-oa__kpi-meta">
            <span className="hi-oa__kpi-delta hi-oa__kpi-delta--up">↑ ٣٪</span>
            {SPARK_CYAN}
          </div>
        </article>
        <article className="hi-oa__kpi hi-oa__kpi--teal">
          <span className="hi-oa__kpi-label">الإيرادات</span>
          <span className="hi-oa__kpi-value">٤٬٢٨٠ د.أ</span>
          <div className="hi-oa__kpi-meta">
            <span className="hi-oa__kpi-delta hi-oa__kpi-delta--up">↑ ٦٪</span>
            {SPARK_TEAL}
          </div>
        </article>
      </div>

      <div className="hi-oa__chart-card">
        <div className="hi-oa__chart-head">
          <h3 className="hi-oa__chart-title">الطلبات الأسبوعية</h3>
          <p className="hi-oa__chart-caption">آخر ١٠ أيام</p>
        </div>
        <div className="hi-oa__chart-svg-wrap" dir="ltr">
          <svg className="hi-oa__chart-svg" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="hi-oa-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#76cfdf" stopOpacity="0.35" />
                <stop offset="55%" stopColor="#6366f1" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#2f3b65" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="hi-oa-line-stroke" x1="0" y1="0" x2="1" y2="0">
                <stop stopColor="#5eb8c9" />
                <stop offset="0.45" stopColor="#76cfdf" />
                <stop offset="1" stopColor="#6366f1" />
              </linearGradient>
            </defs>
            {/* subtle horizontal guides */}
            <line x1="0" y1="10" x2="100" y2="10" stroke="rgba(47,59,101,0.06)" strokeWidth="0.35" vectorEffect="nonScalingStroke" />
            <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(47,59,101,0.05)" strokeWidth="0.35" vectorEffect="nonScalingStroke" />
            <path
              d="M0,34 L0,26 L10,24 L20,27 L30,18 L40,21 L50,12 L60,15 L70,9 L80,11 L90,6 L100,8 L100,34 Z"
              fill="url(#hi-oa-area-fill)"
            />
            <path
              d="M0,26 L10,24 L20,27 L30,18 L40,21 L50,12 L60,15 L70,9 L80,11 L90,6 L100,8"
              fill="none"
              stroke="url(#hi-oa-line-stroke)"
              strokeWidth="1.1"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="nonScalingStroke"
            />
          </svg>
        </div>
      </div>

      <div className="hi-oa__row2">
        <div className="hi-oa__bars-card">
          <h3 className="hi-oa__mini-title">الخدمات الأكثر طلبًا</h3>
          <div className="hi-oa__bars" role="img" aria-label="أعمدة نسبية للتصنيفات">
            {SERVICE_BARS.map((b) => (
              <div
                key={b.key}
                className="hi-oa__bar"
                style={{ height: `${b.pct}%`, background: b.gradient }}
                title={b.label}
              />
            ))}
          </div>
        </div>
        <div className="hi-oa__ring-card">
          <h3 className="hi-oa__mini-title">معدل الإنجاز</h3>
          <div className="hi-oa__ring-body">
            <svg className="hi-oa__ring-svg" viewBox="0 0 36 36" aria-hidden>
              <defs>
                <linearGradient id="hi-oa-ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop stopColor="#76cfdf" />
                  <stop offset="1" stopColor="#2f3b65" />
                </linearGradient>
              </defs>
              <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(47,59,101,0.08)" strokeWidth="3.5" />
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                stroke="url(#hi-oa-ring-grad)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="72 100"
                pathLength="100"
                transform="rotate(-90 18 18)"
              />
            </svg>
            <div className="hi-oa__ring-legend">
              <span className="hi-oa__ring-value">٨٢٪</span>
              <p className="hi-oa__ring-sub">تسليم في الموعد</p>
            </div>
          </div>
        </div>
      </div>

      <div className="hi-oa__activity">
        <span className="hi-oa__activity-label">نشاط المستخدمين</span>
        <div className="hi-oa__activity-bars" aria-hidden>
          {ACTIVITY_HEIGHTS.map((h, i) => (
            <span key={i} className="hi-oa__activity-bar" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
