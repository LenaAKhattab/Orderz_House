/** Section / metric availability helpers for Super Admin home bundle. */

export const SA_ROUTES = {
  subscriptions: "/dashboard/super-admin/subscriptions",
  subscriptionsActivation: "/dashboard/super-admin/subscriptions/activation",
  financialClaims: "/dashboard/super-admin/financial-claims",
  orders: "/dashboard/super-admin/orders",
  courses: "/dashboard/super-admin/courses",
  clients: "/dashboard/super-admin/orders",
};

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
