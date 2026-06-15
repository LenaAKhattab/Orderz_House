/** Resolve a nav or breadcrumb label from labelKey (preferred) or legacy label. */
export function resolveNavLabel(item, t) {
  if (!item) return "";
  if (item.labelKey) return t(item.labelKey);
  if (item.label) return item.label;
  return "";
}

/** Join breadcrumb translation keys into a trail string. */
export function formatBreadcrumbTrail(keys, t) {
  if (!Array.isArray(keys) || !keys.length) return "";
  return keys.map((key) => t(key)).join(" › ");
}

/** Resolve a breadcrumb crumb label from labelKey (preferred) or legacy label. */
export function resolveBreadcrumbLabel(crumb, t) {
  if (!crumb) return "";
  if (crumb.labelKey) return t(crumb.labelKey);
  return String(crumb.label || "").trim();
}
