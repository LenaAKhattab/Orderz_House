/**
 * Priority Bid usage accounting — Phase 3 / 3.1 internal domain only.
 *
 * Idempotency (Phase 3.1): UNIQUE(cycle_id, reference_type, reference_id, event_type)
 * Return requires original CONSUME and sets related_usage_id.
 * Accepts existing DB client for future auction atomicity.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  MEMBERSHIP_AUDIT_ACTIONS,
  isBenefitUsableStatus,
} = require("../constants/marketplaceMemberships");

function mapUsage(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    cycleId: String(row.cycle_id),
    membershipId: String(row.membership_id),
    freelancerUserId: String(row.freelancer_user_id),
    eventType: row.event_type,
    delta: Number(row.delta),
    referenceType: row.reference_type,
    referenceId: String(row.reference_id),
    relatedUsageId: row.related_usage_id != null ? String(row.related_usage_id) : null,
    reason: row.reason || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    createdAt: row.created_at || null,
  };
}

function remainingFromCycle(row) {
  const allowed = Number(row.priority_bid_uses_allowed) || 0;
  const consumed = Number(row.priority_bid_uses_consumed) || 0;
  return Math.max(allowed - consumed, 0);
}

async function writeAudit(client, payload) {
  await client.query(
    `INSERT INTO marketplace_membership_audit_logs
      (membership_id, cycle_id, freelancer_user_id, actor_user_id, action, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      payload.membershipId || null,
      payload.cycleId || null,
      payload.freelancerUserId || null,
      payload.actorUserId || null,
      payload.action,
      payload.detail ? JSON.stringify(payload.detail) : null,
    ],
  );
}

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

async function getPriorityBidAllowanceForFreelancer(freelancerUserId, options = {}) {
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT c.*, m.status AS membership_status
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_cycles c
       ON c.membership_id = m.id AND c.status = 'active'
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1`,
    [freelancerUserId],
  );
  if (!rows[0] || !isBenefitUsableStatus(rows[0].membership_status)) {
    return {
      hasActiveCycle: false,
      allowed: 0,
      used: 0,
      remaining: 0,
      cycleId: null,
      membershipId: null,
    };
  }
  const allowed = Number(rows[0].priority_bid_uses_allowed) || 0;
  const used = Number(rows[0].priority_bid_uses_consumed) || 0;
  return {
    hasActiveCycle: true,
    allowed,
    used,
    remaining: Math.max(allowed - used, 0),
    cycleId: String(rows[0].id),
    membershipId: String(rows[0].membership_id),
  };
}

async function canConsumePriorityBidUse(freelancerUserId, options = {}) {
  const snap = await getPriorityBidAllowanceForFreelancer(freelancerUserId, options);
  return snap.hasActiveCycle && snap.remaining > 0;
}

async function consumePriorityBidUse(input) {
  const freelancerUserId = Number(input.freelancerUserId);
  const referenceType = String(input.referenceType || "").trim();
  const referenceId = String(input.referenceId || "").trim();
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  if (!referenceType || !referenceId) {
    throw createAppError("referenceType and referenceId are required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_USAGE_REFERENCE",
    });
  }

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const { rows: cycleRows } = await client.query(
      `SELECT c.*, m.status AS membership_status, m.is_current
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_cycles c
         ON c.membership_id = m.id AND c.status = 'active'
       WHERE m.freelancer_user_id = $1
         AND m.is_current = TRUE
       FOR UPDATE OF c, m`,
      [freelancerUserId],
    );
    const cycle = cycleRows[0];
    if (!cycle || !cycle.is_current || !isBenefitUsableStatus(cycle.membership_status)) {
      throw createAppError("No usable Marketplace Membership cycle for Priority Bid.", 409, {
        exposeToClient: true,
        publicCode: "NO_ACTIVE_MEMBERSHIP_CYCLE",
      });
    }

    // Idempotent within this cycle
    const existing = await client.query(
      `SELECT * FROM marketplace_membership_cycle_usage
       WHERE cycle_id = $1
         AND reference_type = $2
         AND reference_id = $3
         AND event_type = 'consumed'
       LIMIT 1`,
      [cycle.id, referenceType, referenceId],
    );
    if (existing.rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        usage: mapUsage(existing.rows[0]),
        allowed: Number(cycle.priority_bid_uses_allowed) || 0,
        used: Number(cycle.priority_bid_uses_consumed) || 0,
        remaining: remainingFromCycle(cycle),
      };
    }

    if (remainingFromCycle(cycle) <= 0) {
      throw createAppError("No Priority Bid uses remaining in this cycle.", 409, {
        exposeToClient: true,
        publicCode: "PRIORITY_BID_USES_EXHAUSTED",
      });
    }

    let usageRow;
    try {
      const inserted = await client.query(
        `INSERT INTO marketplace_membership_cycle_usage (
           cycle_id, membership_id, freelancer_user_id,
           event_type, delta, reference_type, reference_id, reason, actor_user_id
         ) VALUES ($1, $2, $3, 'consumed', 1, $4, $5, $6, $7)
         RETURNING *`,
        [
          cycle.id,
          cycle.membership_id,
          freelancerUserId,
          referenceType,
          referenceId,
          input.reason || null,
          input.actorUserId || null,
        ],
      );
      usageRow = inserted.rows[0];
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await client.query(
          `SELECT * FROM marketplace_membership_cycle_usage
           WHERE cycle_id = $1
             AND reference_type = $2
             AND reference_id = $3
             AND event_type = 'consumed'
           LIMIT 1`,
          [cycle.id, referenceType, referenceId],
        );
        if (ownTxn) await client.query("COMMIT");
        return {
          ok: true,
          idempotent: true,
          usage: mapUsage(again.rows[0]),
          allowed: Number(cycle.priority_bid_uses_allowed) || 0,
          used: Number(cycle.priority_bid_uses_consumed) || 0,
          remaining: remainingFromCycle(cycle),
        };
      }
      throw err;
    }

    const updated = await client.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_consumed = priority_bid_uses_consumed + 1
       WHERE id = $1
         AND priority_bid_uses_consumed < priority_bid_uses_allowed
       RETURNING *`,
      [cycle.id],
    );
    if (!updated.rows[0]) {
      throw createAppError("No Priority Bid uses remaining in this cycle.", 409, {
        exposeToClient: true,
        publicCode: "PRIORITY_BID_USES_EXHAUSTED",
      });
    }

    await writeAudit(client, {
      membershipId: cycle.membership_id,
      cycleId: cycle.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.PRIORITY_USE_CONSUMED,
      detail: { referenceType, referenceId, usageId: String(usageRow.id) },
    });

    if (ownTxn) await client.query("COMMIT");
    const row = updated.rows[0];
    return {
      ok: true,
      idempotent: false,
      usage: mapUsage(usageRow),
      allowed: Number(row.priority_bid_uses_allowed) || 0,
      used: Number(row.priority_bid_uses_consumed) || 0,
      remaining: remainingFromCycle(row),
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Return a previously consumed Priority Bid use (INTERNAL, idempotent).
 * Requires original CONSUME; links via related_usage_id.
 */
async function returnPriorityBidUse(input) {
  const referenceType = String(input.referenceType || "").trim();
  const referenceId = String(input.referenceId || "").trim();
  if (!referenceType || !referenceId) {
    throw createAppError("referenceType and referenceId are required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_USAGE_REFERENCE",
    });
  }

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    // Prefer explicit cycleId when provided (safer across cycles)
    const cycleIdFilter = input.cycleId != null ? Number(input.cycleId) : null;

    let consumed;
    if (cycleIdFilter) {
      consumed = await client.query(
        `SELECT * FROM marketplace_membership_cycle_usage
         WHERE cycle_id = $1
           AND reference_type = $2
           AND reference_id = $3
           AND event_type = 'consumed'
         LIMIT 1
         FOR UPDATE`,
        [cycleIdFilter, referenceType, referenceId],
      );
    } else {
      consumed = await client.query(
        `SELECT * FROM marketplace_membership_cycle_usage
         WHERE reference_type = $1
           AND reference_id = $2
           AND event_type = 'consumed'
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [referenceType, referenceId],
      );
    }

    if (!consumed.rows[0]) {
      throw createAppError("Original Priority Bid consumption not found.", 404, {
        exposeToClient: true,
        publicCode: "PRIORITY_USE_NOT_FOUND",
      });
    }
    const consumedRow = consumed.rows[0];

    const returnedExisting = await client.query(
      `SELECT * FROM marketplace_membership_cycle_usage
       WHERE cycle_id = $1
         AND reference_type = $2
         AND reference_id = $3
         AND event_type = 'returned'
       LIMIT 1`,
      [consumedRow.cycle_id, referenceType, referenceId],
    );
    if (returnedExisting.rows[0]) {
      const cycle = await client.query(
        `SELECT * FROM marketplace_membership_cycles WHERE id = $1`,
        [consumedRow.cycle_id],
      );
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        usage: mapUsage(returnedExisting.rows[0]),
        allowed: Number(cycle.rows[0]?.priority_bid_uses_allowed) || 0,
        used: Number(cycle.rows[0]?.priority_bid_uses_consumed) || 0,
        remaining: cycle.rows[0] ? remainingFromCycle(cycle.rows[0]) : 0,
      };
    }

    // Also check related_usage_id unique (one return per consume)
    const linkedReturn = await client.query(
      `SELECT * FROM marketplace_membership_cycle_usage
       WHERE related_usage_id = $1 AND event_type = 'returned'
       LIMIT 1`,
      [consumedRow.id],
    );
    if (linkedReturn.rows[0]) {
      const cycle = await client.query(
        `SELECT * FROM marketplace_membership_cycles WHERE id = $1`,
        [consumedRow.cycle_id],
      );
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        usage: mapUsage(linkedReturn.rows[0]),
        allowed: Number(cycle.rows[0]?.priority_bid_uses_allowed) || 0,
        used: Number(cycle.rows[0]?.priority_bid_uses_consumed) || 0,
        remaining: cycle.rows[0] ? remainingFromCycle(cycle.rows[0]) : 0,
      };
    }

    const { rows: cycleRows } = await client.query(
      `SELECT * FROM marketplace_membership_cycles WHERE id = $1 FOR UPDATE`,
      [consumedRow.cycle_id],
    );
    const cycle = cycleRows[0];
    if (!cycle) {
      throw createAppError("Cycle not found for usage return.", 404, {
        exposeToClient: true,
        publicCode: "CYCLE_NOT_FOUND",
      });
    }

    let usageRow;
    try {
      const inserted = await client.query(
        `INSERT INTO marketplace_membership_cycle_usage (
           cycle_id, membership_id, freelancer_user_id,
           event_type, delta, reference_type, reference_id,
           related_usage_id, reason, actor_user_id
         ) VALUES ($1, $2, $3, 'returned', -1, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          cycle.id,
          cycle.membership_id,
          consumedRow.freelancer_user_id,
          referenceType,
          referenceId,
          consumedRow.id,
          input.reason || "return_on_cancel",
          input.actorUserId || null,
        ],
      );
      usageRow = inserted.rows[0];
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await client.query(
          `SELECT * FROM marketplace_membership_cycle_usage
           WHERE cycle_id = $1
             AND reference_type = $2
             AND reference_id = $3
             AND event_type = 'returned'
           LIMIT 1`,
          [cycle.id, referenceType, referenceId],
        );
        if (ownTxn) await client.query("COMMIT");
        return {
          ok: true,
          idempotent: true,
          usage: mapUsage(again.rows[0]),
          allowed: Number(cycle.priority_bid_uses_allowed) || 0,
          used: Number(cycle.priority_bid_uses_consumed) || 0,
          remaining: remainingFromCycle(cycle),
        };
      }
      throw err;
    }

    const updated = await client.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_consumed = priority_bid_uses_consumed - 1
       WHERE id = $1
         AND priority_bid_uses_consumed > 0
       RETURNING *`,
      [cycle.id],
    );
    if (!updated.rows[0]) {
      throw createAppError("Cannot return Priority Bid use below zero.", 409, {
        exposeToClient: true,
        publicCode: "PRIORITY_USE_RETURN_INVALID",
      });
    }

    await writeAudit(client, {
      membershipId: cycle.membership_id,
      cycleId: cycle.id,
      freelancerUserId: consumedRow.freelancer_user_id,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.PRIORITY_USE_RETURNED,
      detail: {
        referenceType,
        referenceId,
        usageId: String(usageRow.id),
        relatedUsageId: String(consumedRow.id),
      },
    });

    if (ownTxn) await client.query("COMMIT");
    const row = updated.rows[0];
    return {
      ok: true,
      idempotent: false,
      usage: mapUsage(usageRow),
      allowed: Number(row.priority_bid_uses_allowed) || 0,
      used: Number(row.priority_bid_uses_consumed) || 0,
      remaining: remainingFromCycle(row),
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

module.exports = {
  mapUsage,
  getPriorityBidAllowanceForFreelancer,
  canConsumePriorityBidUse,
  consumePriorityBidUse,
  returnPriorityBidUse,
};
