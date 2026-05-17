/**
 * Maps notification `type` strings to user preference categories.
 * Critical notifications always persist in-app regardless of toggles.
 */

const CRITICAL_TYPES = new Set([
  "user.account.deactivated",
  "user.account.suspended",
  "payment.client_order.succeeded",
  "payment.client_order.failed",
  "payment_success",
  "payment_failed",
  "subscription.company.activation.pending",
]);

const CRITICAL_PRIORITIES = new Set(["critical"]);

/** @type {Record<string, string>} */
const TYPE_CATEGORY = {
  "user.registered": "general",
  "user.account.activated": "general",
  "user.account.deactivated": "general",
  "user.account.suspended": "general",
  "user.account.reactivated": "general",

  "order.created": "orders",
  "order.assigned": "orders",
  "order.freelancer.assigned": "orders",
  "order.freelancer.rejected": "orders",
  "order.claim.withdrawn": "orders",
  "order.bid.submitted": "offers",
  "order.bid.updated": "offers",
  "order.bid.rejected": "offers",
  "order.bid.selected": "offers",
  "order.payment.started": "payments",
  "payment.client_order.succeeded": "payments",
  "payment.client_order.failed": "payments",
  "payment_success": "payments",
  "payment_failed": "payments",
  "payment_cancelled": "payments",

  "order.delivery.submitted": "delivery",
  "order.delivery.approved": "delivery",
  "order.revision.requested": "delivery",

  "subscription.assigned": "payments",
  "subscription.started": "payments",
  "subscription.company.activated": "payments",
  "subscription.company.activation.pending": "general",
  "subscription.payment.started": "payments",

  "financial_claim.created": "claims",
  "financial_claim.status.changed": "claims",
  "financial_claim.pricing.updated": "claims",
  "financial_claim.paid": "claims",

  "course.lesson.added": "courses",
  "course.assigned": "courses",
  "course.lesson.completed": "courses",
  "course.completed": "courses",

  "plan.created": "general",
  "plan.updated": "general",
  "plan.deleted": "general",

  "ad.created": "general",
  "ad.updated": "general",
  "ad.published": "general",
  "ad.unpublished": "general",
  "ad.scheduled": "general",
  "ad.expired": "general",

  "training.order.visible": "orders",
  "general.test": "general",
};

const PREFIX_CATEGORY = [
  ["order.", "orders"],
  ["payment.", "payments"],
  ["subscription.", "payments"],
  ["financial_claim.", "claims"],
  ["course.", "courses"],
  ["plan.", "general"],
  ["ad.", "general"],
];

function getCategoryForType(type) {
  const t = String(type || "").trim();
  if (!t) return "general";
  if (TYPE_CATEGORY[t]) return TYPE_CATEGORY[t];
  for (const [prefix, cat] of PREFIX_CATEGORY) {
    if (t.startsWith(prefix)) return cat;
  }
  return "general";
}

function isCriticalNotification(type, priority) {
  const t = String(type || "").trim();
  const p = String(priority || "").trim().toLowerCase();
  if (CRITICAL_TYPES.has(t)) return true;
  if (CRITICAL_PRIORITIES.has(p)) return true;
  return false;
}

/**
 * @param {Record<string, boolean> | null | undefined} prefs
 * @param {string} type
 * @param {string} [priority]
 */
function isAllowedByPreferences(prefs, type, priority) {
  if (isCriticalNotification(type, priority)) return true;
  const cat = getCategoryForType(type);
  const base = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? prefs : {};
  if (base[cat] === false) return false;
  return true;
}

module.exports = {
  getCategoryForType,
  isCriticalNotification,
  isAllowedByPreferences,
  TYPE_CATEGORY,
};
