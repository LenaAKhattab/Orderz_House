import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { runDashboardShellDevLayoutCheck } from "./dashboardShellDevLayoutCheck.js";

/**
 * Page-level wrapper: fills the dashboard content area with shared horizontal padding (migrated routes).
 *
 * **Layout guardrail**
 * - Renders as a **column flex container** (`flex flex-col items-stretch`) so `DashboardPageHeader` and
 *   `DashboardSection` always share the same stretched width as the shell (matches admin Orders framing).
 * - **`DashboardShell` owns horizontal padding**; it does **not** cap the column with `max-w-*` or center
 *   the whole page with `mx-auto` — the shell is **`w-full`** of the outlet / main content region.
 * - **Do not** pass `max-w-*`, **`mx-auto`**, or **`container`** (or similar frame utilities) through
 *   the `className` prop — that would reintroduce a narrow centered page frame.
 * - If a form needs to be narrow, **narrow only the inner form** (or a wrapper inside sections), not
 *   the shell, header, or section cards.
 *
 * @param {{ children: import("react").ReactNode; className?: string }} p
 */
export default function DashboardShell({ children, className = "" }) {
  const shellRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!pathname.includes("/dashboard/super-admin")) return;

    const run = () => runDashboardShellDevLayoutCheck(shellRef.current, pathname);

    let raf1 = 0;
    let raf2 = 0;
    const schedule = () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(run);
      });
    };

    schedule();
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", run);
    };
  }, [pathname]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const c = String(className || "").trim();
    if (!c) return;
    if (c.includes("max-w-") || c.includes("mx-auto") || /\bcontainer\b/.test(c)) {
      console.warn(
        "[DashboardShell] Page passed `className` with width/layout utilities. " +
          "DashboardShell owns layout width/alignment — avoid page-level max-width / mx-auto / container on the shell. " +
          "Narrow inner content only (forms, tables), not the shell.",
        { className: c },
      );
    }
  }, [className]);

  /*
    Dev note: keep shell defaults as the only frame controls. Optional `className` is for non-width
    hooks (e.g. theme hooks like `oh-training-hub`), not for overriding max-width or centering.
  */
  return (
    <div
      ref={shellRef}
      className={`dash-ui-shell flex w-full min-w-0 max-w-full flex-col items-stretch box-border px-4 pb-12 pt-4 sm:px-5 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
