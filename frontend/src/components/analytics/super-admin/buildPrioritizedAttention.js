import { formatInt } from "./superAdminHomeBundleUi";
import { ATTENTION_SCOPE } from "./dashboardMetricScope";
import { pt } from "../../../i18n/activeLocale";
import { legacyArabicUiLocale } from "../../../admin/adminLocale";

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
  [SEVERITY.urgent]: { icon: "🔴", labelKey: "urgent" },
  [SEVERITY.medium]: { icon: "🟡", labelKey: "medium" },
  [SEVERITY.info]: { icon: "🔵", labelKey: "info" },
};

export function buildPrioritizedAttention(attentionData) {
  // Copy was Arabic in both AR and EN UIs (kept); German / Dutch / Romanian get their own.
  const loc = legacyArabicUiLocale();
  const alerts = (attentionData?.alerts || [])
    .filter((a) => Number(a.count) > 0)
    .map((a) => {
      const severity = ALERT_SEVERITY[a.key] ?? SEVERITY.medium;
      const meta = SEVERITY_META[severity];
      return {
        ...a,
        severity,
        severityIcon: meta.icon,
        severityLabel: pt(`platformAdmin.analytics.attention.severity.${meta.labelKey}`, undefined, loc),
        badgeCount: Number(a.count),
        description: pt(
          "platformAdmin.analytics.attention.awaitingFollowUp",
          { count: formatInt(a.count, loc) },
          loc,
        ),
        scopeLabel: ATTENTION_SCOPE,
      };
    });

  return alerts.sort((a, b) => b.severity - a.severity || Number(b.count) - Number(a.count));
}
