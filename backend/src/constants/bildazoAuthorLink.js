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
  BILDAZO_SYNC_CONFIG_MISSING: "BILDAZO_SYNC_CONFIG_MISSING",
  BILDAZO_SYNC_DISABLED: "BILDAZO_SYNC_DISABLED",
  BILDAZO_SYNC_TIMEOUT: "BILDAZO_SYNC_TIMEOUT",
  BILDAZO_SYNC_NETWORK: "BILDAZO_SYNC_NETWORK",
});

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
  BILDAZO_ADMIN_REVIEW_STATUSES,
  BILDAZO_RECOMMENDED_WRITER_ROLE,
};
