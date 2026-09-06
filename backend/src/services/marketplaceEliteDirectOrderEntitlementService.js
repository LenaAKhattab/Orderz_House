/**
 * Phase 8 — Elite Direct Order entitlement (AVAILABLE / RESERVED / CONSUMED).
 * Distinct from Priority Bid cycle uses and Work Token wallet.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { isBenefitUsableStatus } = require("../constants/marketplaceMemberships");
const {
  ELITE_DIRECT_ORDER_ERROR_CODES,
} = require("../constants/marketplaceEliteDirectOrders");

function resolveDbClient(externalClient) {
  if (externalClient) return { client: externalClient, release: false, ownTxn: false };
  return null; // caller must supply client for atomic offer txn; standalone helpers get own
}

async function withOwnOrExternal(externalClient, fn) {
  if (externalClient) return fn(externalClient);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
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

async function eliteEntitlementSchemaReady(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.elite_direct_order_entitlement_events') AS e`,
  );
  return Boolean(rows[0]?.e);
}

function availableFromCycle(row) {
  const allowed = Number(row.elite_direct_orders_allowed) || 0;
  const reserved = Number(row.elite_direct_orders_reserved) || 0;
  const consumed = Number(row.elite_direct_orders_consumed) || 0;
  return Math.max(allowed - reserved - consumed, 0);
}

/** Read-only (no FOR UPDATE). Prefer peekEliteEntitlementAllowance alias. */
async function getEliteEntitlementAllowanceForFreelancer(freelancerUserId, { client: db = pool } = {}) {
  return peekEliteEntitlementAllowance(freelancerUserId, { client: db });
}

/** Read-only snapshot without FOR UPDATE (safe outside txn). */
async function peekEliteEntitlementAllowance(freelancerUserId, { client: db = pool } = {}) {
  if (!(await eliteEntitlementSchemaReady(db))) {
    return {
      hasActiveCycle: false,
      allowed: 0,
      reserved: 0,
      consumed: 0,
      available: 0,
      cycleId: null,
      membershipId: null,
      schemaReady: false,
    };
  }
  const { rows } = await db.query(
    `SELECT c.*, m.status AS membership_status, m.id AS membership_id
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_cycles c
       ON c.membership_id = m.id AND c.status = 'active'
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1`,
    [Number(freelancerUserId)],
  );
  if (!rows[0] || !isBenefitUsableStatus(rows[0].membership_status)) {
    return {
      hasActiveCycle: false,
      allowed: 0,
      reserved: 0,
      consumed: 0,
      available: 0,
      cycleId: null,
      membershipId: null,
      schemaReady: true,
    };
  }
  const allowed = Number(rows[0].elite_direct_orders_allowed) || 0;
  const reserved = Number(rows[0].elite_direct_orders_reserved) || 0;
  const consumed = Number(rows[0].elite_direct_orders_consumed) || 0;
  return {
    hasActiveCycle: true,
    allowed,
    reserved,
    consumed,
    available: Math.max(allowed - reserved - consumed, 0),
    cycleId: String(rows[0].id),
    membershipId: String(rows[0].membership_id),
    schemaReady: true,
  };
}

async function lockActiveCycleForFreelancer(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT c.*, m.status AS membership_status, m.id AS membership_pk,
            m.freelancer_user_id
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_cycles c
       ON c.membership_id = m.id AND c.status = 'active'
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1
     FOR UPDATE OF c, m`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function reserveEliteDirectOrderEntitlement({
  client,
  freelancerUserId,
  referenceType,
  referenceId,
  actorUserId = null,
  reason = "elite_offer_reserve",
  quantity = 1,
} = {}) {
  if (!(await eliteEntitlementSchemaReady(client))) {
    throw createAppError("Elite Direct Order schema missing.", 503, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_SCHEMA_MISSING,
    });
  }
  const cycle = await lockActiveCycleForFreelancer(client, freelancerUserId);
  if (!cycle || !isBenefitUsableStatus(cycle.membership_status)) {
    throw createAppError("Elite Direct Order entitlement unavailable.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_DIRECT_ORDER_ENTITLEMENT_UNAVAILABLE,
    });
  }
  const available = availableFromCycle(cycle);
  if (available < quantity) {
    throw createAppError("Elite Direct Order entitlement unavailable.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_DIRECT_ORDER_ENTITLEMENT_UNAVAILABLE,
    });
  }

  const idempotencyKey = `elite_reserve:${referenceType}:${referenceId}`;
  try {
    const { rows } = await client.query(
      `INSERT INTO elite_direct_order_entitlement_events (
         cycle_id, membership_id, freelancer_user_id,
         event_type, delta_reserved, delta_consumed,
         reference_type, reference_id, idempotency_key,
         actor_user_id, reason
       ) VALUES ($1,$2,$3,'reserve',$4,0,$5,$6,$7,$8,$9)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        cycle.id,
        cycle.membership_pk || cycle.membership_id,
        Number(freelancerUserId),
        quantity,
        String(referenceType),
        String(referenceId),
        idempotencyKey,
        actorUserId != null ? Number(actorUserId) : null,
        reason,
      ],
    );
    if (!rows[0]) {
      const existing = await client.query(
        `SELECT * FROM elite_direct_order_entitlement_events WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      return { event: existing.rows[0], idempotent: true, cycleId: cycle.id };
    }
    await client.query(
      `UPDATE marketplace_membership_cycles
          SET elite_direct_orders_reserved = elite_direct_orders_reserved + $2
        WHERE id = $1`,
      [cycle.id, quantity],
    );
    return { event: rows[0], idempotent: false, cycleId: cycle.id };
  } catch (err) {
    if (err && err.code === "23505") {
      const existing = await client.query(
        `SELECT * FROM elite_direct_order_entitlement_events WHERE idempotency_key = $1`,
        [idempotencyKey],
      );
      return { event: existing.rows[0], idempotent: true, cycleId: cycle.id };
    }
    throw err;
  }
}

async function consumeEliteDirectOrderEntitlement({
  client,
  freelancerUserId,
  referenceType,
  referenceId,
  reserveEventId,
  actorUserId = null,
  reason = "elite_offer_accept_consume",
  quantity = 1,
} = {}) {
  const cycle = await lockActiveCycleForFreelancer(client, freelancerUserId);
  if (!cycle) {
    throw createAppError("Elite Direct Order entitlement unavailable.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_DIRECT_ORDER_ENTITLEMENT_UNAVAILABLE,
    });
  }
  const idempotencyKey = `elite_consume:${referenceType}:${referenceId}`;
  const { rows } = await client.query(
    `INSERT INTO elite_direct_order_entitlement_events (
       cycle_id, membership_id, freelancer_user_id,
       event_type, delta_reserved, delta_consumed,
       reference_type, reference_id, idempotency_key,
       related_event_id, actor_user_id, reason
     ) VALUES ($1,$2,$3,'consume',$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      cycle.id,
      cycle.membership_pk || cycle.membership_id,
      Number(freelancerUserId),
      -quantity,
      quantity,
      String(referenceType),
      String(referenceId),
      idempotencyKey,
      reserveEventId != null ? Number(reserveEventId) : null,
      actorUserId != null ? Number(actorUserId) : null,
      reason,
    ],
  );
  if (!rows[0]) {
    const existing = await client.query(
      `SELECT * FROM elite_direct_order_entitlement_events WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return { event: existing.rows[0], idempotent: true };
  }
  await client.query(
    `UPDATE marketplace_membership_cycles
        SET elite_direct_orders_reserved = GREATEST(elite_direct_orders_reserved - $2, 0),
            elite_direct_orders_consumed = elite_direct_orders_consumed + $2
      WHERE id = $1`,
    [cycle.id, quantity],
  );
  return { event: rows[0], idempotent: false };
}

async function releaseEliteDirectOrderEntitlement({
  client,
  freelancerUserId,
  referenceType,
  referenceId,
  reserveEventId,
  actorUserId = null,
  reason = "elite_offer_release",
  quantity = 1,
} = {}) {
  const cycle = await lockActiveCycleForFreelancer(client, freelancerUserId);
  if (!cycle) {
    return { skipped: true, reason: "NO_ACTIVE_CYCLE" };
  }
  const idempotencyKey = `elite_release:${referenceType}:${referenceId}`;
  const { rows } = await client.query(
    `INSERT INTO elite_direct_order_entitlement_events (
       cycle_id, membership_id, freelancer_user_id,
       event_type, delta_reserved, delta_consumed,
       reference_type, reference_id, idempotency_key,
       related_event_id, actor_user_id, reason
     ) VALUES ($1,$2,$3,'release',$4,0,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [
      cycle.id,
      cycle.membership_pk || cycle.membership_id,
      Number(freelancerUserId),
      -quantity,
      String(referenceType),
      String(referenceId),
      idempotencyKey,
      reserveEventId != null ? Number(reserveEventId) : null,
      actorUserId != null ? Number(actorUserId) : null,
      reason,
    ],
  );
  if (!rows[0]) {
    return { idempotent: true };
  }
  await client.query(
    `UPDATE marketplace_membership_cycles
        SET elite_direct_orders_reserved = GREATEST(elite_direct_orders_reserved - $2, 0)
      WHERE id = $1`,
    [cycle.id, quantity],
  );
  return { event: rows[0], idempotent: false };
}

/**
 * Compute Elite allowed for a new cycle (base from settings if plan capable + carry-forward).
 */
async function computeEliteAllowanceForNewCycle({
  client,
  membershipId,
  planEliteEnabled,
  settings,
  previousCycleRow = null,
} = {}) {
  if (!planEliteEnabled) return 0;
  const base = Number(settings.eliteDirectOrdersPerCycle) || 0;
  let carry = 0;
  if (settings.eliteCarryForwardEnabled && previousCycleRow) {
    const prevAllowed = Number(previousCycleRow.elite_direct_orders_allowed) || 0;
    const prevConsumed = Number(previousCycleRow.elite_direct_orders_consumed) || 0;
    // Declines/releases do not consume — unused = allowed - consumed
    const unused = Math.max(prevAllowed - prevConsumed, 0);
    const maxCarry = Number(settings.eliteMaximumCarryForward) || 0;
    const days = Number(settings.eliteCarryForwardDays) || 0;
    let withinWindow = true;
    if (days > 0 && previousCycleRow.ends_at) {
      const { rows } = await client.query(
        `SELECT ($1::timestamptz + make_interval(days => $2::int)) >= NOW() AS ok`,
        [previousCycleRow.ends_at, days],
      );
      withinWindow = Boolean(rows[0]?.ok);
    }
    // eliteDeclinesAffectCarryForward=false: declined offers already released → unused not reduced
    if (withinWindow) {
      carry = Math.min(unused, maxCarry);
    }
  }
  return base + carry;
}

module.exports = {
  peekEliteEntitlementAllowance,
  getEliteEntitlementAllowanceForFreelancer,
  reserveEliteDirectOrderEntitlement,
  consumeEliteDirectOrderEntitlement,
  releaseEliteDirectOrderEntitlement,
  computeEliteAllowanceForNewCycle,
  eliteEntitlementSchemaReady,
  availableFromCycle,
  withOwnOrExternal,
  resolveDbClient,
};
