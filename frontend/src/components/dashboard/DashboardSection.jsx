import { forwardRef } from "react";

/**
 * White card section with optional head row (title, description, actions slot).
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {string} [p.title]
 * @param {string} [p.description]
 * @param {import("react").ReactNode} [p.actions]
 * @param {string} [p.className]
 */
const DashboardSection = forwardRef(function DashboardSection(
  { title, description, actions, children, className = "", ...rest },
  ref,
) {
  const hasHead = Boolean(title || description || actions);

  const cardShell =
    "rounded-[length:var(--dash-surface-radius,18px)] border border-[color:var(--dash-card-border)] bg-white shadow-[var(--dash-card-shadow)]";

  return (
    <section
      ref={ref}
      data-dashboard-section
      className={`dash-ui-section ${cardShell} mb-5 w-full min-w-0 p-5 text-start sm:p-6 sm:pb-7 ${className}`.trim()}
      {...rest}
    >
      {hasHead ? (
        <div className="dash-ui-section__head mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="dash-ui-section__titles min-w-0 flex-[1_1_200px]">
            {title ? (
              <h2 className="dash-ui-section__title m-0 text-lg font-bold tracking-tight text-slate-900 sm:text-[1.06rem]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="dash-ui-section__desc mt-1.5 text-[0.84rem] leading-relaxed text-slate-500">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="dash-ui-section__actions shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className="dash-ui-section__body min-w-0">{children}</div>
    </section>
  );
});

export default DashboardSection;
