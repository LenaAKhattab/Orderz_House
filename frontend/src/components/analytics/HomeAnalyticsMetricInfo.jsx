import { useId, useState } from "react";

function InfoIcon() {
  return (
    <svg className="home-analytics-metric-info__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="0.9" fill="currentColor" />
    </svg>
  );
}

function MetricKindIcon({ kind }) {
  if (kind === "visitors") {
    return (
      <svg className="home-analytics-metric-info__kind-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
        <ellipse cx="10" cy="10" rx="3" ry="7" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3 10h14" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  return (
    <svg className="home-analytics-metric-info__kind-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3a4 4 0 00-4 4v1H5a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a4 4 0 00-4-4z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M8 14h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Label row: optional kind icon + text; optional info tooltip (admin only).
 * @param {{ label: string, tooltip?: string, tone?: 'visitors'|'active', className?: string, showInfo?: boolean }} p
 */
export function HomeAnalyticsMetricLabelRow({
  label,
  tooltip = "",
  tone = "visitors",
  className = "",
  showInfo = false,
}) {
  const tipId = useId();
  const [open, setOpen] = useState(false);

  return (
    <div className={`home-analytics-metric-label ${className} home-analytics-metric-label--${tone}`.trim()}>
      <MetricKindIcon kind={tone} />
      <span className="home-analytics-metric-label__text">{label}</span>
      {showInfo && tooltip ? (
        <span className={`home-analytics-metric-info${open ? " home-analytics-metric-info--open" : ""}`}>
          <button
            type="button"
            className="home-analytics-metric-info__btn"
            aria-label={`شرح: ${label}`}
            aria-expanded={open}
            aria-describedby={tipId}
            onClick={() => setOpen((v) => !v)}
            onBlur={(e) => {
              if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) setOpen(false);
            }}
          >
            <InfoIcon />
          </button>
          <span id={tipId} role="tooltip" className="home-analytics-metric-info__tip">
            {tooltip}
          </span>
        </span>
      ) : null}
    </div>
  );
}
