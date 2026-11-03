import { withCatalogLabels } from "./constantsI18n.js";

/**
 * `value` is the API code; `labelKey` the catalog key. The legacy `label` getter follows the non-English UI branch
 * (Arabic, or the active de / nl / ro locale).
 */
const optionRow = (group, value) =>
  withCatalogLabels({ value }, `rateLimitExemptions.${group}.${value}`, { label: "local" });

/** Allowed rate-limit exemption scopes (mirrors backend; auth scopes forbidden). */
export const RATE_LIMIT_EXEMPTION_SCOPES = ["order_create", "fake_order_create", "training_bulk", "admin_write"].map(
  (value) => optionRow("scopes", value),
);

export const RATE_LIMIT_EXEMPTION_MODES = ["bypass", "increased_limit"].map((value) => optionRow("modes", value));

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
