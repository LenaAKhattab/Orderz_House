import { forwardRef, useState } from "react";

/**
 * Collapsible dashboard section — matches Super Admin control-center pattern.
 * @param {{ title: string; description?: string; defaultOpen?: boolean; children: import("react").ReactNode; id?: string }} p
 */
const PlanCollapsibleSection = forwardRef(function PlanCollapsibleSection(
  { title, description, defaultOpen = false, children, id, className = "" },
  ref,
) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      ref={ref}
      id={id}
      className={`dash-ui-section dash-ui-surface--soft oh-sapl-collapse mb-5 w-full min-w-0 text-start ${open ? "" : "oh-sapl-collapse--closed"} ${className}`.trim()}
    >
      <button
        type="button"
        className="oh-sapl-collapse__trigger"
        aria-expanded={open}
        aria-controls={id ? `${id}-body` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="oh-sapl-collapse__head-copy">
          <h2 className="oh-sapl-collapse__title">{title}</h2>
          {description ? <p className="oh-sapl-collapse__desc">{description}</p> : null}
        </div>
        <span className="oh-sapl-collapse__chevron" aria-hidden>
          {open ? "▾" : "◂"}
        </span>
      </button>
      {open ? (
        <div id={id ? `${id}-body` : undefined} className="oh-sapl-collapse__body">
          {children}
        </div>
      ) : null}
    </section>
  );
});

export default PlanCollapsibleSection;
