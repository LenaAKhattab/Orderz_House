import { formatInt } from "./superAdminHomeBundleUi";
import { ATTENTION_SCOPE } from "./dashboardMetricScope";

const SEVERITY = { urgent: 3, medium: 2, info: 1 };

const ALERT_SEVERITY = {
  orders_waiting_too_long: SEVERITY.urgent,
  pending_activations: SEVERITY.urgent,
  pending_claims_review: SEVERITY.urgent,
  internal_orders_pending: SEVERITY.urgent,
  pending_or_failed_payments: SEVERITY.medium,
  inactive_subscribed_freelancers: SEVERITY.medium,
  low_performing_courses: SEVERITY.info,
  unread_notifications: SEVERITY.info,
};

const SEVERITY_META = {
  [SEVERITY.urgent]: { icon: "🔴", label: "عاجل" },
  [SEVERITY.medium]: { icon: "🟡", label: "متوسط" },
  [SEVERITY.info]: { icon: "🔵", label: "معلومة" },
};

export function buildPrioritizedAttention(attentionData) {
  const alerts = (attentionData?.alerts || [])
    .filter((a) => Number(a.count) > 0)
    .map((a) => {
      const severity = ALERT_SEVERITY[a.key] ?? SEVERITY.medium;
      const meta = SEVERITY_META[severity];
      return {
        ...a,
        severity,
        severityIcon: meta.icon,
        severityLabel: meta.label,
        badgeCount: Number(a.count),
        description: `${formatInt(a.count)} بانتظار المتابعة`,
        scopeLabel: ATTENTION_SCOPE,
      };
    });

  return alerts.sort((a, b) => b.severity - a.severity || Number(b.count) - Number(a.count));
}
