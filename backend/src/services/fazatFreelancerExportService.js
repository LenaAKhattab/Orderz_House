/**
 * FAZAT freelancer export eligibility — mirrors Orderz assignment gates:
 * - users: freelancer (legacy role or RBAC), is_active, email_verified
 * - subscriptionsService.canFreelancerTakeOrders / evaluateFreelancerTakeOrdersEligibility
 *   (current subscription, company_approved activation, payment, status, expiry, holds, activation fee)
 *
 * Does NOT invent separate training/KYC tables beyond company_approved (A11 activation).
 */
const { pool } = require("../config/db");
const { PARTNER_CODE, getFazatIntegrationConfig } = require("../config/fazatIntegration");
const {
  canFreelancerTakeOrders,
  getFreelancerIdentitySnapshot,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  SUBSCRIPTION_STATUSES,
} = require("./subscriptionsService");
const { getActivationFeeConfig } = require("./subscriptionActivationFeeService");
const { HOLD_REASON } = require("./freelancerAccountHoldsService");

const ALLOWED_RANKS = new Set(["UNAPPROVED", "APPROVED", "TRUSTED"]);

function clampLimit(limit) {
  return Math.min(Math.max(Number(limit) || 100, 1), 200);
}

function clampOffset(offset) {
  return Math.max(Number(offset) || 0, 0);
}

function freelancerRolePredicate(alias = "u") {
  const a = alias;
  return `(
    ${a}.role = 'freelancer'
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ${a}.id AND r.name = 'freelancer'
    )
  )`;
}

/**
 * SQL fragment aligning with evaluateFreelancerTakeOrdersEligibility on current subscription row `fs`.
 */
function subscriptionTakeOrdersSql(fsAlias = "fs") {
  const fs = fsAlias;
  const approved = SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED;
  const paid = SUBSCRIPTION_PAYMENT_STATUSES.PAID;
  const notRequired = SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED;
  const failed = SUBSCRIPTION_PAYMENT_STATUSES.FAILED;
  const cancelledPay = SUBSCRIPTION_PAYMENT_STATUSES.CANCELLED;
  const active = SUBSCRIPTION_STATUSES.ACTIVE;
  const assigned = SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED;
  return `
    (
      COALESCE(NULLIF(TRIM(LOWER(${fs}.activation_status)), ''), '${approved}') = '${approved}'
      AND (
        CASE
          WHEN COALESCE(NULLIF(TRIM(LOWER(${fs}.activation_status)), ''), '${approved}') = '${approved}'
            THEN COALESCE(NULLIF(TRIM(LOWER(${fs}.payment_status)), ''), '${notRequired}')
                 NOT IN ('${failed}', '${cancelledPay}')
          ELSE COALESCE(NULLIF(TRIM(LOWER(${fs}.payment_status)), ''), '${notRequired}')
               IN ('${paid}', '${notRequired}')
        END
      )
      AND LOWER(TRIM(${fs}.status)) IN ('${active}', '${assigned}')
      AND (${fs}.expiry_date IS NULL OR ${fs}.expiry_date > NOW())
    )
  `;
}

function noBlockingHoldSql(userAlias = "u") {
  return `
    NOT EXISTS (
      SELECT 1
      FROM freelancer_account_holds h
      WHERE h.freelancer_user_id = ${userAlias}.id
        AND h.cleared_at IS NULL
        AND h.reason_code = '${HOLD_REASON.STRIPE_SUBSCRIPTION_PAYMENT_FAILED}'
    )
  `;
}

async function activationFeeSatisfiedSql(userAlias = "u") {
  let feeEnabled = false;
  try {
    const cfg = await getActivationFeeConfig();
    feeEnabled = Boolean(cfg?.enabled);
  } catch {
    feeEnabled = false;
  }
  if (!feeEnabled) return "TRUE";
  // Waiver: LEGACY_INVITE, or paid within 365 days (users.subscription_activation_fee_paid_at / payments).
  return `
    (
      COALESCE(${userAlias}.onboarding_source, '') = 'LEGACY_INVITE'
      OR (
        COALESCE(${userAlias}.subscription_activation_fee_paid_at, (
          SELECT MAX(p.paid_at) FROM subscription_activation_fee_payments p WHERE p.user_id = ${userAlias}.id
        )) IS NOT NULL
        AND COALESCE(${userAlias}.subscription_activation_fee_paid_at, (
          SELECT MAX(p.paid_at) FROM subscription_activation_fee_payments p WHERE p.user_id = ${userAlias}.id
        )) > NOW() - INTERVAL '365 days'
      )
    )
  `;
}

function mapEligibleExportRow(row) {
  const partnerRank = row.partner_rank ? String(row.partner_rank).toUpperCase() : null;
  const rank = partnerRank === "TRUSTED" ? "TRUSTED" : "APPROVED";
  return {
    id: row.partner_profile_id != null ? String(row.partner_profile_id) : `eligible-${row.freelancer_user_id}`,
    partnerCode: PARTNER_CODE,
    freelancerId: String(row.freelancer_user_id),
    providerFreelancerId: String(row.freelancer_user_id),
    publicCode: row.account_id != null ? String(row.account_id) : `FL-${row.freelancer_user_id}`,
    rank,
    isAssignable: true,
    displayName:
      [row.first_name, row.father_name, row.family_name].filter(Boolean).join(" ").trim() || null,
    skills: Array.isArray(row.skills_snapshot_json) ? row.skills_snapshot_json : [],
    ratingSummary: row.rating_summary != null ? Number(row.rating_summary) : null,
    completedCount: row.completed_count != null ? Number(row.completed_count) : 0,
    availability: row.is_active === false ? "unavailable" : "available",
    notesInternal: row.notes_internal || null,
    lastSyncedAt: row.last_synced_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function buildEligibleFromSql({ limit = 100, offset = 0, rank = null } = {}) {
  const lim = clampLimit(limit);
  const off = clampOffset(offset);
  const feeSql = await activationFeeSatisfiedSql("u");
  const params = [];
  let rankSql = "";
  if (rank && ALLOWED_RANKS.has(String(rank).toUpperCase())) {
    params.push(String(rank).toUpperCase());
    rankSql = ` AND COALESCE(p.rank, 'APPROVED') = $${params.length}`;
  }
  params.push(lim, off);

  const whereCore = `
    ${freelancerRolePredicate("u")}
    AND u.is_active = TRUE
    AND COALESCE(u.email_verified, TRUE) = TRUE
    AND fs.is_current = TRUE
    AND ${subscriptionTakeOrdersSql("fs")}
    AND ${noBlockingHoldSql("u")}
    AND ${feeSql}
    ${rankSql}
  `;

  const countSql = `
    SELECT COUNT(*)::int AS c
    FROM users u
    INNER JOIN freelancer_subscriptions fs
      ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
    LEFT JOIN partner_freelancer_profiles p
      ON p.freelancer_user_id = u.id AND p.partner_code = '${PARTNER_CODE}'
    WHERE ${whereCore}
  `;

  const listSql = `
    SELECT
      u.id AS freelancer_user_id,
      u.account_id,
      u.first_name,
      u.father_name,
      u.family_name,
      u.is_active,
      p.id AS partner_profile_id,
      p.rank AS partner_rank,
      p.is_assignable AS partner_is_assignable,
      p.notes_internal,
      p.skills_snapshot_json,
      NULL::numeric AS rating_summary,
      p.last_synced_at,
      p.created_at,
      p.updated_at,
      COALESCE((
        SELECT COUNT(*)::int FROM orders o
        WHERE o.assigned_freelancer_id = u.id AND o.order_status = 'completed'
      ), 0) AS completed_count
    FROM users u
    INNER JOIN freelancer_subscriptions fs
      ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
    LEFT JOIN partner_freelancer_profiles p
      ON p.freelancer_user_id = u.id AND p.partner_code = '${PARTNER_CODE}'
    WHERE ${whereCore}
    ORDER BY
      CASE COALESCE(p.rank, 'APPROVED')
        WHEN 'TRUSTED' THEN 0
        WHEN 'APPROVED' THEN 1
        ELSE 2
      END,
      u.id ASC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  // Count query uses same params except limit/offset — rebuild without lim/off
  const countParams = params.slice(0, -2);
  let total;
  try {
    const { rows: countRows } = await pool.query(countSql, countParams);
    total = Number(countRows[0]?.c) || 0;
  } catch (err) {
    // Fallback without RBAC / holds / fee tables if missing in older envs
    if (err && (err.code === "42P01" || err.code === "42703")) {
      return listEligibleLegacyFallback({ limit: lim, offset: off, rank });
    }
    throw err;
  }

  const { rows } = await pool.query(listSql, params);
  const data = rows.map(mapEligibleExportRow);

  return {
    data,
    total,
    limit: lim,
    offset: off,
    hasMore: off + lim < total,
    exportMode: "eligible",
  };
}

/** Narrower SQL if advanced tables/columns are missing. */
async function listEligibleLegacyFallback({ limit, offset }) {
  const lim = clampLimit(limit);
  const off = clampOffset(offset);
  const { rows: c2 } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     WHERE u.role = 'freelancer'
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND ${subscriptionTakeOrdersSql("fs")}`,
  );
  const total = Number(c2[0]?.c) || 0;
  const { rows } = await pool.query(
    `SELECT u.id AS freelancer_user_id, u.account_id, u.first_name, u.father_name, u.family_name, u.is_active,
            p.id AS partner_profile_id, p.rank AS partner_rank, p.is_assignable AS partner_is_assignable,
            p.notes_internal, p.skills_snapshot_json, NULL::numeric AS rating_summary, p.last_synced_at, p.created_at, p.updated_at,
            0 AS completed_count
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     LEFT JOIN partner_freelancer_profiles p ON p.freelancer_user_id = u.id AND p.partner_code = '${PARTNER_CODE}'
     WHERE u.role = 'freelancer'
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND ${subscriptionTakeOrdersSql("fs")}
     ORDER BY u.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  );
  const data = rows.map(mapEligibleExportRow);
  return {
    data,
    total,
    limit: lim,
    offset: off,
    hasMore: off + lim < total,
    exportMode: "eligible",
    legacyFallback: true,
  };
}

async function listEligibleFreelancerSnapshots(opts = {}) {
  return buildEligibleFromSql(opts);
}

/**
 * Assert freelancer may receive FAZAT-assigned work under eligible export mode.
 * Reuses Orderz identity + canFreelancerTakeOrders (same as admin assignment).
 */
async function assertEligibleForFazatAssignment(freelancerId) {
  const fid = Number(freelancerId);
  const snap = await getFreelancerIdentitySnapshot(fid);
  if (!snap || !snap.isFreelancer) {
    const err = new Error("Freelancer not found.");
    err.statusCode = 404;
    err.code = "FAZAT_FREELANCER_NOT_FOUND";
    throw err;
  }
  if (!snap.isActive) {
    const err = new Error("Freelancer account is disabled.");
    err.statusCode = 403;
    err.code = "FAZAT_FREELANCER_INACTIVE";
    throw err;
  }
  if (!snap.emailVerified) {
    const err = new Error("Freelancer email is not verified.");
    err.statusCode = 403;
    err.code = "FAZAT_FREELANCER_EMAIL_UNVERIFIED";
    throw err;
  }
  const eligibility = await canFreelancerTakeOrders(String(fid));
  if (!eligibility.eligible) {
    const err = new Error("Freelancer is not eligible to receive work in Orderz.");
    err.statusCode = 403;
    err.code = "FAZAT_FREELANCER_NOT_ELIGIBLE";
    err.details = { reason: eligibility.reason || null };
    throw err;
  }
  return { snap, eligibility };
}

async function auditEligibleExportCounts() {
  const cfg = getFazatIntegrationConfig();
  const feeSql = await activationFeeSatisfiedSql("u");

  const q = async (sql, params = []) => {
    const { rows } = await pool.query(sql, params);
    return Number(rows[0]?.c) || 0;
  };

  const totalFreelancers = await q(
    `SELECT COUNT(*)::int AS c FROM users u WHERE ${freelancerRolePredicate("u")}`,
  );
  const activeFreelancers = await q(
    `SELECT COUNT(*)::int AS c FROM users u
     WHERE ${freelancerRolePredicate("u")} AND u.is_active = TRUE`,
  );
  const emailVerifiedActive = await q(
    `SELECT COUNT(*)::int AS c FROM users u
     WHERE ${freelancerRolePredicate("u")}
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE`,
  );
  const companyApprovedCurrent = await q(
    `SELECT COUNT(*)::int AS c
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     WHERE ${freelancerRolePredicate("u")}
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND COALESCE(NULLIF(TRIM(LOWER(fs.activation_status)), ''), 'company_approved') = 'company_approved'`,
  );
  const subscriptionEligible = await q(
    `SELECT COUNT(*)::int AS c
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     WHERE ${freelancerRolePredicate("u")}
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND ${subscriptionTakeOrdersSql("fs")}`,
  );
  const withoutHold = await q(
    `SELECT COUNT(*)::int AS c
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     WHERE ${freelancerRolePredicate("u")}
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND ${subscriptionTakeOrdersSql("fs")}
       AND ${noBlockingHoldSql("u")}`,
  );
  const allEligible = await q(
    `SELECT COUNT(*)::int AS c
     FROM users u
     INNER JOIN freelancer_subscriptions fs ON fs.freelancer_user_id = u.id AND fs.is_current = TRUE
     WHERE ${freelancerRolePredicate("u")}
       AND u.is_active = TRUE
       AND COALESCE(u.email_verified, TRUE) = TRUE
       AND ${subscriptionTakeOrdersSql("fs")}
       AND ${noBlockingHoldSql("u")}
       AND ${feeSql}`,
  );
  const pilotProfiles = await q(
    `SELECT COUNT(*)::int AS c FROM partner_freelancer_profiles WHERE partner_code = $1`,
    [PARTNER_CODE],
  );
  let pilotExport = 0;
  if (cfg.pilotFreelancerIds.length) {
    pilotExport = await q(
      `SELECT COUNT(*)::int AS c
       FROM partner_freelancer_profiles p
       JOIN users u ON u.id = p.freelancer_user_id
       WHERE p.partner_code = $1
         AND p.freelancer_user_id = ANY($2::bigint[])
         AND u.role = 'freelancer'`,
      [PARTNER_CODE, cfg.pilotFreelancerIds],
    );
  }

  return {
    exportModeConfigured: cfg.freelancerExportMode,
    totalFreelancers,
    activeFreelancers,
    emailVerifiedActive,
    companyApprovedCurrentSub: companyApprovedCurrent,
    subscriptionTakeOrdersEligible: subscriptionEligible,
    afterHoldFilter: withoutHold,
    allEligibleForFazatExport: allEligible,
    partnerProfilesTotal: pilotProfiles,
    currentPilotIntersectExportApprox: pilotExport,
    excluded: {
      inactiveOrNonFreelancer: Math.max(0, totalFreelancers - activeFreelancers),
      emailUnverifiedAmongActive: Math.max(0, activeFreelancers - emailVerifiedActive),
      missingCompanyApprovedOrSub: Math.max(0, emailVerifiedActive - companyApprovedCurrent),
      subscriptionGateBlocks: Math.max(0, companyApprovedCurrent - subscriptionEligible),
      holds: Math.max(0, subscriptionEligible - withoutHold),
      activationFee: Math.max(0, withoutHold - allEligible),
    },
    note:
      "company_approved on current subscription is Orderz A11 identity/account-activation gate for taking work. Separate training completion is not part of canFreelancerTakeOrders.",
  };
}

module.exports = {
  listEligibleFreelancerSnapshots,
  assertEligibleForFazatAssignment,
  auditEligibleExportCounts,
  clampLimit,
  clampOffset,
};
