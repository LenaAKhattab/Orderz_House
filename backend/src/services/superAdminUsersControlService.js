/**
 * Super Admin Users Control Center — safe list/detail + privileged mutations with audit.
 * Never exposes password_hash, tokens, stripe_customer_id, or raw KYC file keys.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { ROLES } = require("../constants/roles");
const { aggregateCoursesForAdmin } = require("../utils/superAdminUsersCourseHelpers");
const subscriptionsService = require("./subscriptionsService");
const freelancerAccountActivationKycService = require("./freelancerAccountActivationKycService");
const notificationRealtimeHub = require("./notificationRealtimeHub");

const KYC_FILE_BASE = "/api/super-admin/freelancer-activation-requests";
const MAX_BULK_IDS = 100;
const ALLOWED_ACCOUNT_FIELDS = Object.freeze([
  "firstName",
  "fatherName",
  "familyName",
  "phone",
  "whatsapp",
  "accountStatus",
  "role",
]);
const ALLOWED_ROLES = Object.freeze([
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.CLIENT,
  ROLES.FREELANCER,
  ROLES.FINANCIAL_USER,
]);
const IDENTITY_ACTIONS = Object.freeze([
  "approve_identity",
  "reject_identity",
  "mark_pending_review",
  "request_resubmission",
]);
const MEMBERSHIP_ACTIONS = Object.freeze(["assign_plan", "change_plan", "cancel_plan"]);
const TRAINING_ACTIONS = Object.freeze([
  "mark_course_completed",
  "mark_final_test_passed",
  "reset_course_progress",
  "reset_final_test",
]);
const BULK_ACTIONS = Object.freeze([
  "set_account_status",
  "assign_plan",
  "request_kyc_resubmission",
  "mark_identity_pending_review",
  "export_selected_users_csv",
]);

function requireReason(reason) {
  const text = String(reason ?? "").trim();
  if (text.length < 3) {
    throw createAppError("سبب الإجراء مطلوب (3 أحرف على الأقل).", 400, {
      exposeToClient: true,
      publicCode: "REASON_REQUIRED",
    });
  }
  return text.slice(0, 4000);
}

function toUserId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError("معرّف المستخدم غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_USER_ID",
    });
  }
  return id;
}

function buildDisplayName(row) {
  return [row.first_name, row.father_name, row.family_name]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
}

function accountStatusFromRow(row) {
  return row?.is_active ? "active" : "inactive";
}

function kycProtectedDocs(requestId, row) {
  if (!requestId) return { front: null, back: null };
  const id = String(requestId);
  return {
    front: row?.id_front_file_key
      ? {
          side: "front",
          protectedPath: `${KYC_FILE_BASE}/${id}/files/front`,
          originalName: row.id_front_original_name || null,
          mimeType: row.id_front_mime_type || null,
          sizeBytes: row.id_front_size_bytes != null ? Number(row.id_front_size_bytes) : null,
        }
      : null,
    back: row?.id_back_file_key
      ? {
          side: "back",
          protectedPath: `${KYC_FILE_BASE}/${id}/files/back`,
          originalName: row.id_back_original_name || null,
          mimeType: row.id_back_mime_type || null,
          sizeBytes: row.id_back_size_bytes != null ? Number(row.id_back_size_bytes) : null,
        }
      : null,
  };
}

function sanitizeSubscription(sub) {
  if (!sub) return null;
  const {
    stripeCustomerId: _sc,
    stripeSessionId: _ss,
    stripePaymentIntentId: _spi,
    stripeSubscriptionId: _ssid,
    stripePriceId: _sp,
    ...safe
  } = sub;
  return {
    id: safe.id != null ? String(safe.id) : null,
    planId: safe.planId != null ? String(safe.planId) : null,
    plan: safe.plan || null,
    status: safe.status || null,
    activationStatus: safe.activationStatus || null,
    paymentStatus: safe.paymentStatus || null,
    isCurrent: safe.isCurrent === true,
    source: safe.source || null,
    assignedAt: safe.assignedAt || null,
    actualStartDate: safe.actualStartDate || null,
    expiryDate: safe.expiryDate || null,
    hasFirstOrder: safe.hasFirstOrder === true,
    notes: safe.notes || null,
    cancelledAt: safe.cancelledAt || null,
    endedAt: safe.endedAt || null,
    createdAt: safe.createdAt || null,
    updatedAt: safe.updatedAt || null,
  };
}

async function writeAudit({
  actorAdminId,
  targetUserId,
  action,
  reason,
  beforeSnapshot = null,
  afterSnapshot = null,
  requestId = null,
  metadata = null,
} = {}) {
  const actor = Number(actorAdminId);
  const target = Number(targetUserId);
  if (!Number.isInteger(actor) || actor < 1 || !Number.isInteger(target) || target < 1) {
    throw createAppError("Audit actor/target invalid.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_AUDIT_REF",
    });
  }
  const safeReason = String(reason || "").trim() || "n/a";
  try {
    const { rows } = await pool.query(
      `INSERT INTO super_admin_user_control_audit_logs (
         actor_admin_id, target_user_id, action, reason,
         before_snapshot, after_snapshot, request_id, metadata
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8::jsonb)
       RETURNING id, created_at`,
      [
        actor,
        target,
        String(action).slice(0, 80),
        safeReason.slice(0, 4000),
        beforeSnapshot != null ? JSON.stringify(beforeSnapshot) : null,
        afterSnapshot != null ? JSON.stringify(afterSnapshot) : null,
        requestId != null ? String(requestId).slice(0, 64) : null,
        metadata != null ? JSON.stringify(metadata) : null,
      ],
    );
    return { id: String(rows[0].id), createdAt: rows[0].created_at };
  } catch (err) {
    if (err?.code === "42P01") {
      throw createAppError("Audit schema is not ready. Apply migration 186.", 503, {
        exposeToClient: true,
        publicCode: "AUDIT_SCHEMA_NOT_READY",
      });
    }
    throw err;
  }
}

async function loadUserRow(userId, client = null) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT id, account_id, email, role, first_name, father_name, family_name,
            phone, whatsapp, country, gender, is_active,
            COALESCE(email_verified, TRUE) AS email_verified,
            avatar_url, professional_title, bio, skills, freelancer_categories,
            terms_accepted, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [Number(userId)],
  );
  return rows[0] || null;
}

function mapSafeUserSummary(row, extras = {}) {
  const fullName = buildDisplayName(row);
  return {
    id: String(row.id),
    accountId: row.account_id != null ? String(row.account_id) : null,
    fullName: fullName || null,
    firstName: row.first_name || null,
    fatherName: row.father_name || null,
    familyName: row.family_name || null,
    email: row.email || null,
    phone: row.phone || null,
    whatsapp: row.whatsapp || null,
    role: row.role || null,
    accountStatus: accountStatusFromRow(row),
    emailVerified: Boolean(row.email_verified),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    ...extras,
  };
}

async function countActiveSuperAdmins(client = null, { excludeUserId = null } = {}) {
  const runner = client || pool;
  const params = [ROLES.SUPER_ADMIN];
  let sql = `SELECT COUNT(*)::int AS c
             FROM users
             WHERE role = $1 AND is_active = TRUE`;
  if (excludeUserId != null) {
    params.push(Number(excludeUserId));
    sql += ` AND id <> $${params.length}`;
  }
  const { rows } = await runner.query(sql, params);
  return Number(rows[0]?.c || 0);
}

async function getCurrentSubscriptionSafe(freelancerUserId) {
  try {
    if (typeof subscriptionsService?.getCurrentSubscriptionForFreelancer === "function") {
      return await subscriptionsService.getCurrentSubscriptionForFreelancer(freelancerUserId);
    }
  } catch {
    /* fall through */
  }
  const { rows } = await pool.query(
    `SELECT fs.*,
            p.name AS plan_name,
            p.title AS plan_title,
            p.duration_days AS plan_duration_days,
            p.price_jod AS plan_price_jod
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
     ORDER BY fs.id DESC
     LIMIT 1`,
    [Number(freelancerUserId)],
  );
  if (!rows[0]) return null;
  if (typeof subscriptionsService?.mapSubscription === "function") {
    return subscriptionsService.mapSubscription(rows[0]);
  }
  return {
    id: String(rows[0].id),
    planId: String(rows[0].plan_id),
    status: rows[0].status,
    activationStatus: rows[0].activation_status,
    paymentStatus: rows[0].payment_status,
    isCurrent: rows[0].is_current === true,
    plan: {
      id: String(rows[0].plan_id),
      name: rows[0].plan_name,
      title: rows[0].plan_title,
      durationDays: rows[0].plan_duration_days,
      priceJod: rows[0].plan_price_jod != null ? Number(rows[0].plan_price_jod) : null,
    },
  };
}

async function getEligibilitySafe(freelancerUserId) {
  try {
    if (typeof subscriptionsService?.canFreelancerTakeOrders === "function") {
      return await subscriptionsService.canFreelancerTakeOrders(String(freelancerUserId));
    }
  } catch (err) {
    return { eligible: false, reason: "eligibility_unavailable", error: String(err?.message || err) };
  }
  return null;
}

async function loadLatestKycRequest(freelancerUserId, client = null) {
  const runner = client || pool;
  try {
    const { rows } = await runner.query(
      `SELECT *
         FROM freelancer_account_activation_requests
        WHERE freelancer_user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [Number(freelancerUserId)],
    );
    return rows[0] || null;
  } catch (err) {
    if (err?.code === "42P01") return null;
    throw err;
  }
}

function mapIdentityForAdmin(kycRow) {
  if (!kycRow) {
    return {
      status: "none",
      requestId: null,
      submittedAt: null,
      reviewedAt: null,
      rejectionReason: null,
      adminNotes: null,
      resubmissionCount: 0,
      documents: { front: null, back: null },
    };
  }
  return {
    status: kycRow.status || "none",
    requestId: String(kycRow.id),
    submittedAt: kycRow.submitted_at || null,
    reviewedAt: kycRow.reviewed_at || null,
    rejectionReason: kycRow.rejection_reason || null,
    adminNotes: kycRow.admin_notes || null,
    resubmissionCount: Number(kycRow.resubmission_count || 0),
    documents: kycProtectedDocs(kycRow.id, kycRow),
  };
}

async function loadCoursesForUser(freelancerUserId) {
  const uid = Number(freelancerUserId);
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (c.id)
              c.id,
              c.title,
              c.is_testing_enabled,
              a.id AS assignment_id,
              a.completed_at AS course_completed_at,
              a.audit_confirmed,
              a.audit_notes,
              a.audit_submitted_at,
              a.exam_final_grade,
              COALESCE(lc.total_lessons, 0)::int AS total_lessons,
              COALESCE(lp.completed_lessons, 0)::int AS completed_lessons
         FROM courses c
         LEFT JOIN course_assignments a
           ON a.course_id = c.id AND a.freelancer_id = $1
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total_lessons
             FROM course_lessons l
            WHERE l.course_id = c.id AND l.is_active = TRUE
         ) lc ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS completed_lessons
             FROM course_lesson_progress p
            WHERE p.course_id = c.id AND p.freelancer_id = $1
         ) lp ON TRUE
        WHERE c.is_active = TRUE
          AND (c.is_visible_to_all_freelancers = TRUE OR a.id IS NOT NULL)
        ORDER BY c.id DESC
        LIMIT 100`,
      [uid],
    );
    return rows.map((r) => {
      const total = Number(r.total_lessons || 0);
      const completed = Number(r.completed_lessons || 0);
      return {
        id: String(r.id),
        title: r.title,
        isTestingEnabled: Boolean(r.is_testing_enabled),
        courseCompletedAt: r.course_completed_at || null,
        auditConfirmed: Boolean(r.audit_confirmed),
        auditNotes: r.audit_notes || null,
        auditSubmittedAt: r.audit_submitted_at || null,
        examFinalGrade: r.exam_final_grade != null ? Number(r.exam_final_grade) : null,
        hasAssignment: r.assignment_id != null,
        progress: {
          totalLessons: total,
          completedLessons: completed,
          percentage: total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0,
        },
      };
    });
  } catch (err) {
    if (err?.code === "42P01") return [];
    throw err;
  }
}

async function loadActivityCounts(userId) {
  const uid = Number(userId);
  const out = {
    ordersAsClient: 0,
    ordersAsFreelancer: 0,
    bids: 0,
    lastSeenAt: null,
  };
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM orders o WHERE o.created_by_user_id = $1) AS as_client,
         (SELECT COUNT(*)::int FROM orders o
           WHERE o.assigned_freelancer_id = $1 OR o.accepted_freelancer_id = $1) AS as_freelancer`,
      [uid],
    );
    out.ordersAsClient = Number(rows[0]?.as_client || 0);
    out.ordersAsFreelancer = Number(rows[0]?.as_freelancer || 0);
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") throw err;
  }
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM marketplace_article_applications
        WHERE freelancer_user_id = $1`,
      [uid],
    );
    out.bids = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") throw err;
  }
  try {
    const { rows } = await pool.query(
      `SELECT MAX(last_seen_at) AS last_seen_at
         FROM user_device_tokens
        WHERE user_id = $1`,
      [uid],
    );
    out.lastSeenAt = rows[0]?.last_seen_at || null;
  } catch (err) {
    if (err?.code !== "42P01" && err?.code !== "42703") throw err;
  }
  return out;
}

async function loadAuditEvents(targetUserId, limit = 30) {
  try {
    const lim = Math.min(100, Math.max(1, Number(limit) || 30));
    const { rows } = await pool.query(
      `SELECT a.id, a.actor_admin_id, a.target_user_id, a.action, a.reason,
              a.before_snapshot, a.after_snapshot, a.request_id, a.metadata, a.created_at,
              u.first_name AS actor_first_name, u.family_name AS actor_family_name, u.email AS actor_email
         FROM super_admin_user_control_audit_logs a
         LEFT JOIN users u ON u.id = a.actor_admin_id
        WHERE a.target_user_id = $1
        ORDER BY a.created_at DESC
        LIMIT $2`,
      [Number(targetUserId), lim],
    );
    return rows.map((r) => ({
      id: String(r.id),
      actorAdminId: String(r.actor_admin_id),
      actorName: buildDisplayName({
        first_name: r.actor_first_name,
        father_name: null,
        family_name: r.actor_family_name,
      }) || r.actor_email || null,
      action: r.action,
      reason: r.reason,
      beforeSnapshot: r.before_snapshot || null,
      afterSnapshot: r.after_snapshot || null,
      requestId: r.request_id || null,
      metadata: r.metadata || null,
      createdAt: r.created_at,
    }));
  } catch (err) {
    if (err?.code === "42P01") return [];
    throw err;
  }
}

function buildBlockers({ user, subscription, eligibility, identity, training }) {
  const blockers = [];
  if (!user.is_active) {
    blockers.push({ code: "account_inactive", message: "الحساب غير نشط" });
  }
  if (user.role === ROLES.FREELANCER) {
    if (!user.email_verified) {
      blockers.push({ code: "email_unverified", message: "البريد غير موثّق" });
    }
    if (!subscription) {
      blockers.push({ code: "no_subscription", message: "لا يوجد اشتراك حالي" });
    } else if (String(subscription.activationStatus || "").toLowerCase() === "company_pending") {
      blockers.push({ code: "activation_pending", message: "بانتظار تفعيل الشركة" });
    } else if (String(subscription.activationStatus || "").toLowerCase() === "company_rejected") {
      blockers.push({ code: "activation_rejected", message: "تم رفض تفعيل الحساب" });
    }
    if (identity?.status === "pending_review") {
      blockers.push({ code: "identity_pending_review", message: "الهوية بانتظار المراجعة" });
    } else if (identity?.status === "rejected") {
      blockers.push({ code: "identity_rejected", message: "الهوية مرفوضة — يلزم إعادة الرفع" });
    }
    if (eligibility && eligibility.eligible === false) {
      blockers.push({
        code: eligibility.reason || "not_eligible",
        message: "غير مؤهل لاستلام الطلبات",
      });
    }
    if (training?.pendingFinalTest > 0) {
      blockers.push({
        code: "pending_final_test",
        message: `يوجد ${training.pendingFinalTest} اختبار نهائي معلّق`,
      });
    }
  }
  return blockers;
}

async function getStats() {
  const { rows: roleRows } = await pool.query(
    `SELECT
       COUNT(*)::int AS totals,
       COUNT(*) FILTER (WHERE role = 'freelancer')::int AS freelancers,
       COUNT(*) FILTER (WHERE role = 'client')::int AS clients
     FROM users`,
  );
  const base = roleRows[0] || { totals: 0, freelancers: 0, clients: 0 };

  let pendingActivation = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(DISTINCT fs.freelancer_user_id)::int AS c
         FROM freelancer_subscriptions fs
        WHERE fs.is_current = TRUE
          AND LOWER(COALESCE(fs.activation_status, '')) = 'company_pending'`,
    );
    pendingActivation = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err?.code !== "42P01") throw err;
  }

  let identityPendingReview = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM freelancer_account_activation_requests
        WHERE status = 'pending_review'`,
    );
    identityPendingReview = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err?.code !== "42P01") throw err;
  }

  let pendingFinalTests = 0;
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM course_assignments a
         JOIN courses c ON c.id = a.course_id
        WHERE a.completed_at IS NULL
          AND c.is_testing_enabled = TRUE
          AND c.is_active = TRUE
          AND (
            SELECT COUNT(*)::int FROM course_lessons l
             WHERE l.course_id = c.id AND l.is_active = TRUE
          ) > 0
          AND (
            SELECT COUNT(*)::int FROM course_lesson_progress p
             WHERE p.course_id = a.course_id AND p.freelancer_id = a.freelancer_id
          ) >= (
            SELECT COUNT(*)::int FROM course_lessons l
             WHERE l.course_id = c.id AND l.is_active = TRUE
          )`,
    );
    pendingFinalTests = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err?.code !== "42P01") throw err;
  }

  return {
    totals: Number(base.totals || 0),
    freelancers: Number(base.freelancers || 0),
    clients: Number(base.clients || 0),
    pendingActivation,
    identityPendingReview,
    pendingFinalTests,
  };
}

/**
 * listUsers — parameterized filters. Params array built manually (no fragile add() helper).
 */
async function listUsers(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const offset = (page - 1) * limit;
  const q = String(query.q || "").trim();
  const role = query.role ? String(query.role).trim() : "";
  const accountStatus = query.accountStatus ? String(query.accountStatus).trim().toLowerCase() : "";
  const identityStatus = query.identityStatus ? String(query.identityStatus).trim().toLowerCase() : "";
  const membershipTier = query.membershipTier ? String(query.membershipTier).trim() : "";
  const membershipStatus = query.membershipStatus
    ? String(query.membershipStatus).trim().toLowerCase()
    : "";
  const courseStatus = query.courseStatus ? String(query.courseStatus).trim().toLowerCase() : "";
  const activationStatus = query.activationStatus
    ? String(query.activationStatus).trim().toLowerCase()
    : "";
  const hasPendingFinalTest =
    query.hasPendingFinalTest === true ||
    String(query.hasPendingFinalTest || "").toLowerCase() === "true";
  const createdFrom = query.createdFrom ? new Date(query.createdFrom) : null;
  const createdTo = query.createdTo ? new Date(query.createdTo) : null;
  const sortRaw = String(query.sort || "created_at_desc").trim().toLowerCase();

  const params = [];
  const where = ["1=1"];

  if (role) {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (accountStatus === "active") {
    where.push(`u.is_active = TRUE`);
  } else if (accountStatus === "inactive") {
    where.push(`u.is_active = FALSE`);
  }
  if (createdFrom && !Number.isNaN(createdFrom.getTime())) {
    params.push(createdFrom.toISOString());
    where.push(`u.created_at >= $${params.length}::timestamptz`);
  }
  if (createdTo && !Number.isNaN(createdTo.getTime())) {
    params.push(createdTo.toISOString());
    where.push(`u.created_at <= $${params.length}::timestamptz`);
  }

  if (q) {
    const like = `%${q.toLowerCase()}%`;
    params.push(like);
    const likeIdx = params.length;
    const clauses = [
      `LOWER(u.email) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.first_name, '')) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.father_name, '')) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.family_name, '')) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.account_id::text, '')) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.phone, '')) LIKE $${likeIdx}`,
      `LOWER(COALESCE(u.whatsapp, '')) LIKE $${likeIdx}`,
      `CAST(u.id AS TEXT) LIKE $${likeIdx}`,
    ];
    if (/^\d+$/.test(q)) {
      params.push(Number(q));
      clauses.push(`u.id = $${params.length}`);
    }
    where.push(`(${clauses.join(" OR ")})`);
  }

  // Identity filter via latest KYC request
  if (identityStatus === "none") {
    where.push(`NOT EXISTS (
      SELECT 1 FROM freelancer_account_activation_requests k0
       WHERE k0.freelancer_user_id = u.id
    )`);
  } else if (identityStatus) {
    params.push(identityStatus);
    where.push(`EXISTS (
      SELECT 1 FROM freelancer_account_activation_requests k1
       WHERE k1.freelancer_user_id = u.id
         AND k1.status = $${params.length}
         AND k1.id = (
           SELECT k2.id FROM freelancer_account_activation_requests k2
            WHERE k2.freelancer_user_id = u.id
            ORDER BY k2.created_at DESC, k2.id DESC
            LIMIT 1
         )
    )`);
  }

  if (membershipStatus === "none") {
    where.push(`NOT EXISTS (
      SELECT 1 FROM freelancer_subscriptions fs0
       WHERE fs0.freelancer_user_id = u.id AND fs0.is_current = TRUE
    )`);
  } else if (membershipStatus) {
    params.push(membershipStatus);
    where.push(`EXISTS (
      SELECT 1 FROM freelancer_subscriptions fs1
       WHERE fs1.freelancer_user_id = u.id
         AND fs1.is_current = TRUE
         AND LOWER(fs1.status) = $${params.length}
    )`);
  }

  if (membershipTier) {
    const tier = membershipTier;
    if (/^\d+$/.test(tier)) {
      params.push(Number(tier));
      where.push(`EXISTS (
        SELECT 1 FROM freelancer_subscriptions fs2
         WHERE fs2.freelancer_user_id = u.id
           AND fs2.is_current = TRUE
           AND fs2.plan_id = $${params.length}
      )`);
    } else {
      params.push(tier.toLowerCase());
      where.push(`EXISTS (
        SELECT 1 FROM freelancer_subscriptions fs2
        JOIN plans p2 ON p2.id = fs2.plan_id
         WHERE fs2.freelancer_user_id = u.id
           AND fs2.is_current = TRUE
           AND (LOWER(p2.name) = $${params.length} OR LOWER(COALESCE(p2.title, '')) = $${params.length})
      )`);
    }
  }

  if (activationStatus) {
    params.push(activationStatus);
    where.push(`EXISTS (
      SELECT 1 FROM freelancer_subscriptions fs_act
       WHERE fs_act.freelancer_user_id = u.id
         AND fs_act.is_current = TRUE
         AND LOWER(COALESCE(fs_act.activation_status, '')) = $${params.length}
    )`);
  }

  if (hasPendingFinalTest) {
    where.push(`EXISTS (
      SELECT 1
        FROM course_assignments a
        JOIN courses c ON c.id = a.course_id
       WHERE a.freelancer_id = u.id
         AND a.completed_at IS NULL
         AND c.is_testing_enabled = TRUE
         AND c.is_active = TRUE
         AND (
           SELECT COUNT(*)::int FROM course_lessons l
            WHERE l.course_id = c.id AND l.is_active = TRUE
         ) > 0
         AND (
           SELECT COUNT(*)::int FROM course_lesson_progress p
            WHERE p.course_id = a.course_id AND p.freelancer_id = a.freelancer_id
         ) >= (
           SELECT COUNT(*)::int FROM course_lessons l
            WHERE l.course_id = c.id AND l.is_active = TRUE
         )
    )`);
  }

  // courseStatus post-filter is applied after enrichment when set (except none handled lightly)
  if (courseStatus === "none") {
    where.push(`NOT EXISTS (
      SELECT 1 FROM course_assignments ca WHERE ca.freelancer_id = u.id
    )`);
  }

  let orderSql = `u.created_at DESC, u.id DESC`;
  if (sortRaw === "created_at_asc") orderSql = `u.created_at ASC, u.id ASC`;
  else if (sortRaw === "name_asc") {
    orderSql = `LOWER(COALESCE(u.first_name, '')) ASC, LOWER(COALESCE(u.family_name, '')) ASC, u.id ASC`;
  } else if (sortRaw === "name_desc") {
    orderSql = `LOWER(COALESCE(u.first_name, '')) DESC, LOWER(COALESCE(u.family_name, '')) DESC, u.id DESC`;
  } else if (sortRaw === "id_asc") orderSql = `u.id ASC`;
  else if (sortRaw === "id_desc") orderSql = `u.id DESC`;

  const whereSql = where.join(" AND ");
  const countParams = [...params];
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM users u WHERE ${whereSql}`,
    countParams,
  );
  let total = Number(countRows[0]?.total || 0);

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const { rows } = await pool.query(
    `SELECT u.id, u.account_id, u.email, u.role, u.first_name, u.father_name, u.family_name,
            u.phone, u.whatsapp, u.is_active, COALESCE(u.email_verified, TRUE) AS email_verified,
            u.created_at, u.updated_at
       FROM users u
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params,
  );

  const ids = rows.map((r) => Number(r.id));
  const subByUser = new Map();
  const kycByUser = new Map();
  const lastSeenByUser = new Map();

  if (ids.length) {
    try {
      const { rows: subRows } = await pool.query(
        `SELECT fs.*,
                p.name AS plan_name,
                p.title AS plan_title,
                p.duration_days AS plan_duration_days,
                p.price_jod AS plan_price_jod
           FROM freelancer_subscriptions fs
           JOIN plans p ON p.id = fs.plan_id
          WHERE fs.freelancer_user_id = ANY($1::bigint[])
            AND fs.is_current = TRUE`,
        [ids],
      );
      for (const s of subRows) {
        const mapped =
          typeof subscriptionsService?.mapSubscription === "function"
            ? subscriptionsService.mapSubscription(s)
            : s;
        subByUser.set(Number(s.freelancer_user_id), sanitizeSubscription(mapped));
      }
    } catch (err) {
      if (err?.code !== "42P01") throw err;
    }

    try {
      const { rows: kycRows } = await pool.query(
        `SELECT DISTINCT ON (freelancer_user_id)
                id, freelancer_user_id, status, submitted_at, reviewed_at, rejection_reason,
                resubmission_count
           FROM freelancer_account_activation_requests
          WHERE freelancer_user_id = ANY($1::bigint[])
          ORDER BY freelancer_user_id, created_at DESC, id DESC`,
        [ids],
      );
      for (const k of kycRows) {
        kycByUser.set(Number(k.freelancer_user_id), {
          status: k.status,
          requestId: String(k.id),
          submittedAt: k.submitted_at,
          reviewedAt: k.reviewed_at,
          rejectionReason: k.rejection_reason || null,
          resubmissionCount: Number(k.resubmission_count || 0),
        });
      }
    } catch (err) {
      if (err?.code !== "42P01") throw err;
    }

    try {
      const { rows: seenRows } = await pool.query(
        `SELECT user_id, MAX(last_seen_at) AS last_seen_at
           FROM user_device_tokens
          WHERE user_id = ANY($1::bigint[])
          GROUP BY user_id`,
        [ids],
      );
      for (const s of seenRows) {
        lastSeenByUser.set(Number(s.user_id), s.last_seen_at);
      }
    } catch (err) {
      if (err?.code !== "42P01" && err?.code !== "42703") throw err;
    }
  }

  let items = [];
  for (const row of rows) {
    const uid = Number(row.id);
    const courses = row.role === ROLES.FREELANCER ? await loadCoursesForUser(uid) : [];
    const training = aggregateCoursesForAdmin(courses);
    const sub = subByUser.get(uid) || null;
    const identity = kycByUser.get(uid) || { status: "none", requestId: null };

    if (courseStatus && courseStatus !== "none" && training.status !== courseStatus) {
      continue;
    }

    items.push(
      mapSafeUserSummary(row, {
        identityStatus: identity.status || "none",
        membershipTier: sub?.plan?.name || sub?.plan?.title || null,
        membershipPlanId: sub?.planId || null,
        membershipStatus: sub?.status || null,
        activationStatus: sub?.activationStatus || null,
        courseStatus: training.status,
        coursesCompleted: training.completed,
        coursesTotal: training.total,
        pendingFinalTests: training.pendingFinalTest,
        lastSeenAt: lastSeenByUser.get(uid) || null,
        isOnline: notificationRealtimeHub.isUserOnline(uid),
        flags: {
          emailUnverified: !row.email_verified,
          identityPending: identity.status === "pending_review",
          activationPending: String(sub?.activationStatus || "").toLowerCase() === "company_pending",
          hasPendingFinalTest: training.pendingFinalTest > 0,
        },
      }),
    );
  }

  // When courseStatus filters in-memory, adjust total approx to page length semantics
  if (courseStatus && courseStatus !== "none") {
    total = items.length < limit && page === 1 ? items.length : total;
  }

  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function getUserDetail(userId) {
  const uid = toUserId(userId);
  const row = await loadUserRow(uid);
  if (!row) {
    throw createAppError("المستخدم غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "USER_NOT_FOUND",
    });
  }

  const isFreelancer = row.role === ROLES.FREELANCER;
  const subscription = isFreelancer ? sanitizeSubscription(await getCurrentSubscriptionSafe(uid)) : null;
  const eligibility = isFreelancer ? await getEligibilitySafe(uid) : null;
  const kycRow = isFreelancer ? await loadLatestKycRequest(uid) : null;
  const identity = mapIdentityForAdmin(kycRow);
  const courses = isFreelancer ? await loadCoursesForUser(uid) : [];
  const training = aggregateCoursesForAdmin(courses);
  const activity = await loadActivityCounts(uid);
  const auditEvents = await loadAuditEvents(uid, 40);
  const blockers = buildBlockers({
    user: row,
    subscription,
    eligibility,
    identity,
    training,
  });

  return {
    profile: {
      ...mapSafeUserSummary(row),
      country: row.country || null,
      gender: row.gender || null,
      avatarUrl: row.avatar_url || null,
      professionalTitle: row.professional_title || null,
      bio: row.bio || null,
      skills: row.skills || null,
      freelancerCategories: Array.isArray(row.freelancer_categories) ? row.freelancer_categories : [],
      termsAccepted: Boolean(row.terms_accepted),
      lastSeenAt: activity.lastSeenAt,
      isOnline: notificationRealtimeHub.isUserOnline(uid),
    },
    subscription,
    eligibility: eligibility
      ? {
          eligible: eligibility.eligible === true,
          reason: eligibility.reason || null,
          freezeMessage: eligibility.freezeMessage || null,
        }
      : null,
    identity,
    training: {
      ...training,
      courses: training.courses.map((c) => ({
        id: c.id,
        title: c.title,
        isTestingEnabled: c.isTestingEnabled,
        courseCompletedAt: c.courseCompletedAt,
        auditConfirmed: c.auditConfirmed,
        auditNotes: c.auditNotes,
        examFinalGrade: c.examFinalGrade,
        progress: c.progress,
      })),
    },
    activity,
    blockers,
    auditEvents,
  };
}

async function patchAccount({ actorAdminId, userId, patch = {}, reason, requestId = null } = {}) {
  const actor = toUserId(actorAdminId);
  const uid = toUserId(userId);
  const safeReason = requireReason(reason);

  if (patch && (Object.prototype.hasOwnProperty.call(patch, "password") || patch.passwordHash)) {
    throw createAppError("لا يمكن تعديل كلمة المرور من هذه الواجهة.", 400, {
      exposeToClient: true,
      publicCode: "PASSWORD_CHANGE_FORBIDDEN",
    });
  }

  const keys = Object.keys(patch || {}).filter((k) => patch[k] !== undefined);
  const unknown = keys.filter((k) => !ALLOWED_ACCOUNT_FIELDS.includes(k));
  if (unknown.length) {
    throw createAppError(`حقول غير مسموحة: ${unknown.join(", ")}`, 400, {
      exposeToClient: true,
      publicCode: "FIELD_NOT_ALLOWED",
    });
  }
  if (!keys.length) {
    throw createAppError("لا توجد حقول للتحديث.", 400, {
      exposeToClient: true,
      publicCode: "NO_FIELDS",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, account_id, email, role, first_name, father_name, family_name,
              phone, whatsapp, is_active, created_at, updated_at
         FROM users WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [uid],
    );
    const before = rows[0];
    if (!before) {
      throw createAppError("المستخدم غير موجود.", 404, {
        exposeToClient: true,
        publicCode: "USER_NOT_FOUND",
      });
    }

    const sets = [];
    const vals = [];
    const push = (col, value) => {
      vals.push(value);
      sets.push(`${col} = $${vals.length}`);
    };

    if (patch.firstName !== undefined) push("first_name", String(patch.firstName || "").trim().slice(0, 120) || null);
    if (patch.fatherName !== undefined) {
      push("father_name", String(patch.fatherName || "").trim().slice(0, 120) || null);
    }
    if (patch.familyName !== undefined) {
      push("family_name", String(patch.familyName || "").trim().slice(0, 120) || null);
    }
    if (patch.phone !== undefined) {
      const phone = String(patch.phone || "").trim().slice(0, 40);
      if (phone) push("phone", phone);
    }
    if (patch.whatsapp !== undefined) {
      const wa = String(patch.whatsapp || "").trim().slice(0, 40);
      if (wa) push("whatsapp", wa);
    }

    if (patch.accountStatus !== undefined) {
      const st = String(patch.accountStatus).trim().toLowerCase();
      if (st !== "active" && st !== "inactive") {
        throw createAppError("حالة الحساب يجب أن تكون active أو inactive.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_ACCOUNT_STATUS",
        });
      }
      const nextActive = st === "active";
      if (
        before.role === ROLES.SUPER_ADMIN &&
        before.is_active &&
        !nextActive
      ) {
        const others = await countActiveSuperAdmins(client, { excludeUserId: uid });
        if (others < 1) {
          throw createAppError("لا يمكن تعطيل آخر سوبر أدمن نشط.", 409, {
            exposeToClient: true,
            publicCode: "LAST_SUPER_ADMIN",
          });
        }
      }
      push("is_active", nextActive);
    }

    if (patch.role !== undefined) {
      const nextRole = String(patch.role).trim();
      if (!ALLOWED_ROLES.includes(nextRole)) {
        throw createAppError("دور غير صالح.", 400, {
          exposeToClient: true,
          publicCode: "INVALID_ROLE",
        });
      }
      if (uid === actor && before.role === ROLES.SUPER_ADMIN && nextRole !== ROLES.SUPER_ADMIN) {
        throw createAppError("لا يمكنك تخفيض صلاحية حسابك كسوبر أدمن.", 403, {
          exposeToClient: true,
          publicCode: "CANNOT_DEMOTE_SELF",
        });
      }
      if (before.role === ROLES.SUPER_ADMIN && nextRole !== ROLES.SUPER_ADMIN && before.is_active) {
        const others = await countActiveSuperAdmins(client, { excludeUserId: uid });
        if (others < 1) {
          throw createAppError("لا يمكن تخفيض آخر سوبر أدمن نشط.", 409, {
            exposeToClient: true,
            publicCode: "LAST_SUPER_ADMIN",
          });
        }
      }
      push("role", nextRole);
    }

    vals.push(uid);
    const { rows: updatedRows } = await client.query(
      `UPDATE users SET ${sets.join(", ")}, updated_at = NOW()
        WHERE id = $${vals.length}
        RETURNING id, account_id, email, role, first_name, father_name, family_name,
                  phone, whatsapp, is_active, created_at, updated_at`,
      vals,
    );
    const after = updatedRows[0];
    await client.query("COMMIT");

    const beforeSnap = mapSafeUserSummary(before);
    const afterSnap = mapSafeUserSummary(after);
    await writeAudit({
      actorAdminId: actor,
      targetUserId: uid,
      action: "patch_account",
      reason: safeReason,
      beforeSnapshot: beforeSnap,
      afterSnapshot: afterSnap,
      requestId,
      metadata: { fields: keys },
    });

    return { user: afterSnap };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function patchIdentity({
  actorAdminId,
  userId,
  action,
  reason,
  adminNote = null,
  requestId = null,
} = {}) {
  const actor = toUserId(actorAdminId);
  const uid = toUserId(userId);
  const safeReason = requireReason(reason);
  const act = String(action || "").trim();
  if (!IDENTITY_ACTIONS.includes(act)) {
    throw createAppError("إجراء الهوية غير مدعوم.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_IDENTITY_ACTION",
    });
  }

  const user = await loadUserRow(uid);
  if (!user) {
    throw createAppError("المستخدم غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "USER_NOT_FOUND",
    });
  }
  if (user.role !== ROLES.FREELANCER) {
    throw createAppError("إجراءات الهوية متاحة للمستقلين فقط.", 400, {
      exposeToClient: true,
      publicCode: "NOT_FREELANCER",
    });
  }

  const beforeKyc = await loadLatestKycRequest(uid);
  const beforeSnap = mapIdentityForAdmin(beforeKyc);
  let result = null;

  if (act === "approve_identity") {
    if (!beforeKyc) {
      throw createAppError("لا يوجد طلب تفعيل للهوية.", 404, {
        exposeToClient: true,
        publicCode: "KYC_REQUEST_NOT_FOUND",
      });
    }
    result = await freelancerAccountActivationKycService.approveActivationRequest({
      requestId: beforeKyc.id,
      actorUserId: actor,
    });
  } else if (act === "reject_identity" || act === "request_resubmission") {
    if (!beforeKyc) {
      throw createAppError("لا يوجد طلب تفعيل للهوية.", 404, {
        exposeToClient: true,
        publicCode: "KYC_REQUEST_NOT_FOUND",
      });
    }
    if (beforeKyc.status === "pending_review") {
      result = await freelancerAccountActivationKycService.rejectActivationRequest({
        requestId: beforeKyc.id,
        actorUserId: actor,
        rejectionReason: safeReason,
        adminNotes: adminNote != null ? String(adminNote).slice(0, 2000) : safeReason,
      });
    } else {
      // Already not pending: force rejected for resubmission path without deleting files
      const { rows } = await pool.query(
        `UPDATE freelancer_account_activation_requests
            SET status = 'rejected',
                reviewed_by_user_id = $2,
                reviewed_at = NOW(),
                rejection_reason = $3,
                admin_notes = $4,
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [
          beforeKyc.id,
          actor,
          safeReason.slice(0, 2000),
          adminNote != null ? String(adminNote).slice(0, 2000) : safeReason.slice(0, 2000),
        ],
      );
      await pool.query(
        `UPDATE freelancer_subscriptions
            SET activation_status = 'company_rejected', updated_at = NOW()
          WHERE freelancer_user_id = $1 AND is_current = TRUE`,
        [uid],
      );
      result = { request: rows[0], forced: true };
    }
  } else if (act === "mark_pending_review") {
    if (!beforeKyc) {
      throw createAppError("لا يوجد طلب تفعيل للهوية.", 404, {
        exposeToClient: true,
        publicCode: "KYC_REQUEST_NOT_FOUND",
      });
    }
    if (beforeKyc.status === "pending_review") {
      result = { request: beforeKyc, alreadyPending: true };
    } else {
      // Clear other pending for this user (unique index), then set this one pending
      await pool.query(
        `UPDATE freelancer_account_activation_requests
            SET status = 'cancelled', updated_at = NOW()
          WHERE freelancer_user_id = $1
            AND status = 'pending_review'
            AND id <> $2`,
        [uid, beforeKyc.id],
      );
      const { rows } = await pool.query(
        `UPDATE freelancer_account_activation_requests
            SET status = 'pending_review',
                reviewed_by_user_id = NULL,
                reviewed_at = NULL,
                rejection_reason = NULL,
                admin_notes = COALESCE($3, admin_notes),
                updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [beforeKyc.id, uid, adminNote != null ? String(adminNote).slice(0, 2000) : null],
      );
      await pool.query(
        `UPDATE freelancer_subscriptions
            SET activation_status = 'company_pending', updated_at = NOW()
          WHERE freelancer_user_id = $1 AND is_current = TRUE`,
        [uid],
      );
      result = { request: rows[0] };
    }
  }

  const afterKyc = await loadLatestKycRequest(uid);
  const afterSnap = mapIdentityForAdmin(afterKyc);
  await writeAudit({
    actorAdminId: actor,
    targetUserId: uid,
    action: act,
    reason: safeReason,
    beforeSnapshot: beforeSnap,
    afterSnapshot: afterSnap,
    requestId,
    metadata: { adminNote: adminNote != null ? String(adminNote).slice(0, 500) : null },
  });

  return { identity: afterSnap, result };
}

async function cancelCurrentPlan({ actorUserId, freelancerUserId, reason }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, status, notes
         FROM freelancer_subscriptions
        WHERE freelancer_user_id = $1 AND is_current = TRUE
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [Number(freelancerUserId)],
    );
    const sub = rows[0];
    if (!sub) {
      throw createAppError("لا يوجد اشتراك حالي لإلغائه.", 404, {
        exposeToClient: true,
        publicCode: "NO_CURRENT_SUBSCRIPTION",
      });
    }
    const noteLine = `[ADMIN_CANCEL] admin=${actorUserId}; ${String(reason).slice(0, 500)}`;
    const nextNotes = [sub.notes, noteLine].filter(Boolean).join("\n").slice(0, 4000);
    const { rows: updated } = await client.query(
      `UPDATE freelancer_subscriptions
          SET status = 'cancelled',
              is_current = FALSE,
              cancelled_at = COALESCE(cancelled_at, NOW()),
              ended_at = COALESCE(ended_at, NOW()),
              notes = $2,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [sub.id, nextNotes],
    );
    await client.query("COMMIT");
    if (typeof subscriptionsService?.mapSubscription === "function") {
      return sanitizeSubscription(subscriptionsService.mapSubscription(updated[0]));
    }
    return sanitizeSubscription({
      id: String(updated[0].id),
      status: updated[0].status,
      isCurrent: false,
      cancelledAt: updated[0].cancelled_at,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function patchMembership({
  actorAdminId,
  userId,
  action,
  planId = null,
  reason,
  notes = null,
  requestId = null,
} = {}) {
  const actor = toUserId(actorAdminId);
  const uid = toUserId(userId);
  const safeReason = requireReason(reason);
  const act = String(action || "").trim();
  if (!MEMBERSHIP_ACTIONS.includes(act)) {
    throw createAppError("إجراء الباقة غير مدعوم.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MEMBERSHIP_ACTION",
    });
  }

  const user = await loadUserRow(uid);
  if (!user) {
    throw createAppError("المستخدم غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "USER_NOT_FOUND",
    });
  }
  if (user.role !== ROLES.FREELANCER) {
    throw createAppError("إجراءات الباقة متاحة للمستقلين فقط.", 400, {
      exposeToClient: true,
      publicCode: "NOT_FREELANCER",
    });
  }

  const before = sanitizeSubscription(await getCurrentSubscriptionSafe(uid));
  let after = null;
  let assignResult = null;

  if (act === "cancel_plan") {
    after = await cancelCurrentPlan({ actorUserId: actor, freelancerUserId: uid, reason: safeReason });
  } else {
    const pid = Number(planId);
    if (!Number.isInteger(pid) || pid < 1) {
      throw createAppError("معرّف الباقة مطلوب.", 400, {
        exposeToClient: true,
        publicCode: "PLAN_ID_REQUIRED",
      });
    }
    const adminNotes = [
      notes != null ? String(notes).trim() : "",
      `[ADMIN_USERS_CONTROL] action=${act}; reason=${safeReason}`,
    ]
      .filter(Boolean)
      .join("\n");

    if (typeof subscriptionsService?.assignPlanToFreelancer !== "function") {
      throw createAppError("خدمة تعيين الباقة غير متاحة.", 503, {
        exposeToClient: true,
        publicCode: "SUBSCRIPTIONS_SERVICE_UNAVAILABLE",
      });
    }

    assignResult = await subscriptionsService.assignPlanToFreelancer({
      actorUserId: actor,
      freelancerUserId: uid,
      planId: pid,
      notes: adminNotes,
    });
    after = sanitizeSubscription(assignResult?.subscription || (await getCurrentSubscriptionSafe(uid)));
  }

  await writeAudit({
    actorAdminId: actor,
    targetUserId: uid,
    action: act,
    reason: safeReason,
    beforeSnapshot: before,
    afterSnapshot: after,
    requestId,
    metadata: { planId: planId != null ? String(planId) : null },
  });

  return {
    subscription: after,
    eligibility: assignResult?.eligibility
      ? {
          eligible: assignResult.eligibility.eligible === true,
          reason: assignResult.eligibility.reason || null,
        }
      : await getEligibilitySafe(uid).then((e) =>
          e
            ? { eligible: e.eligible === true, reason: e.reason || null }
            : null,
        ),
  };
}

function adminOverrideNote(actorAdminId, action, reason, previous = null) {
  const stamp = new Date().toISOString();
  const line = `[ADMIN_OVERRIDE ${action}] by=${actorAdminId} at=${stamp}; reason=${String(reason).slice(0, 800)}`;
  return [previous, line].filter(Boolean).join("\n").slice(0, 8000);
}

async function ensureAssignmentRow(client, { courseId, freelancerId, actorAdminId }) {
  const { rows } = await client.query(
    `SELECT id FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2 LIMIT 1`,
    [courseId, freelancerId],
  );
  if (rows[0]) return rows[0].id;
  const { rows: inserted } = await client.query(
    `INSERT INTO course_assignments (course_id, freelancer_id, assigned_by, assigned_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (course_id, freelancer_id) DO UPDATE
       SET assigned_by = COALESCE(course_assignments.assigned_by, EXCLUDED.assigned_by)
     RETURNING id`,
    [courseId, freelancerId, actorAdminId],
  );
  return inserted[0]?.id;
}

async function patchTraining({
  actorAdminId,
  userId,
  action,
  courseId,
  reason,
  requestId = null,
} = {}) {
  const actor = toUserId(actorAdminId);
  const uid = toUserId(userId);
  const safeReason = requireReason(reason);
  const act = String(action || "").trim();
  if (!TRAINING_ACTIONS.includes(act)) {
    throw createAppError("إجراء التدريب غير مدعوم.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_TRAINING_ACTION",
    });
  }
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid < 1) {
    throw createAppError("معرّف الدورة مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "COURSE_ID_REQUIRED",
    });
  }

  const user = await loadUserRow(uid);
  if (!user) {
    throw createAppError("المستخدم غير موجود.", 404, {
      exposeToClient: true,
      publicCode: "USER_NOT_FOUND",
    });
  }
  if (user.role !== ROLES.FREELANCER) {
    throw createAppError("إجراءات التدريب متاحة للمستقلين فقط.", 400, {
      exposeToClient: true,
      publicCode: "NOT_FREELANCER",
    });
  }

  const beforeCourses = await loadCoursesForUser(uid);
  const beforeAgg = aggregateCoursesForAdmin(beforeCourses);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: courseRows } = await client.query(
      `SELECT id, title, is_testing_enabled, is_active FROM courses WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [cid],
    );
    const course = courseRows[0];
    if (!course || !course.is_active) {
      throw createAppError("الدورة غير موجودة.", 404, {
        exposeToClient: true,
        publicCode: "COURSE_NOT_FOUND",
      });
    }

    await ensureAssignmentRow(client, { courseId: cid, freelancerId: uid, actorAdminId: actor });
    const { rows: assignRows } = await client.query(
      `SELECT * FROM course_assignments
        WHERE course_id = $1 AND freelancer_id = $2
        LIMIT 1 FOR UPDATE`,
      [cid, uid],
    );
    const assignment = assignRows[0];
    if (!assignment) {
      throw createAppError("تعذّر تحميل إسناد الدورة.", 500, {
        exposeToClient: true,
        publicCode: "ASSIGNMENT_MISSING",
      });
    }

    if (act === "mark_course_completed" || act === "mark_final_test_passed") {
      await client.query(
        `INSERT INTO course_lesson_progress (course_id, lesson_id, freelancer_id, completed_at)
         SELECT $1, l.id, $2, NOW()
           FROM course_lessons l
          WHERE l.course_id = $1 AND l.is_active = TRUE
         ON CONFLICT (freelancer_id, course_id, lesson_id) DO NOTHING`,
        [cid, uid],
      );
      const notes = adminOverrideNote(actor, act, safeReason, assignment.audit_notes);
      await client.query(
        `UPDATE course_assignments
            SET completed_at = COALESCE(completed_at, NOW()),
                audit_confirmed = TRUE,
                audit_notes = $2,
                audit_submitted_at = COALESCE(audit_submitted_at, NOW()),
                exam_final_grade = COALESCE(exam_final_grade, 100)
          WHERE id = $1`,
        [assignment.id, notes],
      );
    } else if (act === "reset_course_progress") {
      await client.query(
        `DELETE FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2`,
        [cid, uid],
      );
      const notes = adminOverrideNote(actor, act, safeReason, assignment.audit_notes);
      await client.query(
        `UPDATE course_assignments
            SET completed_at = NULL,
                audit_confirmed = FALSE,
                audit_notes = $2,
                audit_submitted_at = NULL,
                exam_question_marks = NULL,
                exam_final_grade = NULL,
                completed_exam_file_url = NULL
          WHERE id = $1`,
        [assignment.id, notes],
      );
    } else if (act === "reset_final_test") {
      const notes = adminOverrideNote(actor, act, safeReason, assignment.audit_notes);
      await client.query(
        `UPDATE course_assignments
            SET completed_at = NULL,
                audit_confirmed = FALSE,
                audit_notes = $2,
                audit_submitted_at = NULL,
                exam_question_marks = NULL,
                exam_final_grade = NULL,
                completed_exam_file_url = NULL,
                audit_response_text = NULL,
                audit_response_file_url = NULL
          WHERE id = $1`,
        [assignment.id, notes],
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }

  const afterCourses = await loadCoursesForUser(uid);
  const afterAgg = aggregateCoursesForAdmin(afterCourses);
  await writeAudit({
    actorAdminId: actor,
    targetUserId: uid,
    action: act,
    reason: safeReason,
    beforeSnapshot: { courseId: String(cid), training: beforeAgg },
    afterSnapshot: { courseId: String(cid), training: afterAgg },
    requestId,
    metadata: { courseId: String(cid) },
  });

  return { training: afterAgg };
}

function escapeCsv(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function exportUsersCsv(userIds) {
  const ids = userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return { csv: "id,accountId,fullName,email,role,accountStatus\n", count: 0 };
  const { rows } = await pool.query(
    `SELECT id, account_id, first_name, father_name, family_name, email, role, is_active
       FROM users
      WHERE id = ANY($1::bigint[])
      ORDER BY id ASC`,
    [ids],
  );
  const header = ["id", "accountId", "fullName", "email", "role", "accountStatus"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.account_id || "",
        buildDisplayName(r),
        r.email || "",
        r.role || "",
        r.is_active ? "active" : "inactive",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
  return { csv: `${lines.join("\n")}\n`, count: rows.length };
}

async function bulkActions({
  actorAdminId,
  userIds = [],
  action,
  payload = {},
  reason,
  requestId = null,
} = {}) {
  const actor = toUserId(actorAdminId);
  const safeReason = requireReason(reason);
  const act = String(action || "").trim();
  if (!BULK_ACTIONS.includes(act)) {
    throw createAppError("إجراء جماعي غير مدعوم.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_BULK_ACTION",
    });
  }

  const rawIds = Array.isArray(userIds) ? userIds : [];
  if (!rawIds.length) {
    throw createAppError("يجب تحديد مستخدم واحد على الأقل.", 400, {
      exposeToClient: true,
      publicCode: "USER_IDS_REQUIRED",
    });
  }
  if (rawIds.length > MAX_BULK_IDS) {
    throw createAppError(`الحد الأقصى ${MAX_BULK_IDS} مستخدم لكل عملية.`, 400, {
      exposeToClient: true,
      publicCode: "BULK_LIMIT_EXCEEDED",
    });
  }

  const ids = [...new Set(rawIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))];
  const results = [];
  let succeeded = 0;
  let failed = 0;
  let csvExport = null;

  if (act === "export_selected_users_csv") {
    try {
      csvExport = await exportUsersCsv(ids);
      for (const id of ids) {
        results.push({ userId: String(id), ok: true });
        succeeded += 1;
        try {
          await writeAudit({
            actorAdminId: actor,
            targetUserId: id,
            action: act,
            reason: safeReason,
            requestId,
            metadata: { bulk: true },
          });
        } catch {
          /* export still succeeds even if single audit fails after schema check */
        }
      }
    } catch (err) {
      failed = ids.length;
      for (const id of ids) {
        results.push({
          userId: String(id),
          ok: false,
          error: err?.message || "export_failed",
          publicCode: err?.publicCode || null,
        });
      }
    }
    return {
      action: act,
      totalRequested: ids.length,
      succeeded,
      failed,
      results,
      csv: csvExport?.csv || null,
    };
  }

  for (const id of ids) {
    try {
      if (act === "set_account_status") {
        await patchAccount({
          actorAdminId: actor,
          userId: id,
          patch: { accountStatus: payload.accountStatus },
          reason: safeReason,
          requestId,
        });
      } else if (act === "assign_plan") {
        await patchMembership({
          actorAdminId: actor,
          userId: id,
          action: "assign_plan",
          planId: payload.planId,
          reason: safeReason,
          notes: payload.notes || null,
          requestId,
        });
      } else if (act === "request_kyc_resubmission") {
        await patchIdentity({
          actorAdminId: actor,
          userId: id,
          action: "request_resubmission",
          reason: safeReason,
          adminNote: payload.adminNote || null,
          requestId,
        });
      } else if (act === "mark_identity_pending_review") {
        await patchIdentity({
          actorAdminId: actor,
          userId: id,
          action: "mark_pending_review",
          reason: safeReason,
          adminNote: payload.adminNote || null,
          requestId,
        });
      }
      results.push({ userId: String(id), ok: true });
      succeeded += 1;
    } catch (err) {
      failed += 1;
      results.push({
        userId: String(id),
        ok: false,
        error: err?.exposeToClient ? err.message : "تعذّر تنفيذ الإجراء لهذا المستخدم.",
        publicCode: err?.publicCode || null,
        statusCode: err?.statusCode || 500,
      });
    }
  }

  return {
    action: act,
    totalRequested: ids.length,
    succeeded,
    failed,
    results,
  };
}

module.exports = {
  getStats,
  listUsers,
  getUserDetail,
  patchAccount,
  patchIdentity,
  patchMembership,
  patchTraining,
  bulkActions,
  requireReason,
  writeAudit,
};
