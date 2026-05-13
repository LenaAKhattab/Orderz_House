/** Dev-only: compare header vs first section card geometry (no production code path). */

const THRESHOLD_PX = 2;

/**
 * @param {HTMLElement | null} shellEl
 * @param {string} pathname
 */
export function runDashboardShellDevLayoutCheck(shellEl, pathname) {
  if (!import.meta.env.DEV) return;
  if (!shellEl || !pathname.includes("/dashboard/super-admin")) return;

  const headerEl = shellEl.querySelector("[data-dashboard-header]");
  const sectionEl = shellEl.querySelector("[data-dashboard-section]");
  if (!headerEl || !sectionEl) return;

  const h = headerEl.getBoundingClientRect();
  const s = sectionEl.getBoundingClientRect();
  const diffLeft = h.left - s.left;
  const diffWidth = h.width - s.width;
  const diffRight = h.right - s.right;

  if (Math.abs(diffLeft) > THRESHOLD_PX || Math.abs(diffWidth) > THRESHOLD_PX) {
    console.warn("[DashboardShell dev layout] header vs first section mismatch", {
      pathname,
      header: { left: h.left, width: h.width, right: h.right },
      section: { left: s.left, width: s.width, right: s.right },
      diffLeft,
      diffWidth,
      diffRight,
    });
  }
}
