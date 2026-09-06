/**
 * OrderzHouse ↔ Bildazo writer-link (Phase 0B).
 * Consent copy is provisional product text — not counsel-approved legal language.
 */

const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION = "2026-08-18-v1";

const ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR =
  "أوافق على شروط نشر المقالات وربطها بحساب الكاتب في Bildazo، وأقر بأن المقال المقبول قد يتم إرساله للمراجعة والنشر على Bildazo باسمي.";

const BILDAZO_AUTHOR_LINK_FLOWS = Object.freeze(["new_account", "existing_account"]);

const BILDAZO_AUTHOR_LINK_STATUSES = Object.freeze([
  "not_started",
  "pending_new_account",
  "pending_existing_account",
  "pending_external_verification",
  "pending_manual_link",
  "linked",
  "needs_manual_review",
  "failed",
  "blocked",
]);

const BILDAZO_PENDING_UPDATE_STATUSES = Object.freeze([
  "not_started",
  "pending_new_account",
  "pending_existing_account",
  "pending_external_verification",
  "pending_manual_link",
  "needs_manual_review",
  "failed",
]);

const BILDAZO_AUTHOR_LINK_REQUIRED_AR =
  "يرجى إنشاء أو ربط حساب الكاتب في Bildazo قبل التقديم على المقالات.";

const BILDAZO_AUTHOR_LINK_ERROR_CODES = Object.freeze({
  BILDAZO_AUTHOR_LINK_REQUIRED: "BILDAZO_AUTHOR_LINK_REQUIRED",
  BILDAZO_AUTHOR_LINK_INVALID: "BILDAZO_AUTHOR_LINK_INVALID",
  BILDAZO_AUTHOR_EMAIL_UNVERIFIED: "BILDAZO_AUTHOR_EMAIL_UNVERIFIED",
  BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED: "BILDAZO_AUTHOR_PASSWORD_NOT_ALLOWED",
  BILDAZO_AUTHOR_ALREADY_LINKED: "BILDAZO_AUTHOR_ALREADY_LINKED",
  BILDAZO_AUTHOR_GATE_SCHEMA_MISSING: "BILDAZO_AUTHOR_GATE_SCHEMA_MISSING",
  BILDAZO_AUTHOR_LINK_BLOCKED: "BILDAZO_AUTHOR_LINK_BLOCKED",
  BILDAZO_AUTHOR_LINK_CONFIRM_REQUIRED: "BILDAZO_AUTHOR_LINK_CONFIRM_REQUIRED",
  BILDAZO_AUTHOR_IDENTIFIER_IN_USE: "BILDAZO_AUTHOR_IDENTIFIER_IN_USE",
  BILDAZO_AUTHOR_LINK_NOT_FOUND: "BILDAZO_AUTHOR_LINK_NOT_FOUND",
  BILDAZO_AUTHOR_SENSITIVE_FIELD: "BILDAZO_AUTHOR_SENSITIVE_FIELD",
  BILDAZO_AUTHOR_CHANGE_CONFIRM_REQUIRED: "BILDAZO_AUTHOR_CHANGE_CONFIRM_REQUIRED",
  BILDAZO_AUTHOR_CHANGE_NOT_LINKED: "BILDAZO_AUTHOR_CHANGE_NOT_LINKED",
  BILDAZO_AUTHOR_CHANGE_UNSUPPORTED: "BILDAZO_AUTHOR_CHANGE_UNSUPPORTED",
  BILDAZO_SYNC_CONFIG_MISSING: "BILDAZO_SYNC_CONFIG_MISSING",
  BILDAZO_SYNC_DISABLED: "BILDAZO_SYNC_DISABLED",
  BILDAZO_SYNC_TIMEOUT: "BILDAZO_SYNC_TIMEOUT",
  BILDAZO_SYNC_NETWORK: "BILDAZO_SYNC_NETWORK",
  BILDAZO_SYNC_ENDPOINT_MISSING: "BILDAZO_SYNC_ENDPOINT_MISSING",
  BILDAZO_SYNC_ACCOUNT_UNAVAILABLE: "BILDAZO_SYNC_ACCOUNT_UNAVAILABLE",
  BILDAZO_SYNC_INVALID_CREDENTIALS: "BILDAZO_SYNC_INVALID_CREDENTIALS",
});

/** Allowlisted public failure codes — never include secrets or raw HTTP bodies. */
const BILDAZO_PUBLIC_FAILURE_CODES = Object.freeze({
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ENDPOINT_UNAVAILABLE: "ENDPOINT_UNAVAILABLE",
  CONFIG_MISSING: "CONFIG_MISSING",
  TIMEOUT: "TIMEOUT",
  NETWORK: "NETWORK",
  ACCOUNT_UNAVAILABLE: "ACCOUNT_UNAVAILABLE",
  SYNC_FAILED: "SYNC_FAILED",
});

function mapBildazoLinkFailureCode(status, lastError) {
  if (String(status || "") !== "failed") return null;
  const raw = String(lastError || "");
  const upper = raw.toUpperCase();
  const lower = raw.toLowerCase();
  if (upper.includes("INVALID_CREDENTIALS") || lower.includes("invalid email or password")) {
    return BILDAZO_PUBLIC_FAILURE_CODES.INVALID_CREDENTIALS;
  }
  if (
    upper.includes("ACCOUNT_UNAVAILABLE") ||
    lower.includes("account is not available") ||
    upper.includes("ACCOUNT_BLOCKED") ||
    upper.includes("ACCOUNT_DELETED") ||
    upper.includes("ACCOUNT_DISABLED")
  ) {
    return BILDAZO_PUBLIC_FAILURE_CODES.ACCOUNT_UNAVAILABLE;
  }
  if (
    upper.includes("ENDPOINT_MISSING") ||
    lower.includes("endpoint is unavailable") ||
    lower.includes("not found") ||
    /\b404\b/.test(raw)
  ) {
    return BILDAZO_PUBLIC_FAILURE_CODES.ENDPOINT_UNAVAILABLE;
  }
  if (upper.includes("CONFIG_MISSING") || lower.includes("not configured")) {
    return BILDAZO_PUBLIC_FAILURE_CODES.CONFIG_MISSING;
  }
  if (upper.includes("TIMEOUT") || lower.includes("timed out")) {
    return BILDAZO_PUBLIC_FAILURE_CODES.TIMEOUT;
  }
  if (upper.includes("NETWORK")) {
    return BILDAZO_PUBLIC_FAILURE_CODES.NETWORK;
  }
  return BILDAZO_PUBLIC_FAILURE_CODES.SYNC_FAILED;
}

/** Super Admin status endpoint — never includes linked. */
const BILDAZO_ADMIN_REVIEW_STATUSES = Object.freeze([
  "needs_manual_review",
  "failed",
  "blocked",
]);

const BILDAZO_RECOMMENDED_WRITER_ROLE = Object.freeze({
  name: "writer",
  id: 2,
});

module.exports = {
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_VERSION,
  ORDERZHOUSE_BILDAZO_AUTHOR_TERMS_COPY_AR,
  BILDAZO_AUTHOR_LINK_FLOWS,
  BILDAZO_AUTHOR_LINK_STATUSES,
  BILDAZO_PENDING_UPDATE_STATUSES,
  BILDAZO_AUTHOR_LINK_REQUIRED_AR,
  BILDAZO_AUTHOR_LINK_ERROR_CODES,
  BILDAZO_PUBLIC_FAILURE_CODES,
  mapBildazoLinkFailureCode,
  BILDAZO_ADMIN_REVIEW_STATUSES,
  BILDAZO_RECOMMENDED_WRITER_ROLE,
};
