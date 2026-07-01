/** Section / metric availability helpers for Super Admin home bundle. */

export const SA_ROUTES = {
  subscriptions: "/dashboard/super-admin/subscriptions",
  subscriptionsActivation: "/dashboard/super-admin/subscriptions/activation",
  financialClaims: "/dashboard/super-admin/financial-claims",
  /** Staff internal orders (admin/super-admin created) — not platform marketplace orders. */
  internalOrders: "/dashboard/super-admin/orders",
  courses: "/dashboard/super-admin/courses",
  notifications: "/dashboard/super-admin/notifications",
  admins: "/dashboard/super-admin/admins",
  ads: "/dashboard/super-admin/ads",
  editWebsite: "/dashboard/super-admin/edit-website",
  trainingOrders: "/dashboard/super-admin/training-orders",
};

export const ADMIN_DASHBOARD_ROUTES = {
  home: "/dashboard/admin",
  internalOrders: "/dashboard/admin/orders",
  createInternalOrder: "/dashboard/admin/orders/create",
  subscriptions: "/dashboard/admin/subscriptions",
  courses: "/dashboard/admin/courses",
  ads: "/dashboard/admin/ads",
  notifications: "/dashboard/admin/notifications",
};

/** Public marketplace — never use on dashboard home KPI/attention cards. */
export const PUBLIC_MARKETPLACE_ROUTE = "/orders";

const PUBLIC_WEBSITE_PREFIXES = ["/orders", "/plans", "/services", "/about", "/how-it-works", "/privacy", "/terms"];

/** Alert keys about platform pool orders — no dedicated super-admin management page. */
const PLATFORM_ORDER_ALERT_KEYS = new Set(["orders_waiting_too_long"]);

export function isPublicWebsitePath(path) {
  const p = String(path || "").trim();
  if (!p || p === "/") return true;
  return PUBLIC_WEBSITE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

export function isSuperAdminDashboardPath(path) {
  const p = String(path || "").trim();
  return p === "/dashboard/super-admin" || p.startsWith("/dashboard/super-admin/");
}

export function isAdminDashboardPath(path) {
  const p = String(path || "").trim();
  return p === "/dashboard/admin" || p.startsWith("/dashboard/admin/");
}

export function isStaffDashboardPath(path) {
  return isSuperAdminDashboardPath(path) || isAdminDashboardPath(path);
}

/**
 * Resolve a card/link target for super-admin dashboard home.
 * Only `/dashboard/super-admin/...` routes are allowed.
 */
export function resolveSuperAdminDashboardHomeLink(path) {
  const p = String(path || "").trim();
  if (!p || isPublicWebsitePath(p)) return null;
  if (isSuperAdminDashboardPath(p)) return p;
  return null;
}

/**
 * Resolve a card/link target for admin dashboard home.
 * Only `/dashboard/admin/...` routes are allowed.
 */
export function resolveAdminDashboardHomeLink(path, fallback = ADMIN_DASHBOARD_ROUTES.notifications) {
  const p = String(path || "").trim();
  if (!p || isPublicWebsitePath(p)) return fallback;
  if (isAdminDashboardPath(p)) return p;
  return fallback;
}

/**
 * Resolve attention-item links for super-admin home.
 * Returns null when the target is public or there is no staff page for the data.
 */
export function resolveSuperAdminAttentionLink(path, alertKey) {
  if (alertKey && PLATFORM_ORDER_ALERT_KEYS.has(alertKey)) return null;
  return resolveSuperAdminDashboardHomeLink(path);
}

/**
 * Resolve attention-item links for admin home (notifications, alerts).
 * Falls back to admin notifications when the link is missing or not an admin dashboard route.
 */
export function resolveAdminAttentionLink(path, fallback = ADMIN_DASHBOARD_ROUTES.notifications) {
  return resolveAdminDashboardHomeLink(path, fallback);
}

/** Platform marketplace order KPIs/summary cards — no staff management route. */
export function superAdminPlatformOrdersCardLink() {
  return null;
}

export function isPosthogUnavailable(posthog, meta = {}) {
  if (meta?.posthogError) return true;
  if (posthog && posthog.meta?.posthogError) return true;
  if (posthog && posthog.meta?.posthogConfigured === false) return true;
  return false;
}

export function isPosthogEventUnavailable(posthog, meta, eventKey) {
  if (isPosthogUnavailable(posthog, meta)) return true;
  if (!posthog || posthog.events == null) return true;
  if (eventKey && posthog.events[eventKey] === undefined) return true;
  return false;
}

export function sectionFailed(sectionErrors, sectionKey) {
  return Boolean(sectionErrors?.[sectionKey]);
}

export function getSectionPayload(intelligence, sectionKey) {
  return intelligence?.[sectionKey];
}

export function getSectionData(intelligence, sectionKey) {
  return intelligence?.[sectionKey]?.data;
}

export function sectionStatus({ intelligence, sectionKey, sectionErrors, loading, bundleLoaded }) {
  if (sectionFailed(sectionErrors, sectionKey)) return "failed";
  if (loading && !getSectionData(intelligence, sectionKey) && !bundleLoaded) return "loading";
  if (!bundleLoaded && !getSectionData(intelligence, sectionKey)) return "loading";
  return "ok";
}

/**
 * Build a metric item for MiniStatGrid.
 * @param {number|null|undefined} value — use null when unknown (not zero).
 */
export function metricItem({
  key,
  label,
  value,
  money = false,
  percent = false,
  hint,
  to,
  unavailable = false,
}) {
  const missing = unavailable || value === null || value === undefined || Number.isNaN(Number(value));
  return { key, label, value: missing ? null : value, money, percent, hint, to, missing };
}

export function pickDefined(...values) {
  for (const v of values) {
    if (v !== null && v !== undefined && !Number.isNaN(Number(v))) return v;
  }
  return null;
}
