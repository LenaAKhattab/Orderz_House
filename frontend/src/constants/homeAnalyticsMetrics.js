import { ct } from "./constantsI18n.js";

function metric(key, tone) {
  const path = `homeAnalyticsMetrics.metrics.${key}`;
  return Object.freeze({
    key,
    get label() {
      return ct(`${path}.label`);
    },
    get sub() {
      return ct(`${path}.sub`);
    },
    get tooltip() {
      return ct(`${path}.tooltip`);
    },
    tone,
    get stripLabel() {
      return ct(`${path}.stripLabel`);
    },
  });
}

/**
 * Public homepage hero metrics — copy only (local DB).
 * Copy lives in the catalog (platformConstants.homeAnalyticsMetrics); the text fields are getters that follow the
 * non-English UI branch (Arabic, or the active de / nl / ro locale) — unchanged for Arabic / English.
 * @type {Record<'active'|'views'|'availableOrders'|'completedOrders', {
 *   key: 'active'|'views'|'availableOrders'|'completedOrders',
 *   label: string,
 *   sub: string,
 *   tooltip: string,
 *   tone: 'active'|'visitors'|'available'|'completed',
 *   stripLabel: string,
 * }>}
 */
export const HOME_PUBLIC_METRICS = Object.freeze({
  active: metric("active", "active"),
  views: metric("views", "visitors"),
  availableOrders: metric("availableOrders", "available"),
  completedOrders: metric("completedOrders", "completed"),
});

/** Hero strip display order (RTL). */
export const HOME_HERO_METRICS_ORDER = Object.freeze([
  HOME_PUBLIC_METRICS.views,
  HOME_PUBLIC_METRICS.active,
  HOME_PUBLIC_METRICS.completedOrders,
  HOME_PUBLIC_METRICS.availableOrders,
]);

/** Super Admin — collapsible help (platform settings) */
export const HOME_METRICS_ADMIN_HELP = Object.freeze({
  get title() {
    return ct("homeAnalyticsMetrics.adminHelp.title");
  },
  get visitors() {
    return ct("homeAnalyticsMetrics.adminHelp.visitors");
  },
  get active() {
    return ct("homeAnalyticsMetrics.adminHelp.active");
  },
});

/** @deprecated Use HOME_METRICS_ADMIN_HELP — kept for legacy imports */
export const HOME_METRICS_ADMIN_EXPLAINER = Object.freeze({
  get title() {
    return HOME_METRICS_ADMIN_HELP.title;
  },
  note: "",
  visitors: Object.freeze({
    get term() {
      return HOME_PUBLIC_METRICS.views.label;
    },
    get body() {
      return HOME_METRICS_ADMIN_HELP.visitors;
    },
  }),
  active: Object.freeze({
    get term() {
      return HOME_PUBLIC_METRICS.active.label;
    },
    get body() {
      return ct("homeAnalyticsMetrics.adminHelp.activeBody");
    },
  }),
  whyDiffer: "",
});
