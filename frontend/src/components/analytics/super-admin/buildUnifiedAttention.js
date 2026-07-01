import { buildTopRisks } from "./buildTopRisks";
import { formatInt } from "./superAdminHomeBundleUi";
import { resolveSuperAdminAttentionLink, resolveSuperAdminDashboardHomeLink } from "./superAdminHomeDataUtils";

const SEVERITY = { urgent: 3, medium: 2, info: 1 };

const SEVERITY_META = {
  [SEVERITY.urgent]: { icon: "🔴", label: "عاجل" },
  [SEVERITY.medium]: { icon: "🟡", label: "متوسط" },
  [SEVERITY.info]: { icon: "🔵", label: "معلومة" },
};

/** Alert keys already represented by a Top Risk id */
const ALERT_COVERED_BY_RISK = {
  pending_activations: "pending-activation",
  orders_waiting_too_long: "stale-orders",
  pending_claims_review: "pending-claims",
  inactive_subscribed_freelancers: "inactive-freelancers",
  low_performing_courses: "low-courses",
};

const ALERT_SEVERITY = {
  pending_activations: SEVERITY.urgent,
  pending_or_failed_payments: SEVERITY.medium,
  pending_claims_review: SEVERITY.urgent,
  orders_waiting_too_long: SEVERITY.urgent,
  inactive_subscribed_freelancers: SEVERITY.medium,
  internal_orders_pending: SEVERITY.urgent,
  unread_notifications: SEVERITY.info,
  low_performing_courses: SEVERITY.info,
};

/**
 * Single executive attention list: Top Risks + non-duplicate alerts.
 */
export function buildUnifiedAttention({ intelligence, attention }) {
  const risks = buildTopRisks({ intelligence, attention }).map((risk) => ({
    ...risk,
    to: resolveSuperAdminDashboardHomeLink(risk.to),
  }));
  const coveredRiskIds = new Set(risks.map((r) => r.id));
  const items = [...risks];

  for (const alert of attention?.alerts || []) {
    const count = Number(alert.count) || 0;
    if (count <= 0) continue;

    const mappedRisk = ALERT_COVERED_BY_RISK[alert.key];
    if (mappedRisk && coveredRiskIds.has(mappedRisk)) continue;
    if (mappedRisk) coveredRiskIds.add(mappedRisk);

    const severity = ALERT_SEVERITY[alert.key] ?? SEVERITY.medium;
    const meta = SEVERITY_META[severity];

    items.push({
      id: `alert-${alert.key}`,
      severity,
      icon: meta.icon,
      label: meta.label,
      text: alert.title,
      description: `${formatInt(count)} بانتظار المتابعة`,
      to: resolveSuperAdminAttentionLink(alert.path, alert.key),
      count,
    });
  }

  return items.sort((a, b) => b.severity - a.severity || (Number(b.count) || 0) - (Number(a.count) || 0));
}
