/** Map legacy oh-badge classes to shared fdash-badge tokens. */
export function fdashBadgeClassFromOh(ohClassName) {
  const c = String(ohClassName || "");
  if (c.includes("success")) return "fdash-badge fdash-badge--success";
  if (c.includes("info")) return "fdash-badge fdash-badge--info";
  if (c.includes("warning")) return "fdash-badge fdash-badge--warning";
  if (c.includes("danger")) return "fdash-badge fdash-badge--danger";
  return "fdash-badge fdash-badge--neutral";
}
