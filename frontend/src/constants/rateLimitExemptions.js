/** Allowed rate-limit exemption scopes (mirrors backend; auth scopes forbidden). */
export const RATE_LIMIT_EXEMPTION_SCOPES = [
  { value: "order_create", label: "إنشاء الطلبات (order_create)" },
  { value: "fake_order_create", label: "طلبات التدريب الوهمية (fake_order_create)" },
  { value: "training_bulk", label: "توليد تدريبي جماعي (training_bulk)" },
  { value: "admin_write", label: "كتابات الإدارة (admin_write)" },
];

export const RATE_LIMIT_EXEMPTION_MODES = [
  { value: "bypass", label: "تجاوز الحد (bypass)" },
  { value: "increased_limit", label: "حد أعلى (increased_limit)" },
];

export const RATE_LIMIT_EXEMPTION_FORBIDDEN_SCOPES = [
  "auth_login",
  "auth_register",
  "otp",
  "reset_password",
  "password_change",
  "deactivate_account",
  "payment",
  "stripe",
  "webhook",
  "global_api",
];

export function isAllowedRateLimitExemptionScope(scope) {
  return RATE_LIMIT_EXEMPTION_SCOPES.some((s) => s.value === scope);
}

export function exemptionStatus(row) {
  if (!row) return "unknown";
  if (!row.isActive) return "revoked";
  if (row.expiresAt) {
    const exp = new Date(row.expiresAt);
    if (Number.isFinite(exp.getTime()) && exp.getTime() <= Date.now()) return "expired";
  }
  return "active";
}
