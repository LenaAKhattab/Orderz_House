/**
 * Trusted Super Admin identity approval received outside the platform.
 * Never stores ID file keys or document bytes.
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

function isManualIdentityApproved(row) {
  return Boolean(row) && String(row.status) === "approved";
}

module.exports = {
  MANUAL_IDENTITY_METHODS,
  COURSE_COMPLETION_REASON_CODES,
  loadManualIdentityVerification,
  isManualIdentityApproved,
};
