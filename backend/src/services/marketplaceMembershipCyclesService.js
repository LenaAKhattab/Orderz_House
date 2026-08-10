/**
 * Marketplace Membership monthly benefit cycles — Phase 3 / 3.1.
 * Lazy creation + idempotent reconciliation. Anniversary-anchored windows.
 * Snapshots Priority Bid allowance at cycle create/activate.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  MEMBERSHIP_AUDIT_ACTIONS,
  isReconcileStatus,
} = require("../constants/marketplaceMemberships");
const {
  computeCycleWindow,
  resolveCycleNumberAt,
  toUtcDate,
} = require("../utils/marketplaceMembershipCycleDates");
const marketplaceMembershipPlansService = require("./marketplaceMembershipPlansService");

function mapCycle(row) {
  if (!row) return null;
  const allowed = Number(row.priority_bid_uses_allowed) || 0;
  const consumed = Number(row.priority_bid_uses_consumed) || 0;
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    cycleNumber: Number(row.cycle_number),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    marketplacePlanId: String(row.marketplace_plan_id),
    priorityBidUsesAllowed: allowed,
    priorityBidUsesConsumed: consumed,
    priorityBidUsesRemaining: Math.max(allowed - consumed, 0),
    includedTokensAllowed: Number(row.included_tokens_allowed) || 0,
    createdAt: row.created_at || null,
    activatedAt: row.activated_at || null,
    closedAt: row.closed_at || null,
  };
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

async function createAndActivateCycleForMembership({
  membership,
  plan = null,
  cycleNumber,
  now = new Date(),
  client: externalClient = null,
  actorUserId = null,
}) {
  const membershipId = Number(membership.id || membership.membership_id || membership);
  if (!Number.isInteger(membershipId) || membershipId < 1) {
    throw createAppError("membershipId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MEMBERSHIP",
    });
  }

  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");

    const { rows: memRows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    const mem = memRows[0];
    if (!mem) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }

    const instant = toUtcDate(now);
    if (mem.paid_term_ends_at && toUtcDate(mem.paid_term_ends_at) <= instant) {
      throw createAppError("Cannot create cycle after paid term ended.", 400, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_TERM_ENDED",
      });
    }

    const planId = Number(plan?.id || mem.marketplace_plan_id);
    const planRow =
      plan ||
      (await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(planId, client));
    if (!planRow) {
      throw createAppError("Marketplace plan not found.", 404, {
        exposeToClient: true,
        publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
      });
    }

    const window = computeCycleWindow({
      membershipStartedAt: mem.started_at || mem.paid_term_starts_at,
      cycleNumber,
      anchorDay: mem.cycle_anchor_day,
    });

    let endsAt = window.endsAt;
    const termEnd = mem.paid_term_ends_at ? toUtcDate(mem.paid_term_ends_at) : null;
    if (termEnd && endsAt > termEnd) {
      endsAt = termEnd;
    }
    if (!(endsAt > window.startsAt)) {
      throw createAppError("Cycle window invalid against paid term.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_CYCLE_WINDOW",
      });
    }

    await client.query(
      `UPDATE marketplace_membership_cycles
       SET status = 'closed', closed_at = COALESCE(closed_at, $2)
       WHERE membership_id = $1 AND status = 'active'`,
      [membershipId, instant.toISOString()],
    );

    const allowed = Number(planRow.priorityBidUsesPerCycle) || 0;
    const tokensAllowed = Number(planRow.includedTokensPerCycle) || 0;

    let cycleRow;
    let createdNew = false;
    try {
      const inserted = await client.query(
        `INSERT INTO marketplace_membership_cycles (
           membership_id, cycle_number, starts_at, ends_at, status,
           marketplace_plan_id, priority_bid_uses_allowed, included_tokens_allowed,
           priority_bid_uses_consumed, activated_at
         ) VALUES (
           $1, $2, $3, $4, 'active',
           $5, $6, $7,
           0, $8
         )
         RETURNING *`,
        [
          membershipId,
          cycleNumber,
          window.startsAt.toISOString(),
          endsAt.toISOString(),
          planId,
          allowed,
          tokensAllowed,
          instant.toISOString(),
        ],
      );
      cycleRow = inserted.rows[0];
      createdNew = true;
    } catch (err) {
      if (err && err.code === "23505") {
        const existing = await client.query(
          `SELECT * FROM marketplace_membership_cycles
           WHERE membership_id = $1 AND cycle_number = $2
           FOR UPDATE`,
          [membershipId, cycleNumber],
        );
        cycleRow = existing.rows[0];
        if (cycleRow && cycleRow.status !== "active") {
          await client.query(
            `UPDATE marketplace_membership_cycles
             SET status = 'active',
                 activated_at = COALESCE(activated_at, $2),
                 closed_at = NULL
             WHERE id = $1 AND status <> 'active'`,
            [cycleRow.id, instant.toISOString()],
          );
          const refreshed = await client.query(
            `SELECT * FROM marketplace_membership_cycles WHERE id = $1`,
            [cycleRow.id],
          );
          cycleRow = refreshed.rows[0];
          await writeAudit(client, {
            membershipId,
            cycleId: cycleRow.id,
            freelancerUserId: mem.freelancer_user_id,
            actorUserId,
            action: MEMBERSHIP_AUDIT_ACTIONS.CYCLE_ACTIVATED,
            detail: { cycleNumber, via: "idempotent_reactivate" },
          });
        }
        // Already active: no duplicate CYCLE_CREATED / ACTIVATED audits
      } else {
        throw err;
      }
    }

    if (createdNew) {
      await writeAudit(client, {
        membershipId,
        cycleId: cycleRow.id,
        freelancerUserId: mem.freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.CYCLE_CREATED,
        detail: {
          cycleNumber,
          priorityBidUsesAllowed: allowed,
          includedTokensAllowed: tokensAllowed,
          marketplacePlanId: String(planId),
        },
      });
      await writeAudit(client, {
        membershipId,
        cycleId: cycleRow.id,
        freelancerUserId: mem.freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.CYCLE_ACTIVATED,
        detail: { cycleNumber },
      });
    }

    if (ownTxn) await client.query("COMMIT");
    return mapCycle(cycleRow);
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

async function closeActiveCycle({
  membershipId,
  client: externalClient = null,
  now = new Date(),
  actorUserId = null,
}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows } = await client.query(
      `UPDATE marketplace_membership_cycles
       SET status = 'closed', closed_at = COALESCE(closed_at, $2)
       WHERE membership_id = $1 AND status = 'active'
       RETURNING *`,
      [membershipId, instant.toISOString()],
    );
    for (const row of rows) {
      await writeAudit(client, {
        membershipId,
        cycleId: row.id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.CYCLE_CLOSED,
        detail: { cycleNumber: row.cycle_number },
      });
    }
    if (ownTxn) await client.query("COMMIT");
    return rows.map(mapCycle);
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

async function getCurrentActiveCycle(membershipId, options = {}) {
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT * FROM marketplace_membership_cycles
     WHERE membership_id = $1 AND status = 'active'
     LIMIT 1`,
    [membershipId],
  );
  return mapCycle(rows[0] || null);
}

/**
 * Idempotent reconciliation for one membership.
 * Strategy B: create ONLY the due anniversary cycle (correct cycle_number).
 * Suspended memberships still advance calendar cycles; usage is blocked elsewhere.
 */
async function reconcileMembershipCycles({
  membershipId,
  now = new Date(),
  client: externalClient = null,
}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows: memRows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    const mem = memRows[0];
    if (!mem) {
      if (ownTxn) await client.query("COMMIT");
      return { ok: false, reason: "not_found" };
    }

    if (
      isReconcileStatus(mem.status) &&
      mem.paid_term_ends_at &&
      toUtcDate(mem.paid_term_ends_at) <= instant
    ) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'expired',
             is_current = FALSE,
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW()
         WHERE id = $1`,
        [membershipId, instant.toISOString()],
      );
      await client.query(
        `UPDATE marketplace_membership_cycles
         SET status = 'closed', closed_at = COALESCE(closed_at, $2)
         WHERE membership_id = $1 AND status = 'active'`,
        [membershipId, instant.toISOString()],
      );
      await writeAudit(client, {
        membershipId,
        freelancerUserId: mem.freelancer_user_id,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
        detail: { via: "reconcile" },
      });
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, expired: true, cycle: null };
    }

    if (!isReconcileStatus(mem.status) || !mem.is_current) {
      await client.query(
        `UPDATE marketplace_membership_cycles
         SET status = 'closed', closed_at = COALESCE(closed_at, $2)
         WHERE membership_id = $1 AND status = 'active'`,
        [membershipId, instant.toISOString()],
      );
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, expired: false, cycle: null, reason: "membership_not_reconcileable" };
    }

    const startedAt = mem.started_at || mem.paid_term_starts_at;
    const dueCycleNumber = resolveCycleNumberAt({
      membershipStartedAt: startedAt,
      at: instant,
      anchorDay: mem.cycle_anchor_day,
    });
    if (dueCycleNumber == null) {
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, cycle: null, reason: "before_start" };
    }

    await client.query(
      `UPDATE marketplace_membership_cycles
       SET status = 'closed', closed_at = COALESCE(closed_at, $2)
       WHERE membership_id = $1
         AND status = 'active'
         AND ends_at <= $2`,
      [membershipId, instant.toISOString()],
    );

    const { rows: activeRows } = await client.query(
      `SELECT * FROM marketplace_membership_cycles
       WHERE membership_id = $1 AND status = 'active'
       LIMIT 1`,
      [membershipId],
    );

    if (activeRows[0] && Number(activeRows[0].cycle_number) === dueCycleNumber) {
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, cycle: mapCycle(activeRows[0]), created: false };
    }

    if (activeRows[0]) {
      await client.query(
        `UPDATE marketplace_membership_cycles
         SET status = 'closed', closed_at = COALESCE(closed_at, $2)
         WHERE id = $1`,
        [activeRows[0].id, instant.toISOString()],
      );
    }

    const cycle = await createAndActivateCycleForMembership({
      membership: mem,
      cycleNumber: dueCycleNumber,
      now: instant,
      client,
    });

    if (ownTxn) await client.query("COMMIT");
    return { ok: true, cycle, created: true, dueCycleNumber };
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
 * Batch reconciliation — current memberships only.
 * Multi-instance safety: each reconcileMembershipCycles takes membership FOR UPDATE;
 * unique cycle indexes + idempotent create prevent duplicates.
 */
async function reconcileAllMarketplaceMembershipCycles({ now = new Date(), limit = 200 } = {}) {
  const instant = toUtcDate(now);
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  let rows;
  try {
    const result = await pool.query(
      `SELECT id FROM freelancer_marketplace_memberships
       WHERE is_current = TRUE
         AND status IN ('active', 'cancel_at_period_end', 'suspended')
       ORDER BY id ASC
       LIMIT $1`,
      [lim],
    );
    rows = result.rows;
  } catch (err) {
    if (err && err.code === "42P01") {
      return { processed: 0, results: [], schemaPending: true };
    }
    throw err;
  }
  const results = [];
  for (const row of rows) {
    // eslint-disable-next-line no-await-in-loop
    const r = await reconcileMembershipCycles({ membershipId: row.id, now: instant });
    results.push({ membershipId: String(row.id), ...r });
  }
  return { processed: results.length, results };
}

module.exports = {
  mapCycle,
  createAndActivateCycleForMembership,
  closeActiveCycle,
  getCurrentActiveCycle,
  reconcileMembershipCycles,
  reconcileAllMarketplaceMembershipCycles,
  CYCLE_CREATION_STRATEGY: "lazy_current_only_with_db_reconciliation",
};
