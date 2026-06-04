import { useState } from "react";

/** Collapsed-by-default help for homepage metric toggles. */
export default function HomeMetricsHelpCollapsible({ title, visitorsLine, activeLine }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`sa-metrics-help${expanded ? " sa-metrics-help--open" : ""}`}>
      <button
        type="button"
        className="sa-metrics-help__trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="sa-metrics-help__title">{title}</span>
        <span className="sa-metrics-help__chevron" aria-hidden>
          {expanded ? "▾" : "◂"}
        </span>
      </button>
      {expanded ? (
        <ul className="sa-metrics-help__list">
          <li>{visitorsLine}</li>
          <li>{activeLine}</li>
        </ul>
      ) : null}
    </div>
  );
}
