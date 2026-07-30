const { pool } = require("../config/db");
const {
  ORDERZHOUSE_FREE_PLAN_ID,
  isOrderzhouseFreePlan,
} = require("../constants/orderzhousePlansCatalog");
const notificationEventsService = require("./notificationEventsService");
const notificationService = require("./notificationService");
const freelancerSubscriptionPaymentNotifications = require("./freelancerSubscriptionPaymentNotifications");
const { getActivationFeeStatus, markActivationFeePaidOffline } = require("./subscriptionActivationFeeService");

function isMissingTableError(err) {
  return err && (err.code === "42P01" || String(err.message || "").includes("does not exist"));
}

async function safeNotify(run) {
  try {
    await run();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications]", err?.message || err);
  }
}

const SUBSCRIPTION_STATUSES = Object.freeze({
  ASSIGNED_NOT_STARTED: "assigned_not_started",
  ACTIVE: "active",
  EXPIRED: "expired",
  INACTIVE: "inactive",
  CANCELLED: "cancelled",
});

const SUBSCRIPTION_SOURCES = Object.freeze({
  ADMIN: "admin",
  MANUAL: "manual",
  STRIPE: "stripe",
});

const SUBSCRIPTION_PAYMENT_STATUSES = Object.freeze({
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const SUBSCRIPTION_ACTIVATION_STATUSES = Object.freeze({
  COMPANY_PENDING: "company_pending",
  COMPANY_APPROVED: "company_approved",
  COMPANY_REJECTED: "company_rejected",
});

function parseDateOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  // eslint-disable-next-line no-restricted-globals
  if (isNaN(d.getTime())) return null;
  return d;
}

function normalizePaymentStatus(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED;
  }
  return String(raw).trim().toLowerCase();
}

function normalizeActivationStatus(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED;
  }
  return String(raw).trim().toLowerCase();
}

function computeExpiry({ startDate, durationDays }) {
  const start = new Date(startDate);
  const ms = durationDays * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + ms);
}

async function hasFreelancerEverHadAcceptedOrder({ freelancerUserId, excludeOrderId = null }, client) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  const ex = excludeOrderId != null ? Number(excludeOrderId) : null;
  const values = [uid];
  let excludeClause = "";
  if (Number.isInteger(ex) && ex > 0) {
    values.push(ex);
    excludeClause = ` AND id <> $2`;
  }
  const { rows } = await runner.query(
    `SELECT 1
     FROM orders
     WHERE assigned_freelancer_id = $1
       AND received_at IS NOT NULL
       AND order_status IN ('assigned', 'in_progress', 'pending_client_review', 'completed', 'cancelled')
       ${excludeClause}
     LIMIT 1`,
    values,
  );
  return Boolean(rows[0]);
}

function normalizeSubscriptionSource(raw) {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  return value || null;
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    freelancer: row.freelancer_user_id
      ? {
          id: String(row.freelancer_user_id),
          firstName: row.freelancer_first_name || null,
          fatherName: row.freelancer_father_name || null,
          familyName: row.freelancer_family_name || null,
          email: row.freelancer_email || null,
          accountId: row.freelancer_account_id || null,
          phone: row.freelancer_phone || null,
          whatsapp: row.freelancer_whatsapp || null,
          country: row.freelancer_country || null,
          billingCountry: row.freelancer_billing_country || null,
        }
      : null,
    planId: String(row.plan_id),
    plan: row.plan_id ? {
      id: String(row.plan_id),
      name: row.plan_name || null,
      title: row.plan_title || null,
      durationDays: row.plan_duration_days ?? null,
      priceJod: row.plan_price_jod != null ? Number(row.plan_price_jod) : null,
      description: row.plan_description || null,
      requiresCompanyVisit: row.plan_requires_company_visit ?? null,
    } : null,
    assignedByUserId: row.assigned_by_user_id ? String(row.assigned_by_user_id) : null,
    assignedAt: row.assigned_at,
    hasFirstOrder: row.has_first_order,
    firstOrderDate: row.first_order_date,
    actualStartDate: row.actual_start_date,
    expiryDate: row.expiry_date,
    status: row.status,
    isCurrent: row.is_current,
    source: normalizeSubscriptionSource(row.source),
    paymentStatus: normalizePaymentStatus(row.payment_status),
    activationStatus: normalizeActivationStatus(row.activation_status),
    companyActivatedAt: row.company_activated_at,
    companyActivatedByUserId: row.company_activated_by_user_id ? String(row.company_activated_by_user_id) : null,
    stripeSessionId: row.stripe_session_id || null,
    stripePaymentIntentId: row.stripe_payment_intent_id || null,
    paidAt: row.paid_at || null,
    firstOrderId: row.first_order_id ? String(row.first_order_id) : null,
    notes: row.notes,
    cancelledAt: row.cancelled_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPlanDurationDays(planId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT duration_days, is_active, deleted_at FROM plans WHERE id = $1 LIMIT 1`,
    [Number(planId)],
  );
  const plan = rows[0];
  if (!plan || plan.deleted_at) {
    const err = new Error("Plan not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!plan.is_active) {
    const err = new Error("Plan is inactive.");
    err.statusCode = 400;
    throw err;
  }
  return plan.duration_days;
}

/**
 * Snapshot for assignment / eligibility checks (legacy `users.role` OR RBAC freelancer role).
 * @returns {Promise<{ id: number, isActive: boolean, emailVerified: boolean, isFreelancer: boolean } | null>}
 */
async function getFreelancerIdentitySnapshot(userId, client) {
  const runner = client || pool;
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid < 1) return null;

  const legacyOnly = async () => {
    const { rows } = await runner.query(
      `SELECT id, role, is_active, COALESCE(email_verified, TRUE) AS email_verified
       FROM users WHERE id = $1 LIMIT 1`,
      [uid],
    );
    const u = rows[0];
    if (!u) return null;
    return {
      id: Number(u.id),
      isActive: Boolean(u.is_active),
      emailVerified: Boolean(u.email_verified),
      isFreelancer: String(u.role || "").trim() === "freelancer",
    };
  };

  try {
    const { rows } = await runner.query(
      `SELECT u.id,
              u.is_active,
              COALESCE(u.email_verified, TRUE) AS email_verified,
              u.role AS legacy_role,
              EXISTS (
                SELECT 1 FROM user_roles ur
                INNER JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id AND r.name = 'freelancer'
              ) AS has_freelancer_rbac
       FROM users u
       WHERE u.id = $1
       LIMIT 1`,
      [uid],
    );
    const row = rows[0];
    if (!row) return null;
    const legacy = String(row.legacy_role || "").trim() === "freelancer";
    return {
      id: Number(row.id),
      isActive: Boolean(row.is_active),
      emailVerified: Boolean(row.email_verified),
      isFreelancer: legacy || Boolean(row.has_freelancer_rbac),
    };
  } catch (e) {
    if (isMissingTableError(e)) return legacyOnly();
    throw e;
  }
}

async function assertUserIsFreelancer(userId, client) {
  const runner = client || pool;
  const uid = Number(userId);
  const failNotFreelancer = () => {
    const err = new Error("Target user must be a freelancer.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  };
  const snap = await getFreelancerIdentitySnapshot(uid, runner);
  if (!snap) {
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!snap.isFreelancer) failNotFreelancer();
}

async function endCurrentSubscription({ freelancerUserId, endedAt = new Date() }, client) {
  const runner = client || pool;
  await runner.query(
    `UPDATE freelancer_subscriptions
     SET is_current = FALSE, ended_at = COALESCE(ended_at, $2), updated_at = NOW()
     WHERE freelancer_user_id = $1 AND is_current = TRUE`,
    [Number(freelancerUserId), endedAt],
  );
}

const ADMIN_ASSIGNMENT_OFFLINE_PAYMENT_NOTE = "Plan assigned and paid offline by staff";
const ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE =
  "Activation fee included with Admin plan assignment (offline)";

async function loadPlanPricingForAssignment(planId, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT id, name, title, price_jod, currency, duration_days, is_active, deleted_at
     FROM plans
     WHERE id = $1::bigint
     LIMIT 1`,
    [Number(planId)],
  );
  const plan = rows[0];
  if (!plan || plan.deleted_at) {
    const err = new Error("Plan not found.");
    err.statusCode = 404;
    throw err;
  }
  if (!plan.is_active) {
    const err = new Error("Plan is inactive.");
    err.statusCode = 400;
    throw err;
  }
  const priceJod = plan.price_jod != null ? Number(plan.price_jod) : 0;
  const isFree =
    isOrderzhouseFreePlan({ id: plan.id, name: plan.name }) ||
    (Number.isFinite(priceJod) && priceJod <= 0);
  return {
    id: Number(plan.id),
    name: plan.name,
    title: plan.title,
    priceJod: Number.isFinite(priceJod) ? priceJod : 0,
    currency: String(plan.currency || "JOD").toUpperCase(),
    durationDays: Number(plan.duration_days),
    isFree,
  };
}

/**
 * Mark subscription + yearly activation fee as paid offline for staff assignment.
 * Idempotent for activation fee via markActivationFeePaidOffline.
 */
async function applyAdminAssignmentOfflinePayments(
  {
    actorUserId,
    freelancerUserId,
    subscriptionId,
    planPricing,
    paidAt = new Date(),
  },
  client,
) {
  const runner = client || pool;
  const when = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const uid = Number(freelancerUserId);
  const sid = Number(subscriptionId);
  const actor = actorUserId != null ? Number(actorUserId) : null;

  const paymentStatus = planPricing.isFree
    ? SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED
    : SUBSCRIPTION_PAYMENT_STATUSES.PAID;

  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET payment_status = $2::varchar,
         paid_at = CASE
           WHEN $2::text = 'paid' THEN COALESCE(paid_at, $3::timestamptz)
           ELSE paid_at
         END,
         activation_status = 'company_approved',
         company_activated_at = COALESCE(company_activated_at, $3::timestamptz),
         company_activated_by_user_id = COALESCE(company_activated_by_user_id, $4),
         notes = CASE
           WHEN notes IS NULL OR btrim(notes) = '' THEN $5::text
           WHEN position($5::text in notes) > 0 THEN notes
           ELSE notes || E'\n' || $5::text
         END,
         updated_at = NOW()
     WHERE id = $1::bigint
       AND freelancer_user_id = $6::bigint
     RETURNING *`,
    [
      sid,
      paymentStatus,
      when,
      actor,
      ADMIN_ASSIGNMENT_OFFLINE_PAYMENT_NOTE,
      uid,
    ],
  );

  if (!updated[0]) {
    const err = new Error("Subscription not found for offline payment update.");
    err.statusCode = 404;
    throw err;
  }

  const feeResult = await markActivationFeePaidOffline(
    {
      adminUserId: actor,
      freelancerUserId: uid,
      notes: ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE,
      paidAt: when,
    },
    runner,
  );

  return {
    subscription: mapSubscription(updated[0]),
    paymentStatus,
    subscriptionFee: planPricing.isFree
      ? { required: false, amountJod: 0, status: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED }
      : {
          required: true,
          amountJod: planPricing.priceJod,
          currency: planPricing.currency,
          status: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
          method: "admin_offline",
          paidAt: when,
        },
    activationFee: feeResult,
  };
}

async function assignPlanToFreelancer({ actorUserId, freelancerUserId, planId, notes = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await assertUserIsFreelancer(freelancerUserId, client);
    const plansService = require("./plansService");
    const resolved = await plansService.resolveAssignableSubscriptionPlanId(planId, client);
    const assignmentPlanId = resolved.assignmentPlanId;
    const planPricing = await loadPlanPricingForAssignment(assignmentPlanId, client);
    const durationDays = planPricing.durationDays;
    const paidAt = new Date();

    const assignmentNotes = [notes, ADMIN_ASSIGNMENT_OFFLINE_PAYMENT_NOTE]
      .map((n) => (n != null ? String(n).trim() : ""))
      .filter(Boolean)
      .join("\n");

    // End any current subscription (history preserved)
    await endCurrentSubscription({ freelancerUserId }, client);

    const paymentStatus = planPricing.isFree
      ? SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED
      : SUBSCRIPTION_PAYMENT_STATUSES.PAID;

    const { rows } = await client.query(
      `INSERT INTO freelancer_subscriptions (
        freelancer_user_id, plan_id, assigned_by_user_id, notes,
        status, has_first_order, first_order_date, actual_start_date, expiry_date,
        is_current, source, payment_status, activation_status,
        paid_at, company_activated_at, company_activated_by_user_id
      ) VALUES ($1,$2,$3,$4,$5,FALSE,NULL,NULL,NULL,TRUE,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        Number(freelancerUserId),
        Number(assignmentPlanId),
        actorUserId ? Number(actorUserId) : null,
        assignmentNotes || null,
        SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
        SUBSCRIPTION_SOURCES.ADMIN,
        paymentStatus,
        SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
        planPricing.isFree ? null : paidAt,
        paidAt,
        actorUserId ? Number(actorUserId) : null,
      ],
    );

    const feeResult = await markActivationFeePaidOffline(
      {
        adminUserId: actorUserId ? Number(actorUserId) : null,
        freelancerUserId: Number(freelancerUserId),
        notes: ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE,
        paidAt,
      },
      client,
    );

    const subscription = mapSubscription(rows[0]);
    await safeNotify(() =>
      notificationEventsService.notifySubscriptionOwner(
        {
          subscription: rows[0],
          actorUserId: actorUserId ? Number(actorUserId) : null,
          type: "subscription.assigned",
          title: "تم تعيين اشتراك لك",
          message: "تم تعيين باقة اشتراك لك من الإدارة (مدفوعة أوفلاين).",
          priority: "high",
          dedupeKey: `subscription_assigned_${String(rows[0].id)}`,
          metadata: {
            subscriptionId: String(rows[0].id),
            planId: String(assignmentPlanId),
            selectedPlanId: String(resolved.selectedPlanId),
            displayPlanId: resolved.displayPlanId != null ? String(resolved.displayPlanId) : null,
            resolvedFromDisplay: resolved.resolvedFromDisplay === true,
            subscriptionPaymentStatus: paymentStatus,
            activationFeeRecorded: feeResult.recorded === true,
            offlinePaidByStaff: true,
          },
        },
        client,
      ),
    );

    await client.query("COMMIT");

    const activationFeeStatus = await getActivationFeeStatus(freelancerUserId);
    const eligibility = await canFreelancerTakeOrders(String(freelancerUserId));

    return {
      subscription,
      durationDays,
      activationFeeStatus,
      eligibility,
      offlinePayments: {
        subscriptionFee: planPricing.isFree
          ? { required: false, amountJod: 0, status: SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED }
          : {
              required: true,
              amountJod: planPricing.priceJod,
              currency: planPricing.currency,
              status: SUBSCRIPTION_PAYMENT_STATUSES.PAID,
              method: "admin_offline",
              paidAt,
            },
        activationFee: {
          recorded: feeResult.recorded === true,
          alreadyPaid: feeResult.alreadyPaid === true,
          amountJod: activationFeeStatus?.amountJod ?? null,
          status: "paid_offline",
        },
      },
      resolvedPlan: {
        assignmentPlanId: String(assignmentPlanId),
        selectedPlanId: String(resolved.selectedPlanId),
        displayPlanId: resolved.displayPlanId != null ? String(resolved.displayPlanId) : null,
        resolvedFromDisplay: resolved.resolvedFromDisplay === true,
        planTitle: planPricing.title || planPricing.name || null,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply offline subscription + activation payments to an existing current admin subscription
 * without creating a new subscription row (data correction / backfill).
 */
async function applyOfflinePaymentsToExistingAdminAssignment({
  actorUserId,
  freelancerUserId,
  subscriptionId,
  expectedPlanId = null,
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT fs.*, p.price_jod, p.name AS plan_name, p.title AS plan_title, p.currency
       FROM freelancer_subscriptions fs
       JOIN plans p ON p.id = fs.plan_id
       WHERE fs.id = $1::bigint
       FOR UPDATE`,
      [Number(subscriptionId)],
    );
    const sub = rows[0];
    if (!sub) {
      const err = new Error("Subscription not found.");
      err.statusCode = 404;
      throw err;
    }
    if (Number(sub.freelancer_user_id) !== Number(freelancerUserId)) {
      const err = new Error("Subscription does not belong to the specified freelancer.");
      err.statusCode = 409;
      throw err;
    }
    if (sub.is_current !== true) {
      const err = new Error("Subscription is not the current subscription.");
      err.statusCode = 409;
      throw err;
    }
    if (String(sub.source || "").toLowerCase() !== SUBSCRIPTION_SOURCES.ADMIN) {
      const err = new Error("Subscription is not an Admin assignment.");
      err.statusCode = 409;
      throw err;
    }
    if (expectedPlanId != null && Number(sub.plan_id) !== Number(expectedPlanId)) {
      const err = new Error("Subscription plan does not match expected canonical plan.");
      err.statusCode = 409;
      throw err;
    }
    if (String(sub.status) !== SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED) {
      const err = new Error("Subscription status is not assigned_not_started.");
      err.statusCode = 409;
      throw err;
    }

    const planPricing = await loadPlanPricingForAssignment(sub.plan_id, client);
    const offline = await applyAdminAssignmentOfflinePayments(
      {
        actorUserId,
        freelancerUserId,
        subscriptionId: sub.id,
        planPricing,
      },
      client,
    );

    await client.query("COMMIT");

    const activationFeeStatus = await getActivationFeeStatus(freelancerUserId);
    const eligibility = await canFreelancerTakeOrders(String(freelancerUserId));

    return {
      subscription: offline.subscription,
      offlinePayments: {
        subscriptionFee: offline.subscriptionFee,
        activationFee: offline.activationFee,
      },
      activationFeeStatus,
      eligibility,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function getCurrentSubscriptionForFreelancer(freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT
       fs.*,
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
  return mapSubscription(rows[0]);
}

async function activateCurrentSubscriptionOnFirstOrder({ freelancerUserId, activatedAt = new Date() }, client) {
  const runner = client || pool;
  const at = activatedAt instanceof Date ? activatedAt : new Date(activatedAt);

  const { rows } = await runner.query(
    `SELECT
       fs.*,
       p.duration_days AS plan_duration_days,
       p.name AS plan_name,
       p.title AS plan_title,
       p.price_jod AS plan_price_jod
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
     ORDER BY fs.id DESC
     LIMIT 1
     FOR UPDATE`,
    [Number(freelancerUserId)],
  );

  const sub = rows[0];
  if (!sub) return null;

  // Only activate once, on the very first real order.
  if (sub.has_first_order || sub.status !== SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED) {
    return mapSubscription(sub);
  }

  const durationDays = Number(sub.plan_duration_days);
  const expiryDate = computeExpiry({ startDate: at, durationDays });

  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET has_first_order = TRUE,
         first_order_date = $2,
         actual_start_date = $2,
         expiry_date = $3,
         status = $4,
         updated_at = NOW()
     WHERE id = $1
       AND is_current = TRUE
       AND has_first_order = FALSE
       AND status = 'assigned_not_started'
     RETURNING *`,
    [Number(sub.id), at, expiryDate, SUBSCRIPTION_STATUSES.ACTIVE],
  );

  // If a concurrent request already activated it, fall back to the locked row we read.
  return mapSubscription(updated[0] || sub);
}

async function activateCurrentSubscriptionOnFirstAcceptedOrder(
  { freelancerUserId, orderId, activatedAt = new Date() },
  client,
) {
  const runner = client || pool;
  const at = activatedAt instanceof Date ? activatedAt : new Date(activatedAt);
  const oid = Number(orderId);
  if (!Number.isInteger(oid) || oid < 1) {
    const err = new Error("Invalid order id for subscription activation.");
    err.statusCode = 400;
    throw err;
  }

  const { rows } = await runner.query(
    `SELECT
       fs.*,
       p.duration_days AS plan_duration_days
     FROM freelancer_subscriptions fs
     JOIN plans p ON p.id = fs.plan_id
     WHERE fs.freelancer_user_id = $1 AND fs.is_current = TRUE
     ORDER BY fs.id DESC
     LIMIT 1
     FOR UPDATE`,
    [Number(freelancerUserId)],
  );
  const sub = rows[0];
  if (!sub) return null;

  const hadAcceptedOrderBefore = await hasFreelancerEverHadAcceptedOrder({
    freelancerUserId,
    excludeOrderId: oid,
  }, runner);
  if (hadAcceptedOrderBefore) return mapSubscription(sub);

  if (sub.activation_status !== SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED) return mapSubscription(sub);
  if (
    sub.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.PAID &&
    sub.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED &&
    sub.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.PENDING
  ) {
    return mapSubscription(sub);
  }
  if (sub.has_first_order || sub.actual_start_date || sub.status !== SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED) {
    return mapSubscription(sub);
  }

  const durationDays = Number(sub.plan_duration_days);
  const expiryDate = computeExpiry({ startDate: at, durationDays });

  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET has_first_order = TRUE,
         first_order_id = $2,
         first_order_date = $3,
         actual_start_date = $3,
         expiry_date = $4,
         status = $5,
         updated_at = NOW()
     WHERE id = $1
       AND is_current = TRUE
       AND has_first_order = FALSE
       AND actual_start_date IS NULL
       AND status = 'assigned_not_started'
     RETURNING *`,
    [Number(sub.id), oid, at, expiryDate, SUBSCRIPTION_STATUSES.ACTIVE],
  );
  const result = updated[0] || sub;
  if (updated[0]) {
    await safeNotify(() =>
      notificationService.createIfNotExists(
        {
          recipientUserId: Number(result.freelancer_user_id),
          recipientRole: "freelancer",
          actorUserId: null,
          type: "subscription.started",
          title: "بدأ اشتراكك فعلياً",
          message: "بدأ اشتراكك مع أول مشروع مقبول.",
          entityType: "subscription",
          entityId: Number(result.id),
          link: `/dashboard/freelancer/my-orders/${encodeURIComponent(String(oid))}`,
          priority: "high",
          metadata: { subscriptionId: String(result.id), orderId: String(oid) },
        },
        `subscription_started_${String(result.id)}`,
        runner,
      ),
    );
  }
  return mapSubscription(result);
}

async function fulfillFreelancerSubscriptionStripePayment(
  {
    freelancerUserId,
    planId,
    stripeSessionId,
    stripePaymentIntentId = null,
    paidAt = new Date(),
    subscriptionId = null,
  },
  client,
) {
  const runner = client || pool;
  const uid = Number(freelancerUserId);
  const pid = Number(planId);
  const sid =
    stripeSessionId != null && String(stripeSessionId).trim() !== "" ? String(stripeSessionId).trim() : null;
  const legacySubId =
    subscriptionId != null && Number.isInteger(Number(subscriptionId)) && Number(subscriptionId) > 0
      ? Number(subscriptionId)
      : null;
  const paidAtDate = paidAt instanceof Date ? paidAt : new Date(paidAt);

  if (sid) {
    const { rows: bySession } = await runner.query(
      `SELECT * FROM freelancer_subscriptions WHERE stripe_session_id = $1 LIMIT 1 FOR UPDATE`,
      [sid],
    );
    if (bySession[0]) {
      // Row already exists for this Stripe session → previously processed (retry / duplicate event).
      const existing = mapSubscription(bySession[0]);
      if (existing) existing.freshlyPaid = false;
      return existing;
    }
  }

  if (legacySubId) {
    const { rows: legacyRows } = await runner.query(
      `SELECT * FROM freelancer_subscriptions WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [legacySubId],
    );
    const legacy = legacyRows[0];
    if (legacy) {
      if (legacy.payment_status === SUBSCRIPTION_PAYMENT_STATUSES.PAID) {
        // Already paid → not a fresh transition (idempotent).
        const existing = mapSubscription(legacy);
        if (existing) existing.freshlyPaid = false;
        return existing;
      }
      if (legacy.payment_status === SUBSCRIPTION_PAYMENT_STATUSES.PENDING) {
        const { rows: upgraded } = await runner.query(
          `UPDATE freelancer_subscriptions
           SET payment_status = 'paid',
               activation_status = 'company_pending',
               status = 'inactive',
               stripe_session_id = COALESCE($2, stripe_session_id),
               stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
               paid_at = COALESCE($4, paid_at),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [legacySubId, sid, stripePaymentIntentId || null, paidAtDate],
        );
        // Pending → paid: a genuine paid transition for this subscription.
        const upgradedSub = mapSubscription(upgraded[0]);
        if (upgradedSub) upgradedSub.freshlyPaid = true;
        return upgradedSub;
      }
    }
  }

  await assertUserIsFreelancer(uid, runner);
  await getPlanDurationDays(pid, runner);
  await endCurrentSubscription({ freelancerUserId: uid }, runner);

  const { rows: inserted } = await runner.query(
    `INSERT INTO freelancer_subscriptions (
      freelancer_user_id, plan_id, assigned_by_user_id, notes,
      status, has_first_order, first_order_date, actual_start_date, expiry_date, is_current,
      source, payment_status, activation_status, stripe_session_id, stripe_payment_intent_id, paid_at
    ) VALUES ($1,$2,NULL,NULL,$3,FALSE,NULL,NULL,NULL,TRUE,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      uid,
      pid,
      SUBSCRIPTION_STATUSES.INACTIVE,
      SUBSCRIPTION_SOURCES.STRIPE,
      SUBSCRIPTION_PAYMENT_STATUSES.PAID,
      SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
      sid,
      stripePaymentIntentId || null,
      paidAtDate,
    ],
  );
  // Brand-new paid row inserted: a genuine paid transition.
  const insertedSub = mapSubscription(inserted[0]);
  if (insertedSub) insertedSub.freshlyPaid = true;
  return insertedSub;
}

/** @deprecated Legacy name — creates/fulfills paid Stripe subscription after checkout completes. */
async function markFreelancerSubscriptionStripePaymentPaid(params, client) {
  return fulfillFreelancerSubscriptionStripePayment(params, client);
}

async function markFreelancerSubscriptionStripePaymentFailed(
  { freelancerUserId, planId, stripeSessionId = null, stripePaymentIntentId = null },
  client,
) {
  const runner = client || pool;
  const sid = stripeSessionId != null && String(stripeSessionId).trim() !== "" ? String(stripeSessionId).trim() : null;

  if (sid) {
    const { rows: bySession } = await runner.query(
      `SELECT id, freelancer_user_id, plan_id FROM freelancer_subscriptions
       WHERE stripe_session_id = $1 AND payment_status = 'pending' AND source = 'stripe'
       LIMIT 1 FOR UPDATE`,
      [sid],
    );
    if (bySession[0]) {
      await runner.query(`DELETE FROM freelancer_subscriptions WHERE id = $1`, [Number(bySession[0].id)]);
      await safeNotify(() =>
        freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentFailed(
          {
            freelancerUserId: Number(bySession[0].freelancer_user_id),
            planId: Number(bySession[0].plan_id),
            subscriptionId: Number(bySession[0].id),
            stripeSessionId: sid,
            stripePaymentIntentId: stripePaymentIntentId || null,
            source: "mark_freelancer_subscription_stripe_payment_failed",
          },
          runner,
        ),
      );
      return null;
    }
  }

  const { rows } = await runner.query(
    `SELECT id, freelancer_user_id, plan_id FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
       AND plan_id = $2
       AND is_current = TRUE
       AND source = 'stripe'
       AND payment_status = 'pending'
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [Number(freelancerUserId), Number(planId)],
  );
  const legacyPending = rows[0];
  if (!legacyPending) return null;

  await runner.query(`DELETE FROM freelancer_subscriptions WHERE id = $1`, [Number(legacyPending.id)]);
  await safeNotify(() =>
    freelancerSubscriptionPaymentNotifications.notifyFreelancerSubscriptionPaymentFailed(
      {
        freelancerUserId: Number(legacyPending.freelancer_user_id),
        planId: Number(legacyPending.plan_id),
        subscriptionId: Number(legacyPending.id),
        stripeSessionId: stripeSessionId || null,
        stripePaymentIntentId: stripePaymentIntentId || null,
        source: "mark_freelancer_subscription_stripe_payment_failed",
      },
      runner,
    ),
  );
  return null;
}

async function activateCompanyApprovalForSubscription({ actorUserId, subscriptionId }, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM freelancer_subscriptions WHERE id = $1 LIMIT 1 FOR UPDATE`, [
    Number(subscriptionId),
  ]);
  const existing = rows[0];
  if (!existing) {
    const err = new Error("Subscription not found.");
    err.statusCode = 404;
    throw err;
  }
  if (
    existing.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.PAID &&
    existing.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED &&
    existing.payment_status !== SUBSCRIPTION_PAYMENT_STATUSES.PENDING
  ) {
    const err = new Error("Subscription payment is not completed.");
    err.statusCode = 409;
    throw err;
  }
  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET activation_status = 'company_approved',
         company_activated_at = COALESCE(company_activated_at, NOW()),
         company_activated_by_user_id = COALESCE($2, company_activated_by_user_id),
         status = CASE WHEN has_first_order THEN status ELSE 'assigned_not_started' END,
         payment_status = CASE
           WHEN payment_status = 'pending' THEN 'paid'
           ELSE payment_status
         END,
         paid_at = CASE
           WHEN payment_status = 'pending' THEN COALESCE(paid_at, NOW())
           ELSE paid_at
         END,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(subscriptionId), actorUserId ? Number(actorUserId) : null],
  );
  await safeNotify(() =>
    notificationEventsService.notifySubscriptionOwner(
      {
        subscription: updated[0],
        actorUserId: actorUserId ? Number(actorUserId) : null,
        type: "subscription.company.activated",
        title: "تم تفعيل اشتراكك من الشركة",
        message: "تمت الموافقة على الاشتراك ويمكنك البدء باستلام المشاريع.",
        priority: "high",
        dedupeKey: `subscription_company_activated_${String(updated[0].id)}`,
        metadata: { subscriptionId: String(updated[0].id) },
      },
      runner,
    ),
  );
  return mapSubscription(updated[0]);
}

async function recalculateSubscriptionDates({ subscriptionId }, client) {
  const runner = client || pool;
  const { rows } = await runner.query(`SELECT * FROM freelancer_subscriptions WHERE id = $1 LIMIT 1`, [
    Number(subscriptionId),
  ]);
  const sub = rows[0];
  if (!sub) {
    const err = new Error("Subscription not found.");
    err.statusCode = 404;
    throw err;
  }

  const durationDays = await getPlanDurationDays(sub.plan_id, runner);

  if (!sub.has_first_order) {
    await runner.query(
      `UPDATE freelancer_subscriptions
       SET first_order_date = NULL,
           actual_start_date = NULL,
           expiry_date = NULL,
           status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [Number(subscriptionId), SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED],
    );
    return { ...sub, status: SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED, first_order_date: null, actual_start_date: null, expiry_date: null };
  }

  const firstOrderDate = new Date(sub.first_order_date);
  const actualStartDate = firstOrderDate;
  const expiryDate = computeExpiry({ startDate: actualStartDate, durationDays });
  const now = new Date();
  const nextStatus = now > expiryDate ? SUBSCRIPTION_STATUSES.EXPIRED : SUBSCRIPTION_STATUSES.ACTIVE;

  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET actual_start_date = $2,
         expiry_date = $3,
         status = $4,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(subscriptionId), actualStartDate, expiryDate, nextStatus],
  );

  return updated[0];
}

async function updateSubscription({ actorUserId, subscriptionId, patch }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(`SELECT * FROM freelancer_subscriptions WHERE id = $1 LIMIT 1`, [
      Number(subscriptionId),
    ]);
    const existing = rows[0];
    if (!existing) {
      const err = new Error("Subscription not found.");
      err.statusCode = 404;
      throw err;
    }

    // status changes (manual) are allowed but must remain consistent with dates
    let nextStatus = existing.status;
    if (patch.status !== undefined) {
      nextStatus = patch.status;
    }

    let hasFirstOrder = existing.has_first_order;
    if (patch.hasFirstOrder !== undefined) {
      hasFirstOrder = Boolean(patch.hasFirstOrder);
    }

    let firstOrderDate = existing.first_order_date;
    if (patch.firstOrderDate !== undefined) {
      firstOrderDate = patch.firstOrderDate ? parseDateOrNull(patch.firstOrderDate) : null;
    }

    // Enforce first order rules
    if (hasFirstOrder) {
      if (!firstOrderDate) {
        const err = new Error("firstOrderDate is required when hasFirstOrder is true.");
        err.statusCode = 400;
        throw err;
      }
    } else {
      firstOrderDate = null;
    }

    const notes = patch.notes !== undefined ? patch.notes : existing.notes;

    // Prepare dates so the table CHECK constraint is satisfied at UPDATE time.
    // The table requires:
    // - has_first_order=false => all dates NULL
    // - has_first_order=true  => all dates NOT NULL
    let actualStartDate = existing.actual_start_date;
    let expiryDate = existing.expiry_date;
    if (!hasFirstOrder) {
      actualStartDate = null;
      expiryDate = null;
    } else {
      const durationDays = await getPlanDurationDays(existing.plan_id, client);
      actualStartDate = firstOrderDate;
      expiryDate = computeExpiry({ startDate: actualStartDate, durationDays });
    }

    // Apply base fields first; status override is handled after recalculation.
    await client.query(
      `UPDATE freelancer_subscriptions
       SET has_first_order = $2,
           first_order_date = $3,
           actual_start_date = $4,
           expiry_date = $5,
           notes = $6,
           status = $7,
           updated_at = NOW()
       WHERE id = $1`,
      [Number(subscriptionId), hasFirstOrder, firstOrderDate, actualStartDate, expiryDate, notes, nextStatus],
    );

    // Recalculate active/expiry based on first order + plan duration
    const recalcedRow = await recalculateSubscriptionDates({ subscriptionId }, client);

    // If cancelled/inactive explicitly, respect that override while keeping dates consistent
    if ([SUBSCRIPTION_STATUSES.CANCELLED, SUBSCRIPTION_STATUSES.INACTIVE].includes(nextStatus)) {
      const { rows: override } = await client.query(
        `UPDATE freelancer_subscriptions
         SET status = $2,
             cancelled_at = CASE WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, NOW()) ELSE cancelled_at END,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [Number(subscriptionId), nextStatus],
      );
      await client.query("COMMIT");
      return mapSubscription(override[0]);
    }

    await client.query("COMMIT");
    return mapSubscription(recalcedRow);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function listSubscriptions({
  page = 1,
  limit = 20,
  freelancerUserId = null,
  planId = null,
  status = null,
  search = null,
} = {}) {
  const { enrichSubscriptionsWithPaymentCountry } = require("./stripeSubscriptionCountryService");

  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pg - 1) * lim;

  const values = [];
  const where = ["1=1"];
  let i = 1;

  where.push(`NOT (
    fs.payment_status = 'pending'
    AND fs.source = 'stripe'
  )`);

  // Hide superseded pending attempts: a pending row is a historical attempt when a
  // paid row already exists for the same freelancer + plan. Keeps the list free of
  // duplicate rows while pagination/total counts stay consistent.
  where.push(`NOT (
    fs.payment_status = 'pending'
    AND COALESCE(fs.activation_status, '') IN ('', 'company_pending')
    AND EXISTS (
      SELECT 1 FROM freelancer_subscriptions fs_paid
      WHERE fs_paid.freelancer_user_id = fs.freelancer_user_id
        AND fs_paid.plan_id = fs.plan_id
        AND fs_paid.payment_status = 'paid'
    )
  )`);

  if (freelancerUserId) {
    where.push(`fs.freelancer_user_id = $${i}`);
    values.push(Number(freelancerUserId));
    i += 1;
  }
  if (status) {
    where.push(`fs.status = $${i}`);
    values.push(String(status));
    i += 1;
  }
  if (planId) {
    where.push(`fs.plan_id = $${i}`);
    values.push(Number(planId));
    i += 1;
  }

  const searchTerm = search != null ? String(search).trim() : "";
  if (searchTerm) {
    const pattern = `%${searchTerm.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    const idNum = /^\d+$/.test(searchTerm) ? Number.parseInt(searchTerm, 10) : null;
    if (idNum != null) {
      where.push(`(
        fs.id = $${i}
        OR fs.freelancer_user_id = $${i}
        OR u.first_name ILIKE $${i + 1}
        OR u.father_name ILIKE $${i + 1}
        OR u.family_name ILIKE $${i + 1}
        OR u.email ILIKE $${i + 1}
        OR u.account_id ILIKE $${i + 1}
      )`);
      values.push(idNum, pattern);
      i += 2;
    } else {
      where.push(`(
        u.first_name ILIKE $${i}
        OR u.father_name ILIKE $${i}
        OR u.family_name ILIKE $${i}
        OR u.email ILIKE $${i}
        OR u.account_id ILIKE $${i}
      )`);
      values.push(pattern);
      i += 1;
    }
  }

  const whereSql = where.join(" AND ");
  const fromJoin = `FROM freelancer_subscriptions fs
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     LEFT JOIN plans p ON p.id = fs.plan_id`;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromJoin} WHERE ${whereSql}`,
    values,
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / lim));

  const aggRes = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE fs.status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE fs.status = 'assigned_not_started')::int AS not_started,
       COUNT(*) FILTER (WHERE fs.status IN ('inactive', 'cancelled'))::int AS inactive_cancelled,
       COUNT(*) FILTER (WHERE
         fs.activation_status = 'company_pending'
         OR (fs.payment_status = 'paid' AND COALESCE(fs.activation_status, '') <> 'company_approved')
       )::int AS pending_activation,
       COUNT(*) FILTER (WHERE
         fs.status = 'active'
         AND fs.expiry_date IS NOT NULL
         AND fs.expiry_date > NOW()
         AND fs.expiry_date <= NOW() + INTERVAL '7 days'
       )::int AS expiring_soon
     ${fromJoin}
     WHERE ${whereSql}`,
    values,
  );
  const agg = aggRes.rows[0] || {};

  const listValues = [...values, lim, offset];
  const { rows } = await pool.query(
    `SELECT
       fs.*,
       u.first_name AS freelancer_first_name,
       u.father_name AS freelancer_father_name,
       u.family_name AS freelancer_family_name,
       u.email AS freelancer_email,
       u.account_id AS freelancer_account_id,
       u.phone AS freelancer_phone,
       u.whatsapp AS freelancer_whatsapp,
       p.name AS plan_name,
       p.title AS plan_title,
       p.duration_days AS plan_duration_days,
       p.price_jod AS plan_price_jod
     ${fromJoin}
     WHERE ${whereSql}
     ORDER BY fs.created_at DESC, fs.id DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    listValues,
  );

  const mapped = rows.map(mapSubscription);
  const enriched = await enrichSubscriptionsWithPaymentCountry(mapped);

  return {
    subscriptions: enriched,
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages,
      hasNextPage: pg < totalPages,
      hasPrevPage: pg > 1,
    },
    aggregates: {
      total,
      active: agg.active ?? 0,
      notStarted: agg.not_started ?? 0,
      inactiveCancelled: agg.inactive_cancelled ?? 0,
      pendingActivation: agg.pending_activation ?? 0,
      expiringSoon: agg.expiring_soon ?? 0,
    },
  };
}

const ACTIVATION_QUEUE_WHERE_SQL = `fs.is_current = TRUE
  AND fs.status NOT IN ('expired', 'cancelled')
  AND (
    (
      fs.activation_status = 'company_pending'
      AND fs.payment_status IN ('paid', 'pending', 'not_required')
    )
    OR
    (
      fs.source = 'admin'
      AND fs.payment_status = 'not_required'
      AND fs.assigned_by_user_id IS NOT NULL
      AND COALESCE(fs.notes, '') <> 'auto_default_free_plan'
      AND fs.status IN ('assigned_not_started', 'active')
      AND fs.activation_status = 'company_approved'
    )
  )`;

const ACTIVATION_QUEUE_ORDER_SQL = `COALESCE(fs.assigned_at, fs.paid_at, fs.created_at) DESC,
     fs.id DESC`;

function mapActivationQueueSubscription(row) {
  const base = mapSubscription(row);
  if (!base) return null;
  const payment = normalizePaymentStatus(row.payment_status);
  const activation = normalizeActivationStatus(row.activation_status);
  const source = normalizeSubscriptionSource(row.source);
  const notes = String(row.notes || "").trim();
  const st = String(row.status || "").trim().toLowerCase();
  const isAdminAssigned =
    source === SUBSCRIPTION_SOURCES.ADMIN &&
    payment === SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED &&
    row.assigned_by_user_id != null &&
    notes !== "auto_default_free_plan" &&
    activation === SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED &&
    (st === SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED || st === SUBSCRIPTION_STATUSES.ACTIVE);

  const needsCompanyActivation =
    activation === SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING &&
    (payment === SUBSCRIPTION_PAYMENT_STATUSES.PAID ||
      payment === SUBSCRIPTION_PAYMENT_STATUSES.PENDING ||
      payment === SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED);

  let activationQueueKind = "company_pending";
  if (isAdminAssigned) {
    activationQueueKind = "admin_assigned";
  } else if (payment === SUBSCRIPTION_PAYMENT_STATUSES.PAID && needsCompanyActivation) {
    activationQueueKind = "paid_company_pending";
  }

  return {
    ...base,
    assignedBy: row.assigned_by_user_id
      ? {
          id: String(row.assigned_by_user_id),
          firstName: row.assigned_by_first_name || null,
          fatherName: row.assigned_by_father_name || null,
          familyName: row.assigned_by_family_name || null,
          email: row.assigned_by_email || null,
        }
      : null,
    activationQueueKind,
    needsCompanyActivation,
  };
}

/**
 * Escape `%`, `_`, and `\` for PostgreSQL ILIKE … ESCAPE '\' patterns.
 * Literal wildcards in the user query must not broaden the match unintentionally.
 */
function escapeIlikePattern(raw) {
  return String(raw).replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Activation dashboard queue: company-pending activations + dashboard admin-assigned follow-up.
 * Optional `search` filters freelancers by name parts, full name, or email within the same queue WHERE.
 */
async function listActivationQueueSubscriptions({ page = 1, limit = 20, search = null } = {}) {
  const { enrichSubscriptionsWithPaymentCountry } = require("./stripeSubscriptionCountryService");

  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (pg - 1) * lim;

  const fromJoin = `FROM freelancer_subscriptions fs
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     LEFT JOIN plans p ON p.id = fs.plan_id
     LEFT JOIN users ab ON ab.id = fs.assigned_by_user_id`;

  const values = [];
  let whereSql = ACTIVATION_QUEUE_WHERE_SQL;

  const searchTerm = search != null ? String(search).trim() : "";
  if (searchTerm) {
    const pattern = `%${escapeIlikePattern(searchTerm)}%`;
    values.push(pattern);
    const p = `$${values.length}`;
    // ILIKE is case-insensitive for Latin; Arabic is matched as stored. ESCAPE keeps %/_ literal.
    whereSql = `${ACTIVATION_QUEUE_WHERE_SQL}
  AND (
    u.first_name ILIKE ${p} ESCAPE '\\'
    OR u.father_name ILIKE ${p} ESCAPE '\\'
    OR u.family_name ILIKE ${p} ESCAPE '\\'
    OR u.email ILIKE ${p} ESCAPE '\\'
    OR CONCAT_WS(' ', u.first_name, u.father_name, u.family_name) ILIKE ${p} ESCAPE '\\'
  )`;
  }

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS total ${fromJoin} WHERE ${whereSql}`,
    values,
  );
  const total = countRes.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / lim));

  const limitParam = values.length + 1;
  const offsetParam = values.length + 2;

  const { rows } = await pool.query(
    `SELECT
       fs.*,
       u.first_name AS freelancer_first_name,
       u.father_name AS freelancer_father_name,
       u.family_name AS freelancer_family_name,
       u.email AS freelancer_email,
       u.account_id AS freelancer_account_id,
       u.phone AS freelancer_phone,
       u.whatsapp AS freelancer_whatsapp,
       p.name AS plan_name,
       p.title AS plan_title,
       p.duration_days AS plan_duration_days,
       p.price_jod AS plan_price_jod,
       ab.first_name AS assigned_by_first_name,
       ab.father_name AS assigned_by_father_name,
       ab.family_name AS assigned_by_family_name,
       ab.email AS assigned_by_email
     ${fromJoin}
     WHERE ${whereSql}
     ORDER BY ${ACTIVATION_QUEUE_ORDER_SQL}
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    [...values, lim, offset],
  );

  const mapped = rows.map(mapActivationQueueSubscription).filter(Boolean);
  const enriched = await enrichSubscriptionsWithPaymentCountry(mapped);

  return {
    subscriptions: enriched,
    pagination: {
      page: pg,
      limit: lim,
      total,
      totalPages,
      hasNextPage: pg < totalPages,
      hasPrevPage: pg > 1,
    },
  };
}

/**
 * Load a single subscription with freelancer + plan detail joined. Read-only.
 * Used by the paid-subscription admin notification. Returns a mapped subscription or null.
 */
async function getSubscriptionWithDetailsById(subscriptionId, client) {
  const runner = client || pool;
  const id = Number(subscriptionId);
  if (!Number.isInteger(id) || id < 1) return null;
  const { rows } = await runner.query(
    `SELECT
       fs.*,
       u.first_name AS freelancer_first_name,
       u.father_name AS freelancer_father_name,
       u.family_name AS freelancer_family_name,
       u.email AS freelancer_email,
       u.account_id AS freelancer_account_id,
       u.phone AS freelancer_phone,
       u.whatsapp AS freelancer_whatsapp,
       u.country AS freelancer_country,
       p.name AS plan_name,
       p.title AS plan_title,
       p.duration_days AS plan_duration_days,
       p.price_jod AS plan_price_jod,
       p.description AS plan_description,
       p.requires_company_visit AS plan_requires_company_visit
     FROM freelancer_subscriptions fs
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     LEFT JOIN plans p ON p.id = fs.plan_id
     WHERE fs.id = $1
     LIMIT 1`,
    [id],
  );
  return mapSubscription(rows[0]);
}

/**
 * Admin list UX: when a paid row exists for same freelancer+plan, older pending rows are historical attempts.
 * Keep the paid row (latest first by SQL order) and hide superseded pending attempts from listing.
 */
function collapseSupersededPendingAttempts(subscriptions) {
  if (!Array.isArray(subscriptions) || subscriptions.length === 0) return subscriptions;
  const paidKeySet = new Set();
  for (const sub of subscriptions) {
    const payment = String(sub?.paymentStatus || "").trim().toLowerCase();
    if (payment === SUBSCRIPTION_PAYMENT_STATUSES.PAID) {
      paidKeySet.add(`${String(sub.freelancerUserId)}:${String(sub.planId)}`);
    }
  }
  if (paidKeySet.size === 0) return subscriptions;

  return subscriptions.filter((sub) => {
    const key = `${String(sub.freelancerUserId)}:${String(sub.planId)}`;
    if (!paidKeySet.has(key)) return true;
    const payment = String(sub?.paymentStatus || "").trim().toLowerCase();
    const activation = String(sub?.activationStatus || "").trim().toLowerCase();
    const isSupersededPendingAttempt =
      payment === SUBSCRIPTION_PAYMENT_STATUSES.PENDING &&
      (activation === SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING || activation === "");
    return !isSupersededPendingAttempt;
  });
}

/**
 * Pool / bids eligibility from a mapped subscription (same rules as canFreelancerTakeOrders).
 *
 * Payment (self-service Stripe): checkout does not create a subscription row until Stripe confirms
 * payment. `fulfillFreelancerSubscriptionStripePayment` inserts a paid row. Only `paid` or
 * admin/comp paths (`not_required`) may take marketplace work.
 */
function evaluateFreelancerTakeOrdersEligibility(sub) {
  if (!sub) {
    return { eligible: false, reason: "no_subscription" };
  }

  const ps = normalizePaymentStatus(sub.paymentStatus);
  const activation = normalizeActivationStatus(sub.activationStatus);

  // Once company_approved, only explicit failed/cancelled payment blocks pool work (handles pending/paid/admin paths + legacy rows).
  if (activation === SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED) {
    if (ps === SUBSCRIPTION_PAYMENT_STATUSES.FAILED || ps === SUBSCRIPTION_PAYMENT_STATUSES.CANCELLED) {
      return { eligible: false, reason: "payment_not_completed" };
    }
  } else if (ps !== SUBSCRIPTION_PAYMENT_STATUSES.PAID && ps !== SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED) {
    return { eligible: false, reason: "payment_not_completed" };
  }

  if (activation && activation !== SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED) {
    return { eligible: false, reason: "company_activation_pending" };
  }
  const st = String(sub.status || "").trim().toLowerCase();
  if (["inactive", "cancelled"].includes(st)) {
    return { eligible: false, reason: `status_${st}` };
  }

  // assigned_not_started should still allow freelancer to take their first order.
  if (st === SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED) {
    return { eligible: true, reason: "assigned_not_started" };
  }

  if (st === SUBSCRIPTION_STATUSES.EXPIRED) {
    return { eligible: false, reason: "expired" };
  }

  if (st !== SUBSCRIPTION_STATUSES.ACTIVE) {
    return { eligible: false, reason: "invalid_status" };
  }

  if (sub.expiryDate && new Date() > new Date(sub.expiryDate)) {
    return { eligible: false, reason: "expired" };
  }

  return { eligible: true, reason: "active" };
}

function applyActivationFeeEligibilityGate(eligibility, feeStatus) {
  if (!eligibility?.eligible) return eligibility;
  if (!feeStatus?.needsPayment) return eligibility;
  return {
    eligible: false,
    reason: "activation_fee_unpaid",
    activationFeeStatus: feeStatus,
  };
}

async function canFreelancerTakeOrders(freelancerUserId) {
  const sub = await getCurrentSubscriptionForFreelancer(freelancerUserId);
  const base = evaluateFreelancerTakeOrdersEligibility(sub);
  const feeStatus = await getActivationFeeStatus(freelancerUserId);
  const gated = applyActivationFeeEligibilityGate(base, feeStatus);
  return {
    ...gated,
    activationFeeStatus: feeStatus,
  };
}

function shouldRetainCurrentSubscription(sub) {
  if (!sub || sub.isCurrent !== true) return false;
  const ps = normalizePaymentStatus(sub.paymentStatus);
  const st = String(sub.status || "").trim().toLowerCase();
  if (ps === SUBSCRIPTION_PAYMENT_STATUSES.FAILED || ps === SUBSCRIPTION_PAYMENT_STATUSES.CANCELLED) {
    return false;
  }
  if (st === SUBSCRIPTION_STATUSES.CANCELLED) return false;
  return true;
}

async function ensureFreePlanInFakeSettingsPlans(client) {
  const runner = client || pool;
  await runner.query(
    `INSERT INTO fake_order_settings_plans (plan_id)
     VALUES ($1::bigint)
     ON CONFLICT (plan_id) DO NOTHING`,
    [ORDERZHOUSE_FREE_PLAN_ID],
  );
}

/**
 * Idempotent: assign free plan when freelancer has no meaningful current subscription.
 * @returns {Promise<{ created: boolean, subscription: object | null }>}
 */
async function ensureFreelancerDefaultFreePlan(freelancerUserId, { actorUserId = null } = {}) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) {
    const err = new Error("Invalid freelancer user id.");
    err.statusCode = 400;
    throw err;
  }

  const current = await getCurrentSubscriptionForFreelancer(uid);
  if (shouldRetainCurrentSubscription(current)) {
    return { created: false, subscription: current };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertUserIsFreelancer(uid, client);
    await getPlanDurationDays(ORDERZHOUSE_FREE_PLAN_ID, client);
    await endCurrentSubscription({ freelancerUserId: uid }, client);

    const { rows } = await client.query(
      `INSERT INTO freelancer_subscriptions (
        freelancer_user_id, plan_id, assigned_by_user_id, notes,
        status, has_first_order, first_order_date, actual_start_date, expiry_date,
        is_current, source, payment_status, activation_status
      ) VALUES ($1,$2,$3,$4,$5,FALSE,NULL,NULL,NULL,TRUE,$6,$7,$8)
      RETURNING *`,
      [
        uid,
        ORDERZHOUSE_FREE_PLAN_ID,
        actorUserId ? Number(actorUserId) : null,
        "auto_default_free_plan",
        SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
        SUBSCRIPTION_SOURCES.ADMIN,
        SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
        SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
      ],
    );

    const subscription = mapSubscription(rows[0]);
    await safeNotify(() =>
      notificationEventsService.notifySubscriptionOwner(
        {
          subscription: rows[0],
          actorUserId: actorUserId ? Number(actorUserId) : null,
          type: "subscription.assigned",
          title: "تم تعيين الاشتراك المجاني",
          message: "تم تعيين الباقة المجانية. بانتظار موافقة الإدارة قبل بدء استلام الطلبات.",
          priority: "high",
          dedupeKey: `subscription_assigned_${String(rows[0].id)}`,
          metadata: { subscriptionId: String(rows[0].id), planId: String(ORDERZHOUSE_FREE_PLAN_ID) },
        },
        client,
      ),
    );
    await client.query("COMMIT");

    try {
      await ensureFreePlanInFakeSettingsPlans();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[subscriptions] ensureFreePlanInFakeSettingsPlans failed (non-fatal):", e?.message || e);
    }

    return { created: true, subscription };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Non-throwing bootstrap for auth/profile paths.
 * Skips heavy ensure when a retainable current subscription already exists.
 */
const bootstrapFastPathCache = new Map();
const BOOTSTRAP_FAST_PATH_TTL_MS = 60_000;

async function maybeEnsureFreelancerDefaultFreePlan(freelancerUserId) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return null;

  const cached = bootstrapFastPathCache.get(uid);
  if (cached && Date.now() - cached.at < BOOTSTRAP_FAST_PATH_TTL_MS) {
    return cached.subscription;
  }

  try {
    const current = await getCurrentSubscriptionForFreelancer(uid);
    if (shouldRetainCurrentSubscription(current)) {
      bootstrapFastPathCache.set(uid, { at: Date.now(), subscription: current });
      return current;
    }

    const snap = await getFreelancerIdentitySnapshot(uid);
    if (!snap?.isFreelancer) return null;
    const out = await ensureFreelancerDefaultFreePlan(uid);
    bootstrapFastPathCache.set(uid, { at: Date.now(), subscription: out.subscription });
    return out.subscription;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[subscriptions] maybeEnsureFreelancerDefaultFreePlan failed:", e?.message || e);
    return null;
  }
}

async function isFreelancerOnFreePlan(freelancerUserId) {
  const sub = await getCurrentSubscriptionForFreelancer(freelancerUserId);
  if (!sub) return false;
  return isOrderzhouseFreePlan(sub.plan || { id: sub.planId, name: sub.plan?.name });
}

/**
 * Legacy Stripe checkout placeholders (unpaid). Shared by cleanup script and ops preview.
 * @param {{ minAgeHours?: number }} [options]
 */
async function findAbandonedStripePendingSubscriptionRows({ minAgeHours = 24 } = {}) {
  const values = [];
  let ageClause = "";
  if (minAgeHours != null && Number(minAgeHours) > 0) {
    values.push(Number(minAgeHours));
    ageClause = `AND fs.created_at < NOW() - ($${values.length}::int * INTERVAL '1 hour')`;
  }

  const { rows } = await pool.query(
    `SELECT
       fs.id,
       fs.freelancer_user_id,
       fs.plan_id,
       fs.is_current,
       fs.status,
       fs.payment_status,
       fs.source,
       fs.paid_at,
       fs.created_at,
       fs.stripe_session_id,
       fs.stripe_payment_intent_id
     FROM freelancer_subscriptions fs
     WHERE fs.payment_status = 'pending'
       AND fs.source = 'stripe'
       AND fs.paid_at IS NULL
       AND fs.first_order_id IS NULL
       AND COALESCE(fs.has_first_order, FALSE) = FALSE
       AND (fs.stripe_payment_intent_id IS NULL OR TRIM(fs.stripe_payment_intent_id) = '')
       ${ageClause}
     ORDER BY fs.id ASC`,
    values,
  );
  return rows;
}

/**
 * Delete abandoned Stripe pending checkout rows, then ensure default free plan for affected freelancers
 * who no longer have a retainable current subscription. Does NOT convert pending rows to free plans.
 *
 * @param {{ dryRun?: boolean, minAgeHours?: number }} [options]
 */
async function cleanupAbandonedStripePendingSubscriptionsWithFreePlanFallback({
  dryRun = true,
  minAgeHours = 24,
} = {}) {
  const rows = await findAbandonedStripePendingSubscriptionRows({ minAgeHours });
  const affectedFreelancerIds = [
    ...new Set(rows.map((r) => Number(r.freelancer_user_id)).filter((n) => Number.isInteger(n) && n > 0)),
  ];

  if (dryRun) {
    const deleteIds = new Set(rows.map((r) => String(r.id)));
    const previewBootstrap = [];
    for (const uid of affectedFreelancerIds) {
      const current = await getCurrentSubscriptionForFreelancer(uid);
      const currentRowWouldBeDeleted = current?.id != null && deleteIds.has(String(current.id));
      const wouldBootstrap =
        !current ||
        currentRowWouldBeDeleted ||
        !shouldRetainCurrentSubscription(current);
      previewBootstrap.push({
        freelancerUserId: uid,
        wouldBootstrap,
        currentSubscriptionId: current?.id ? String(current.id) : null,
        currentPaymentStatus: current?.paymentStatus || null,
        currentSource: current?.source || null,
        currentRowWouldBeDeleted,
      });
    }
    return {
      dryRun: true,
      minAgeHours,
      rowsMatched: rows.length,
      rows,
      affectedFreelancerIds,
      previewBootstrap,
    };
  }

  const client = await pool.connect();
  let deletedCount = 0;
  try {
    await client.query("BEGIN");
    const values = [];
    let ageClause = "";
    if (minAgeHours != null && Number(minAgeHours) > 0) {
      values.push(Number(minAgeHours));
      ageClause = `AND fs.created_at < NOW() - ($${values.length}::int * INTERVAL '1 hour')`;
    }
    const deleteRes = await client.query(
      `DELETE FROM freelancer_subscriptions fs
       WHERE fs.payment_status = 'pending'
         AND fs.source = 'stripe'
         AND fs.paid_at IS NULL
         AND fs.first_order_id IS NULL
         AND COALESCE(fs.has_first_order, FALSE) = FALSE
         AND (fs.stripe_payment_intent_id IS NULL OR TRIM(fs.stripe_payment_intent_id) = '')
         ${ageClause}
       RETURNING fs.id, fs.freelancer_user_id`,
      values,
    );
    deletedCount = deleteRes.rowCount || 0;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const bootstrapResults = [];
  for (const uid of affectedFreelancerIds) {
    const current = await getCurrentSubscriptionForFreelancer(uid);
    if (shouldRetainCurrentSubscription(current)) {
      bootstrapResults.push({
        freelancerUserId: uid,
        action: "skipped",
        reason: "valid_current_subscription",
        subscriptionId: current?.id ? String(current.id) : null,
        paymentStatus: current?.paymentStatus || null,
        source: current?.source || null,
      });
      continue;
    }

    const snap = await getFreelancerIdentitySnapshot(uid);
    if (!snap?.isFreelancer) {
      bootstrapResults.push({
        freelancerUserId: uid,
        action: "skipped",
        reason: "not_freelancer",
      });
      continue;
    }

    const out = await ensureFreelancerDefaultFreePlan(uid);
    bootstrapResults.push({
      freelancerUserId: uid,
      action: out.created ? "created_default_free" : "unchanged",
      subscriptionId: out.subscription?.id ? String(out.subscription.id) : null,
      planId: out.subscription?.planId ? String(out.subscription.planId) : null,
      paymentStatus: out.subscription?.paymentStatus || null,
      source: out.subscription?.source || null,
    });
  }

  return {
    dryRun: false,
    minAgeHours,
    deletedCount,
    affectedFreelancerIds,
    bootstrapResults,
  };
}

/** @deprecated Real pool access is gated by plan value range in planOrderValueEligibility only. */
async function assertFreelancerMayAccessRealPoolOrders(_freelancerUserId) {}

module.exports = {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_SOURCES,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  ADMIN_ASSIGNMENT_OFFLINE_PAYMENT_NOTE,
  ADMIN_ASSIGNMENT_ACTIVATION_FEE_NOTE,
  escapeIlikePattern,
  mapSubscription,
  getFreelancerIdentitySnapshot,
  assignPlanToFreelancer,
  applyAdminAssignmentOfflinePayments,
  applyOfflinePaymentsToExistingAdminAssignment,
  loadPlanPricingForAssignment,
  updateSubscription,
  listSubscriptions,
  listActivationQueueSubscriptions,
  getSubscriptionWithDetailsById,
  getCurrentSubscriptionForFreelancer,
  activateCurrentSubscriptionOnFirstOrder,
  activateCurrentSubscriptionOnFirstAcceptedOrder,
  fulfillFreelancerSubscriptionStripePayment,
  markFreelancerSubscriptionStripePaymentPaid,
  markFreelancerSubscriptionStripePaymentFailed,
  activateCompanyApprovalForSubscription,
  canFreelancerTakeOrders,
  applyActivationFeeEligibilityGate,
  evaluateFreelancerTakeOrdersEligibility,
  shouldRetainCurrentSubscription,
  ORDERZHOUSE_FREE_PLAN_ID,
  ensureFreelancerDefaultFreePlan,
  maybeEnsureFreelancerDefaultFreePlan,
  findAbandonedStripePendingSubscriptionRows,
  cleanupAbandonedStripePendingSubscriptionsWithFreePlanFallback,
  isFreelancerOnFreePlan,
  assertFreelancerMayAccessRealPoolOrders,
  ensureFreePlanInFakeSettingsPlans,
};

