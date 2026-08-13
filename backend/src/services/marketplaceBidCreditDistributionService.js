/**
 * Membership Bid Credit daily distribution + reconciliation — Phase B1/B3.
 *
 * Monthly allowance N is unlocked across D subscription-month days via floor(N*k/D).
 * Lazy reconcile on reads + optional internal tick. Missed days catch up exactly.
 * Membership-derived grants expire at membership paid_term_ends_at.
 * Annual memberships: each cycle month distributes its own monthly allowance; unused accumulate until membership end.
 *
 * Phase B3:
 * - Accrual unlocks only while bid_credits_enabled (engine OFF = no preload grants; catch-up on enable).
 * - Unlock only for BENEFIT_USABLE memberships (active / cancel_at_period_end).
 * - Supersede/close cycle closes open distribution months (no double accrual with new membership).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  countUtcCalendarDaysInWindow,
  resolveCurrentDayIndex,
  dailyBidUnlockAmount,
} = require("../utils/marketplaceBidCreditDistributionMath");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");
const accounting = require("./marketplaceBidCreditAccountingService");
const { BID_CREDIT_ERROR_CODES } = require("../constants/marketplaceBidCredits");
const { BENEFIT_USABLE_MEMBERSHIP_STATUSES } = require("../constants/marketplaceMemberships");
const {
  getMarketplaceEconomySettings,
  isBidCreditsEngineActive,
} = require("./marketplaceEconomySettingsService");

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

function mapDistributionMonth(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    membershipId: String(row.membership_id),
    cycleId: String(row.cycle_id),
    freelancerUserId: String(row.freelancer_user_id),
    marketplacePlanId: String(row.marketplace_plan_id),
    monthlyBidAllowanceSnapshot: Number(row.monthly_bid_allowance_snapshot) || 0,
    windowStartsAt: row.window_starts_at,
    windowEndsAt: row.window_ends_at,
    dayCount: Number(row.day_count),
    membershipExpiresAt: row.membership_expires_at,
    lastReconciledDayIndex: Number(row.last_reconciled_day_index) || 0,
    totalUnlocked: Number(row.total_unlocked) || 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertSchema(client) {
  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
}

/**
 * Ensure a distribution-month row exists for an activated cycle (idempotent).
 * Snapshots monthly_bid_allowance from cycle snapshot or plan.
 */
async function ensureDistributionMonthForCycle({
  client: externalClient = null,
  cycleRow,
  membershipRow,
  actorUserId = null,
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertSchema(client);

    const cycleId = Number(cycleRow.id);
    const existing = await client.query(
      `SELECT * FROM marketplace_membership_bid_distribution_months WHERE cycle_id = $1 FOR UPDATE`,
      [cycleId],
    );
    if (existing.rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return { month: mapDistributionMonth(existing.rows[0]), created: false };
    }

    let allowance = Number(cycleRow.monthly_bid_allowance_snapshot);
    if (!Number.isInteger(allowance) || allowance < 0) {
      allowance = 0;
    }
    // Prefer explicit cycle snapshot; if column was defaulted 0 but plan has value and cycle just created,
    // callers should set cycle snapshot before calling. Fallback to plan.
    if (allowance === 0 && cycleRow.marketplace_plan_id) {
      const plan = await client.query(
        `SELECT monthly_bid_allowance FROM marketplace_membership_plans WHERE id = $1`,
        [cycleRow.marketplace_plan_id],
      );
      if (plan.rows[0] && Number(plan.rows[0].monthly_bid_allowance) > 0) {
        // Only use plan fallback when cycle snapshot column may not have been populated yet.
        // Still: once distribution month is created, snapshot is frozen on THIS row.
        allowance = Number(plan.rows[0].monthly_bid_allowance) || 0;
      }
    }

    const windowStartsAt = new Date(cycleRow.starts_at);
    const windowEndsAt = new Date(cycleRow.ends_at);
    const dayCount = countUtcCalendarDaysInWindow(windowStartsAt, windowEndsAt);
    const membershipExpiresAt = membershipRow.paid_term_ends_at
      ? new Date(membershipRow.paid_term_ends_at)
      : windowEndsAt;

    const { rows } = await client.query(
      `INSERT INTO marketplace_membership_bid_distribution_months (
         membership_id, cycle_id, freelancer_user_id,
         marketplace_plan_id, monthly_bid_allowance_snapshot,
         window_starts_at, window_ends_at, day_count,
         membership_expires_at,
         last_reconciled_day_index, total_unlocked, status
       ) VALUES (
         $1, $2, $3,
         $4, $5,
         $6, $7, $8,
         $9,
         0, 0, 'open'
       )
       ON CONFLICT (cycle_id) DO NOTHING
       RETURNING *`,
      [
        membershipRow.id,
        cycleId,
        membershipRow.freelancer_user_id,
        cycleRow.marketplace_plan_id,
        allowance,
        windowStartsAt.toISOString(),
        windowEndsAt.toISOString(),
        dayCount,
        membershipExpiresAt.toISOString(),
      ],
    );

    let row = rows[0];
    if (!row) {
      const again = await client.query(
        `SELECT * FROM marketplace_membership_bid_distribution_months WHERE cycle_id = $1`,
        [cycleId],
      );
      row = again.rows[0];
    }

    // Align cycle snapshot if still zero and we resolved allowance
    if (allowance > 0) {
      await client.query(
        `UPDATE marketplace_membership_cycles
            SET monthly_bid_allowance_snapshot = GREATEST(monthly_bid_allowance_snapshot, $2)
          WHERE id = $1 AND monthly_bid_allowance_snapshot = 0`,
        [cycleId, allowance],
      );
    }

    if (ownTxn) await client.query("COMMIT");
    return { month: mapDistributionMonth(row), created: Boolean(rows[0]), actorUserId };
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
 * Reconcile unlocks for one distribution month up to `now` (idempotent).
 */
async function reconcileDistributionMonth({
  client: externalClient = null,
  distributionMonthId = null,
  distributionMonthRow = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertSchema(client);

    let row = distributionMonthRow;
    if (!row) {
      const { rows } = await client.query(
        `SELECT * FROM marketplace_membership_bid_distribution_months WHERE id = $1 FOR UPDATE`,
        [Number(distributionMonthId)],
      );
      row = rows[0];
    } else {
      const { rows } = await client.query(
        `SELECT * FROM marketplace_membership_bid_distribution_months WHERE id = $1 FOR UPDATE`,
        [row.id],
      );
      row = rows[0];
    }
    if (!row) {
      throw createAppError("Distribution month not found.", 404, { exposeToClient: true });
    }

    if (row.status === "closed") {
      if (ownTxn) await client.query("COMMIT");
      return { month: mapDistributionMonth(row), unlockedNow: 0, daysAdvanced: 0 };
    }

    // Phase B3: do not unlock while engine OFF (catch-up when enabled). Still close ended windows.
    const settings = await getMarketplaceEconomySettings(client);
    const engineOn = isBidCreditsEngineActive(settings);

    // Phase B3: pause unlock when membership is not benefit-usable (suspended/superseded/expired).
    const { rows: memRows } = await client.query(
      `SELECT status, is_current FROM freelancer_marketplace_memberships WHERE id = $1`,
      [Number(row.membership_id)],
    );
    const mem = memRows[0];
    const memStatus = String(mem?.status || "");
    const membershipUsable =
      mem &&
      mem.is_current === true &&
      BENEFIT_USABLE_MEMBERSHIP_STATUSES.includes(memStatus);

    const N = Number(row.monthly_bid_allowance_snapshot) || 0;
    const D = Number(row.day_count);
    const targetDay = resolveCurrentDayIndex(row.window_starts_at, row.window_ends_at, D, now);
    let last = Number(row.last_reconciled_day_index) || 0;

    if (mem && mem.is_current === true && memStatus === "suspended") {
      // Pause accrual: advance day index without granting so resume does not backfill suspended days.
      if (targetDay > last) {
        await client.query(
          `UPDATE marketplace_membership_bid_distribution_months
              SET last_reconciled_day_index = $2,
                  status = CASE WHEN $3::boolean THEN 'closed' ELSE status END,
                  closed_at = CASE WHEN $3::boolean THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
                  updated_at = NOW()
            WHERE id = $1`,
          [row.id, targetDay, new Date(now) >= new Date(row.window_ends_at) || targetDay >= D],
        );
        last = targetDay;
      } else if (new Date(now) >= new Date(row.window_ends_at)) {
        await client.query(
          `UPDATE marketplace_membership_bid_distribution_months
              SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
            WHERE id = $1 AND status = 'open'`,
          [row.id],
        );
      }
      const { rows: pausedRows } = await client.query(
        `SELECT * FROM marketplace_membership_bid_distribution_months WHERE id = $1`,
        [row.id],
      );
      if (ownTxn) await client.query("COMMIT");
      return {
        month: mapDistributionMonth(pausedRows[0] || row),
        unlockedNow: 0,
        daysAdvanced: Math.max(0, targetDay - Number(row.last_reconciled_day_index || 0)),
        skipped: true,
        reason: "membership_suspended",
      };
    }

    if (!membershipUsable) {
      await client.query(
        `UPDATE marketplace_membership_bid_distribution_months
            SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
          WHERE id = $1 AND status = 'open'`,
        [row.id],
      );
      const { rows: closedRows } = await client.query(
        `SELECT * FROM marketplace_membership_bid_distribution_months WHERE id = $1`,
        [row.id],
      );
      if (ownTxn) await client.query("COMMIT");
      return {
        month: mapDistributionMonth(closedRows[0] || row),
        unlockedNow: 0,
        daysAdvanced: 0,
        skipped: true,
        reason: "membership_not_benefit_usable",
      };
    }

    let unlockedNow = 0;
    let daysAdvanced = 0;

    if (!engineOn) {
      // Do not advance last_reconciled_day_index — catch-up when engine turns ON.
      if (new Date(now) >= new Date(row.window_ends_at) && row.status === "open" && N === 0) {
        await client.query(
          `UPDATE marketplace_membership_bid_distribution_months
              SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
            WHERE id = $1`,
          [row.id],
        );
        row.status = "closed";
      }
      if (ownTxn) await client.query("COMMIT");
      return {
        month: mapDistributionMonth(row),
        unlockedNow: 0,
        daysAdvanced: 0,
        skipped: true,
        reason: "engine_off",
      };
    }

    if (N === 0 || targetDay <= last) {
      // Still may need to close after window end
      if (new Date(now) >= new Date(row.window_ends_at) && row.status === "open") {
        await client.query(
          `UPDATE marketplace_membership_bid_distribution_months
              SET status = 'closed', closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
            WHERE id = $1`,
          [row.id],
        );
        row.status = "closed";
      }
      if (ownTxn) await client.query("COMMIT");
      return { month: mapDistributionMonth(row), unlockedNow: 0, daysAdvanced: 0 };
    }

    for (let k = last + 1; k <= targetDay; k += 1) {
      const amount = dailyBidUnlockAmount(N, k, D);
      if (amount > 0) {
        const idem = `membership_bid_daily:${row.id}:day:${k}`;
        await accounting.createBidCreditGrant({
          client,
          freelancerUserId: row.freelancer_user_id,
          sourceType: "membership_daily_unlock",
          amount,
          expiresAt: row.membership_expires_at,
          eventType: "MEMBERSHIP_BID_GRANT",
          idempotencyKey: idem,
          membershipId: row.membership_id,
          cycleId: row.cycle_id,
          distributionMonthId: row.id,
          reason: "membership_daily_bid_unlock",
          referenceType: "membership_bid_distribution_day",
          referenceId: `${row.id}:${k}`,
          metadata: {
            dayIndex: k,
            dayCount: D,
            monthlyBidAllowanceSnapshot: N,
            distributionMonthId: String(row.id),
          },
          grantedAt: now,
        });
        unlockedNow += amount;
      }
      last = k;
      daysAdvanced += 1;
    }

    const { rows: updated } = await client.query(
      `UPDATE marketplace_membership_bid_distribution_months
          SET last_reconciled_day_index = $2,
              total_unlocked = $3,
              status = CASE WHEN $4::boolean THEN 'closed' ELSE status END,
              closed_at = CASE WHEN $4::boolean THEN COALESCE(closed_at, NOW()) ELSE closed_at END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        row.id,
        last,
        Number(row.total_unlocked) + unlockedNow,
        new Date(now) >= new Date(row.window_ends_at) || last >= D,
      ],
    );

    if (ownTxn) await client.query("COMMIT");
    return {
      month: mapDistributionMonth(updated[0]),
      unlockedNow,
      daysAdvanced,
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
 * Reconcile all open distribution months for a freelancer (lazy read path).
 */
async function reconcileFreelancerBidDistributions({
  freelancerUserId,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    if (!(await marketplaceBidCreditsSchemaReady(client))) {
      if (ownTxn) await client.query("COMMIT");
      return { reconciled: 0, unlockedNow: 0, schemaReady: false };
    }

    // Close open months tied to non-current / terminal memberships (keep suspended current for pause accrual).
    await client.query(
      `UPDATE marketplace_membership_bid_distribution_months d
          SET status = 'closed',
              closed_at = COALESCE(d.closed_at, NOW()),
              updated_at = NOW()
        FROM freelancer_marketplace_memberships m
       WHERE d.membership_id = m.id
         AND d.freelancer_user_id = $1
         AND d.status = 'open'
         AND (
           m.is_current IS NOT TRUE
           OR m.status = ANY($2::text[])
         )`,
      [Number(freelancerUserId), ["expired", "cancelled", "superseded"]],
    );

    const { rows } = await client.query(
      `SELECT d.id
         FROM marketplace_membership_bid_distribution_months d
         JOIN freelancer_marketplace_memberships m ON m.id = d.membership_id
        WHERE d.freelancer_user_id = $1
          AND d.status = 'open'
          AND m.is_current = TRUE
          AND (
            m.status = ANY($2::text[])
            OR m.status = 'suspended'
          )
        ORDER BY d.window_starts_at ASC, d.id ASC
        FOR UPDATE OF d`,
      [Number(freelancerUserId), [...BENEFIT_USABLE_MEMBERSHIP_STATUSES]],
    );

    let unlockedNow = 0;
    for (const r of rows) {
      const out = await reconcileDistributionMonth({
        client,
        distributionMonthId: r.id,
        now,
      });
      unlockedNow += out.unlockedNow || 0;
    }

    await accounting.expireDueBidCreditGrants({
      client,
      freelancerUserId,
      now,
    });

    if (ownTxn) await client.query("COMMIT");
    return { reconciled: rows.length, unlockedNow, schemaReady: true };
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
 * Housekeeping tick: reconcile a batch of open distribution months + expire grants.
 */
async function runBidCreditReconcileTick({ limit = 100, now = new Date() } = {}) {
  const client = await pool.connect();
  try {
    if (!(await marketplaceBidCreditsSchemaReady(client))) {
      return { ok: true, skipped: true, reason: "SCHEMA_NOT_READY" };
    }
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id FROM marketplace_membership_bid_distribution_months
        WHERE status = 'open'
        ORDER BY updated_at ASC, id ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [Math.min(500, Math.max(1, Number(limit) || 100))],
    );
    let unlockedNow = 0;
    for (const r of rows) {
      const out = await reconcileDistributionMonth({
        client,
        distributionMonthId: r.id,
        now,
      });
      unlockedNow += out.unlockedNow || 0;
    }
    const expired = await accounting.expireDueBidCreditGrants({ client, now, limit: 500 });
    await client.query("COMMIT");
    return {
      ok: true,
      monthsProcessed: rows.length,
      unlockedNow,
      expired,
    };
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

/**
 * Close open Bid distribution months for a membership (supersede / cycle close).
 * Does not revoke already-unlocked grants; those remain spendable until their own expires_at.
 */
async function closeOpenDistributionMonthsForMembership({
  membershipId,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    if (!(await marketplaceBidCreditsSchemaReady(client))) {
      if (ownTxn) await client.query("COMMIT");
      return { closed: 0, schemaReady: false };
    }
    const { rows } = await client.query(
      `UPDATE marketplace_membership_bid_distribution_months
          SET status = 'closed',
              closed_at = COALESCE(closed_at, $2),
              updated_at = NOW()
        WHERE membership_id = $1
          AND status = 'open'
        RETURNING id`,
      [Number(membershipId), new Date(now).toISOString()],
    );
    if (ownTxn) await client.query("COMMIT");
    return { closed: rows.length, schemaReady: true };
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
  ensureDistributionMonthForCycle,
  reconcileDistributionMonth,
  reconcileFreelancerBidDistributions,
  runBidCreditReconcileTick,
  closeOpenDistributionMonthsForMembership,
  mapDistributionMonth,
};
