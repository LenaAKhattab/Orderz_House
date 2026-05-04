const { pool } = require("../config/db");
const notificationEventsService = require("./notificationEventsService");
const notificationService = require("./notificationService");

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
        }
      : null,
    planId: String(row.plan_id),
    plan: row.plan_id ? {
      id: String(row.plan_id),
      name: row.plan_name || null,
      title: row.plan_title || null,
      durationDays: row.plan_duration_days ?? null,
      priceJod: row.plan_price_jod != null ? Number(row.plan_price_jod) : null,
    } : null,
    assignedByUserId: row.assigned_by_user_id ? String(row.assigned_by_user_id) : null,
    assignedAt: row.assigned_at,
    hasFirstOrder: row.has_first_order,
    firstOrderDate: row.first_order_date,
    actualStartDate: row.actual_start_date,
    expiryDate: row.expiry_date,
    status: row.status,
    isCurrent: row.is_current,
    source: row.source || SUBSCRIPTION_SOURCES.ADMIN,
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

async function assertUserIsFreelancer(userId, client) {
  const runner = client || pool;
  const uid = Number(userId);
  const failNotFreelancer = () => {
    const err = new Error("Target user must be a freelancer.");
    err.statusCode = 400;
    err.exposeToClient = true;
    throw err;
  };
  const legacyOnly = async () => {
    const { rows } = await runner.query(`SELECT role FROM users WHERE id = $1 LIMIT 1`, [uid]);
    const u = rows[0];
    if (!u) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    if (u.role !== "freelancer") failNotFreelancer();
  };
  try {
    const { rows } = await runner.query(
      `SELECT u.role AS legacy_role,
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
    if (!row) {
      const err = new Error("User not found.");
      err.statusCode = 404;
      throw err;
    }
    const legacy = String(row.legacy_role || "").trim() === "freelancer";
    if (legacy || row.has_freelancer_rbac) return;
    failNotFreelancer();
  } catch (e) {
    if (isMissingTableError(e)) {
      await legacyOnly();
      return;
    }
    throw e;
  }
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

async function assignPlanToFreelancer({ actorUserId, freelancerUserId, planId, notes = null }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await assertUserIsFreelancer(freelancerUserId, client);
    const durationDays = await getPlanDurationDays(planId, client);

    // End any current subscription (history preserved)
    await endCurrentSubscription({ freelancerUserId }, client);

    const { rows } = await client.query(
      `INSERT INTO freelancer_subscriptions (
        freelancer_user_id, plan_id, assigned_by_user_id, notes,
        status, has_first_order, first_order_date, actual_start_date, expiry_date,
        is_current, source, payment_status, activation_status
      ) VALUES ($1,$2,$3,$4,$5,FALSE,NULL,NULL,NULL,TRUE,$6,$7,$8)
      RETURNING *`,
      [
        Number(freelancerUserId),
        Number(planId),
        actorUserId ? Number(actorUserId) : null,
        notes,
        SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
        SUBSCRIPTION_SOURCES.ADMIN,
        SUBSCRIPTION_PAYMENT_STATUSES.NOT_REQUIRED,
        SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_APPROVED,
      ],
    );

    const subscription = mapSubscription(rows[0]);
    await safeNotify(() =>
      notificationEventsService.notifySubscriptionOwner(
        {
          subscription: rows[0],
          actorUserId: actorUserId ? Number(actorUserId) : null,
          type: "subscription.assigned",
          title: "تم تعيين اشتراك لك",
          message: "تم تعيين باقة اشتراك لك من الإدارة.",
          priority: "high",
          dedupeKey: `subscription_assigned_${String(rows[0].id)}`,
          metadata: { subscriptionId: String(rows[0].id), planId: String(planId) },
        },
        client,
      ),
    );
    await client.query("COMMIT");
    return { subscription, durationDays };
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

async function createFreelancerSelfSubscriptionPendingPayment({ freelancerUserId, planId, stripeSessionId = null }, client) {
  const runner = client || pool;
  await assertUserIsFreelancer(freelancerUserId, runner);
  await getPlanDurationDays(planId, runner);
  await endCurrentSubscription({ freelancerUserId }, runner);

  const { rows } = await runner.query(
    `INSERT INTO freelancer_subscriptions (
      freelancer_user_id, plan_id, assigned_by_user_id, notes,
      status, has_first_order, first_order_date, actual_start_date, expiry_date, is_current,
      source, payment_status, activation_status, stripe_session_id
    ) VALUES ($1,$2,NULL,NULL,$3,FALSE,NULL,NULL,NULL,TRUE,$4,$5,$6,$7)
    RETURNING *`,
    [
      Number(freelancerUserId),
      Number(planId),
      SUBSCRIPTION_STATUSES.INACTIVE,
      SUBSCRIPTION_SOURCES.STRIPE,
      SUBSCRIPTION_PAYMENT_STATUSES.PENDING,
      SUBSCRIPTION_ACTIVATION_STATUSES.COMPANY_PENDING,
      stripeSessionId,
    ],
  );
  return mapSubscription(rows[0]);
}

async function markFreelancerSubscriptionStripePaymentPaid(
  { freelancerUserId, planId, stripeSessionId, stripePaymentIntentId = null, paidAt = new Date() },
  client,
) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
       AND plan_id = $2
       AND is_current = TRUE
       AND source = 'stripe'
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [Number(freelancerUserId), Number(planId)],
  );
  const sub = rows[0];
  if (!sub) return null;
  if (sub.payment_status === SUBSCRIPTION_PAYMENT_STATUSES.PAID) return mapSubscription(sub);

  const { rows: updated } = await runner.query(
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
    [Number(sub.id), stripeSessionId || null, stripePaymentIntentId || null, paidAt],
  );
  return mapSubscription(updated[0]);
}

async function markFreelancerSubscriptionStripePaymentFailed(
  { freelancerUserId, planId, stripeSessionId = null, stripePaymentIntentId = null },
  client,
) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT * FROM freelancer_subscriptions
     WHERE freelancer_user_id = $1
       AND plan_id = $2
       AND is_current = TRUE
       AND source = 'stripe'
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [Number(freelancerUserId), Number(planId)],
  );
  const sub = rows[0];
  if (!sub) return null;
  const { rows: updated } = await runner.query(
    `UPDATE freelancer_subscriptions
     SET payment_status = 'failed',
         status = 'inactive',
         stripe_session_id = COALESCE($2, stripe_session_id),
         stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [Number(sub.id), stripeSessionId || null, stripePaymentIntentId || null],
  );
  const mapped = mapSubscription(updated[0]);
  await safeNotify(() =>
    notificationEventsService.notifySubscriptionOwner(
      {
        subscription: updated[0],
        actorUserId: null,
        type: "subscription.payment.failed",
        title: "فشل دفع الاشتراك",
        message: "تعذر إتمام دفع الاشتراك. يرجى المحاولة مرة أخرى.",
        priority: "high",
        dedupeKey: `subscription_failed_${String(updated[0].id)}`,
        metadata: { subscriptionId: String(updated[0].id) },
      },
      runner,
    ),
  );
  return mapped;
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

async function listSubscriptions({ freelancerUserId = null, status = null } = {}) {
  const values = [];
  const where = ["1=1"];
  let i = 1;

  if (freelancerUserId) {
    where.push(`freelancer_user_id = $${i}`);
    values.push(Number(freelancerUserId));
    i += 1;
  }
  if (status) {
    where.push(`status = $${i}`);
    values.push(String(status));
    i += 1;
  }

  const { rows } = await pool.query(
    `SELECT
       fs.*,
       u.first_name AS freelancer_first_name,
       u.father_name AS freelancer_father_name,
       u.family_name AS freelancer_family_name,
       u.email AS freelancer_email,
       u.account_id AS freelancer_account_id
     FROM freelancer_subscriptions fs
     LEFT JOIN users u ON u.id = fs.freelancer_user_id
     WHERE ${where.join(" AND ")}
     ORDER BY fs.id DESC
     LIMIT 200`,
    values,
  );
  return rows.map(mapSubscription);
}

/**
 * Pool / bids eligibility from a mapped subscription (same rules as canFreelancerTakeOrders).
 *
 * Payment (self-service Stripe): `createFreelancerSubscriptionCheckoutSession` sets `payment_status`
 * to `pending`; webhook `markFreelancerSubscriptionStripePaymentPaid` sets `paid`. Only `paid` or
 * admin/comp paths (`not_required`) may take marketplace work — not `pending` (checkout started
 * but unpaid). No grace window: starting checkout does not unlock the pool.
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

async function canFreelancerTakeOrders(freelancerUserId) {
  const sub = await getCurrentSubscriptionForFreelancer(freelancerUserId);
  return evaluateFreelancerTakeOrdersEligibility(sub);
}

module.exports = {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_SOURCES,
  SUBSCRIPTION_PAYMENT_STATUSES,
  SUBSCRIPTION_ACTIVATION_STATUSES,
  assignPlanToFreelancer,
  updateSubscription,
  listSubscriptions,
  getCurrentSubscriptionForFreelancer,
  activateCurrentSubscriptionOnFirstOrder,
  activateCurrentSubscriptionOnFirstAcceptedOrder,
  createFreelancerSelfSubscriptionPendingPayment,
  markFreelancerSubscriptionStripePaymentPaid,
  markFreelancerSubscriptionStripePaymentFailed,
  activateCompanyApprovalForSubscription,
  canFreelancerTakeOrders,
  evaluateFreelancerTakeOrdersEligibility,
};

