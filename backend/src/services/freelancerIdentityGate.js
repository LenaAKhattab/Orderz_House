/**
 * Canonical freelancer identity verification gate.
 * Identity passes ONLY via approved platform KYC OR approved non-revoked manual verification.
 * Never treat company_approved / membership / account active alone as identity verification.
 */

const { pool } = require("../config/db");

const MANUAL_IDENTITY_METHODS = Object.freeze([
  "whatsapp",
  "in_person",
  "email",
  "company_docs",
  "other",
]);

const COURSE_COMPLETION_REASON_CODES = Object.freeze([
  "external_training",
  "manual_verification",
  "company_record",
  "admin_decision",
  "other",
]);

async function loadManualIdentityVerification(freelancerUserId, client = null) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT v.freelancer_user_id,
              v.status,
              v.verification_method,
              v.admin_note,
              v.verified_by_user_id,
              v.verified_at,
              v.revoked_by_user_id,
              v.revoked_at,
              v.revoke_reason,
              TRIM(CONCAT_WS(' ', vu.first_name, vu.father_name, vu.family_name)) AS verified_by_name
         FROM freelancer_identity_manual_verifications v
         LEFT JOIN users vu ON vu.id = v.verified_by_user_id
        WHERE v.freelancer_user_id = $1`,
      [Number(freelancerUserId)],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code === "42P01") return null;
    throw err;
  }
}

async function loadLatestPlatformKycRequest(freelancerUserId, client = null) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT id, status, submitted_at, reviewed_at, rejection_reason,
              resubmission_count, id_front_file_key, id_back_file_key
         FROM freelancer_account_activation_requests
        WHERE freelancer_user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [Number(freelancerUserId)],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code === "42P01" || err?.code === "42703") return null;
    throw err;
  }
}

function isManualIdentityApproved(row) {
  return Boolean(row) && String(row.status) === "approved" && !row.revoked_at;
}

/**
 * Pure resolver from already-loaded rows.
 * @returns {{
 *   verified: boolean,
 *   status: 'none'|'pending_review'|'rejected'|'approved',
 *   source: 'platform'|'manual_admin'|null,
 *   platformStatus: string,
 *   manualStatus: string|null,
 *   submittedAt: *,
 *   reviewedAt: *,
 *   hasPlatformDocuments: boolean,
 *   verificationMethod: string|null,
 *   canSubmit: boolean,
 *   canResubmit: boolean,
 * }}
 */
function resolveCanonicalIdentityState({ platformRow = null, manualRow = null } = {}) {
  const platformStatus = platformRow ? String(platformRow.status || "none") : "none";
  const manualApproved = isManualIdentityApproved(manualRow);
  const platformApproved = platformStatus === "approved";
  const verified = platformApproved || manualApproved;

  let status = "none";
  let source = null;
  if (manualApproved) {
    status = "approved";
    source = "manual_admin";
  } else if (platformApproved) {
    status = "approved";
    source = "platform";
  } else if (platformStatus === "pending_review") {
    status = "pending_review";
  } else if (platformStatus === "rejected") {
    status = "rejected";
  }

  const pending = status === "pending_review";
  const rejected = status === "rejected";
  const canSubmit = !verified && !pending;
  const canResubmit = !verified && !pending && (rejected || !platformRow);

  return {
    verified,
    status,
    source,
    platformStatus,
    manualStatus: manualRow ? String(manualRow.status || null) : null,
    submittedAt: platformRow?.submitted_at || null,
    reviewedAt: manualApproved
      ? manualRow.verified_at || null
      : platformRow?.reviewed_at || null,
    hasPlatformDocuments: Boolean(
      platformRow?.id_front_file_key || platformRow?.id_back_file_key,
    ),
    verificationMethod: manualApproved ? manualRow.verification_method || null : null,
    canSubmit,
    canResubmit,
    requestId: platformRow?.id != null ? String(platformRow.id) : null,
    rejectionReason:
      !verified && platformStatus === "rejected" ? platformRow?.rejection_reason || null : null,
    resubmissionCount: Number(platformRow?.resubmission_count || 0),
  };
}

async function getCanonicalIdentityState(freelancerUserId, { client = null } = {}) {
  const [platformRow, manualRow] = await Promise.all([
    loadLatestPlatformKycRequest(freelancerUserId, client),
    loadManualIdentityVerification(freelancerUserId, client),
  ]);
  return resolveCanonicalIdentityState({ platformRow, manualRow });
}

module.exports = {
  MANUAL_IDENTITY_METHODS,
  COURSE_COMPLETION_REASON_CODES,
  loadManualIdentityVerification,
  loadLatestPlatformKycRequest,
  isManualIdentityApproved,
  resolveCanonicalIdentityState,
  getCanonicalIdentityState,
};
