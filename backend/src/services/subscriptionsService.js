const { pool } = require("../config/db");

const SUBSCRIPTION_STATUSES = Object.freeze({
  ASSIGNED_NOT_STARTED: "assigned_not_started",
  ACTIVE: "active",
  EXPIRED: "expired",
  INACTIVE: "inactive",
  CANCELLED: "cancelled",
});

function parseDateOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = new Date(value);
  // eslint-disable-next-line no-restricted-globals
  if (isNaN(d.getTime())) return null;
  return d;
}

function computeExpiry({ startDate, durationDays }) {
  const start = new Date(startDate);
  const ms = durationDays * 24 * 60 * 60 * 1000;
  return new Date(start.getTime() + ms);
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    planId: String(row.plan_id),
    plan: row.plan_id ? {
      id: String(row.plan_id),
      name: row.plan_name || null,
      title: row.plan_title || null,
      durationDays: row.plan_duration_days ?? null,
      priceCents: row.plan_price_cents ?? null,
    } : null,
    assignedByUserId: row.assigned_by_user_id ? String(row.assigned_by_user_id) : null,
    assignedAt: row.assigned_at,
    hasFirstOrder: row.has_first_order,
    firstOrderDate: row.first_order_date,
    actualStartDate: row.actual_start_date,
    expiryDate: row.expiry_date,
    status: row.status,
    isCurrent: row.is_current,
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
  const { rows } = await runner.query(
    `SELECT role FROM users WHERE id = $1 LIMIT 1`,
    [Number(userId)],
  );
  const u = rows[0];
  if (!u) {
    const err = new Error("User not found.");
    err.statusCode = 404;
    throw err;
  }
  // Backward compatible check (legacy role). In full RBAC, we'd join user_roles.
  if (u.role !== "freelancer") {
    const err = new Error("Target user must be a freelancer.");
    err.statusCode = 400;
    throw err;
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
        is_current
      ) VALUES ($1,$2,$3,$4,$5,FALSE,NULL,NULL,NULL,TRUE)
      RETURNING *`,
      [
        Number(freelancerUserId),
        Number(planId),
        actorUserId ? Number(actorUserId) : null,
        notes,
        SUBSCRIPTION_STATUSES.ASSIGNED_NOT_STARTED,
      ],
    );

    await client.query("COMMIT");
    return { subscription: mapSubscription(rows[0]), durationDays };
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
       p.price_cents AS plan_price_cents
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
       p.price_cents AS plan_price_cents
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
    `SELECT * FROM freelancer_subscriptions
     WHERE ${where.join(" AND ")}
     ORDER BY id DESC
     LIMIT 200`,
    values,
  );
  return rows.map(mapSubscription);
}

async function canFreelancerTakeOrders(freelancerUserId) {
  const sub = await getCurrentSubscriptionForFreelancer(freelancerUserId);
  if (!sub) {
    return { eligible: false, reason: "no_subscription" };
  }

  if (["inactive", "cancelled"].includes(sub.status)) {
    return { eligible: false, reason: `status_${sub.status}` };
  }

  // assigned_not_started should still allow freelancer to take their first order.
  if (sub.status === "assigned_not_started") {
    return { eligible: true, reason: "assigned_not_started" };
  }

  if (sub.status === "expired") {
    return { eligible: false, reason: "expired" };
  }

  if (sub.status !== "active") {
    return { eligible: false, reason: "invalid_status" };
  }

  if (sub.expiryDate && new Date() > new Date(sub.expiryDate)) {
    return { eligible: false, reason: "expired" };
  }

  return { eligible: true, reason: "active" };
}

module.exports = {
  SUBSCRIPTION_STATUSES,
  assignPlanToFreelancer,
  updateSubscription,
  listSubscriptions,
  getCurrentSubscriptionForFreelancer,
  activateCurrentSubscriptionOnFirstOrder,
  canFreelancerTakeOrders,
};

