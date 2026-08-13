/**
 * Marketplace Memberships (باقات العمل) — Phase 3 / 3.1 domain.
 * Independent of freelancer_subscriptions / legacy plans.
 * No Stripe checkout. No wallet. No auctions. No Production purchase wiring.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  MEMBERSHIP_SOURCES,
  MEMBERSHIP_AUDIT_ACTIONS,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
  RECONCILE_MEMBERSHIP_STATUSES,
  isBenefitUsableStatus,
  isReconcileStatus,
} = require("../constants/marketplaceMemberships");
const {
  resolveCycleAnchorDay,
  toUtcDate,
  addCalendarMonthsAnchored,
} = require("../utils/marketplaceMembershipCycleDates");
const marketplaceMembershipPlansService = require("./marketplaceMembershipPlansService");
const marketplaceMembershipCyclesService = require("./marketplaceMembershipCyclesService");
const {
  marketplacePlanJoinSelectExtras,
} = require("../utils/marketplaceMembershipPlanSchema");
const { defaultArticleAccessLevelForTier } = require("../constants/marketplaceMembershipPlans");

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

function toIdString(value) {
  if (value == null) return null;
  return String(value);
}

function isMissingRelationError(err) {
  return err && (err.code === "42P01" || /does not exist/i.test(String(err.message || "")));
}

function isUniqueViolation(err) {
  return err && err.code === "23505";
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: toIdString(row.id),
    freelancerUserId: toIdString(row.freelancer_user_id),
    marketplacePlanId: toIdString(row.marketplace_plan_id),
    isCurrent: isTruthyFlag(row.is_current),
    status: row.status,
    source: row.source,
    cycleAnchorDay: Number(row.cycle_anchor_day) || null,
    startedAt: row.started_at || null,
    paidTermStartsAt: row.paid_term_starts_at || null,
    paidTermEndsAt: row.paid_term_ends_at || null,
    cancelAtPeriodEnd: isTruthyFlag(row.cancel_at_period_end),
    cancelledAt: row.cancelled_at || null,
    endedAt: row.ended_at || null,
    autoRenew: isTruthyFlag(row.auto_renew),
    stripeSubscriptionId: row.stripe_subscription_id || null,
    notes: row.notes || null,
    createdByUserId: toIdString(row.created_by_user_id),
    updatedByUserId: toIdString(row.updated_by_user_id),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function writeAudit(client, {
  membershipId = null,
  cycleId = null,
  freelancerUserId = null,
  actorUserId = null,
  action,
  detail = null,
}) {
  await client.query(
    `INSERT INTO marketplace_membership_audit_logs
      (membership_id, cycle_id, freelancer_user_id, actor_user_id, action, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      membershipId,
      cycleId,
      freelancerUserId,
      actorUserId,
      action,
      detail ? JSON.stringify(detail) : null,
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

function mapPlanFields(row) {
  return {
    id: toIdString(row.marketplace_plan_id),
    tierCode: row.plan_tier_code,
    nameAr: row.plan_name_ar,
    nameEn: row.plan_name_en || null,
    slug: row.plan_slug || null,
    priorityBidEnabled: isTruthyFlag(row.plan_priority_bid_enabled),
    priorityBidUsesPerCycle: Number(row.plan_priority_bid_uses_per_cycle) || 0,
    includedTokensPerCycle: Number(row.plan_included_tokens_per_cycle) || 0,
    articleAccessLevel:
      row.plan_article_access_level == null
        ? defaultArticleAccessLevelForTier(row.plan_tier_code)
        : Number(row.plan_article_access_level) || 1,
    eliteDirectOrdersEnabled: isTruthyFlag(row.plan_elite_direct_orders_enabled),
    monthlyPriceJod:
      row.plan_monthly_price_jod != null ? Number(row.plan_monthly_price_jod) : null,
  };
}

/**
 * Create + activate a Marketplace Membership atomically (internal).
 * Replaces prior current membership as superseded (history retained).
 */
async function createAndActivateMarketplaceMembership(input) {
  const freelancerUserId = Number(input.freelancerUserId);
  const marketplacePlanId = Number(input.marketplacePlanId);
  if (!Number.isInteger(freelancerUserId) || freelancerUserId < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  if (!Number.isInteger(marketplacePlanId) || marketplacePlanId < 1) {
    throw createAppError("marketplacePlanId is required.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MARKETPLACE_PLAN",
    });
  }

  const source = String(input.source || "system").toLowerCase();
  if (!MEMBERSHIP_SOURCES.includes(source)) {
    throw createAppError("Invalid membership source.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MEMBERSHIP_SOURCE",
    });
  }

  const now = toUtcDate(input.now || new Date());
  const paidTermStartsAt = toUtcDate(input.paidTermStartsAt || now);
  let paidTermEndsAt;
  if (input.paidTermEndsAt) {
    paidTermEndsAt = toUtcDate(input.paidTermEndsAt);
  } else {
    const months = Number(input.paidTermMonths);
    if (!Number.isInteger(months) || months < 1 || months > 120) {
      throw createAppError("paidTermMonths must be an integer between 1 and 120.", 400, {
        exposeToClient: true,
        publicCode: "INVALID_PAID_TERM_MONTHS",
      });
    }
    const anchor = resolveCycleAnchorDay(paidTermStartsAt);
    paidTermEndsAt = addCalendarMonthsAnchored(paidTermStartsAt, months, anchor);
  }
  if (!(paidTermEndsAt > paidTermStartsAt)) {
    throw createAppError("paid_term_ends_at must be after paid_term_starts_at.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PAID_TERM",
    });
  }

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");

    const plan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(
      marketplacePlanId,
      client,
    );
    if (!plan || !plan.isActive) {
      throw createAppError("Marketplace plan not found or inactive.", 404, {
        exposeToClient: true,
        publicCode: "MARKETPLACE_PLAN_NOT_FOUND",
      });
    }

    // Serialize concurrent activations for this freelancer
    const userLock = await client.query(
      `SELECT id, role FROM users WHERE id = $1 FOR UPDATE`,
      [freelancerUserId],
    );
    if (!userLock.rows[0] || userLock.rows[0].role !== "freelancer") {
      throw createAppError("Freelancer not found.", 404, {
        exposeToClient: true,
        publicCode: "FREELANCER_NOT_FOUND",
      });
    }

    // Supersede previous current membership (history preserved; not "expired")
    const prior = await client.query(
      `SELECT id, status FROM freelancer_marketplace_memberships
       WHERE freelancer_user_id = $1 AND is_current = TRUE
       FOR UPDATE`,
      [freelancerUserId],
    );
    for (const old of prior.rows) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET is_current = FALSE,
             status = 'superseded',
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [old.id, now.toISOString(), input.actorUserId || null],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId: old.id,
        client,
        now,
        actorUserId: input.actorUserId || null,
      });
      await writeAudit(client, {
        membershipId: old.id,
        freelancerUserId,
        actorUserId: input.actorUserId || null,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUPERSEDED,
        detail: { previousStatus: old.status, reason: "replaced_by_new_membership" },
      });
    }

    const anchorDay = resolveCycleAnchorDay(paidTermStartsAt);
    let membershipRow;
    try {
      const { rows } = await client.query(
        `INSERT INTO freelancer_marketplace_memberships (
           freelancer_user_id, marketplace_plan_id, is_current, status, source,
           cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at,
           auto_renew, notes, created_by_user_id, updated_by_user_id
         ) VALUES (
           $1, $2, TRUE, 'active', $3,
           $4, $5, $5, $6,
           $7, $8, $9, $9
         )
         RETURNING *`,
        [
          freelancerUserId,
          marketplacePlanId,
          source,
          anchorDay,
          paidTermStartsAt.toISOString(),
          paidTermEndsAt.toISOString(),
          Boolean(input.autoRenew),
          input.notes || null,
          input.actorUserId || null,
        ],
      );
      membershipRow = rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw createAppError(
          "Another Marketplace Membership is already current for this freelancer.",
          409,
          {
            exposeToClient: true,
            publicCode: "MARKETPLACE_MEMBERSHIP_CONFLICT",
            cause: err,
          },
        );
      }
      throw err;
    }

    const membership = mapMembership(membershipRow);

    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CREATED,
      detail: {
        marketplacePlanId: String(marketplacePlanId),
        source,
        paidTermStartsAt: paidTermStartsAt.toISOString(),
        paidTermEndsAt: paidTermEndsAt.toISOString(),
      },
    });
    await writeAudit(client, {
      membershipId: membership.id,
      freelancerUserId,
      actorUserId: input.actorUserId || null,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_ACTIVATED,
      detail: { status: "active" },
    });

    const cycle = await marketplaceMembershipCyclesService.createAndActivateCycleForMembership({
      membership: membershipRow,
      plan,
      cycleNumber: 1,
      now,
      client,
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return { membership, currentCycle: cycle };
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
 * Canonical current Marketplace Membership resolver.
 * Requires is_current = TRUE (never status='active' alone).
 */
async function resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options = {}) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) return null;
  const db = options.client || pool;
  const extras = await marketplacePlanJoinSelectExtras(db);
  const { rows } = await db.query(
    `SELECT m.*,
            p.tier_code AS plan_tier_code,
            p.name_ar AS plan_name_ar,
            p.name_en AS plan_name_en,
            p.slug AS plan_slug,
            p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
            p.priority_bid_enabled AS plan_priority_bid_enabled,
            p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
            ${extras.sql}
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const membership = mapMembership(rows[0]);
  membership.plan = mapPlanFields(rows[0]);
  return membership;
}

async function getMarketplaceMembershipById(membershipId, options = {}) {
  const id = Number(membershipId);
  if (!Number.isInteger(id) || id < 1) return null;
  const db = options.client || pool;
  try {
    const extras = await marketplacePlanJoinSelectExtras(db);
    const { rows } = await db.query(
      `SELECT m.*,
              p.tier_code AS plan_tier_code,
              p.name_ar AS plan_name_ar,
              p.name_en AS plan_name_en,
              p.slug AS plan_slug,
              p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
              p.priority_bid_enabled AS plan_priority_bid_enabled,
              p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
              ${extras.sql}
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
       WHERE m.id = $1
       LIMIT 1`,
      [id],
    );
    if (!rows[0]) return null;
    const membership = mapMembership(rows[0]);
    membership.plan = mapPlanFields(rows[0]);
    return membership;
  } catch (err) {
    if (isMissingRelationError(err)) return null;
    throw err;
  }
}

async function getFreelancerMarketplaceMembershipSnapshot(freelancerUserId, options = {}) {
  try {
    const now = toUtcDate(options.now || new Date());
    const membership = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options);
    if (!membership) {
      return {
        hasMembership: false,
        membership: null,
        currentCycle: null,
        priorityBid: {
          allowed: 0,
          used: 0,
          remaining: 0,
          engineAvailable: false,
        },
      };
    }

    // Reconcile calendar for active/cancel_at_period_end/suspended while current
    if (isReconcileStatus(membership.status)) {
      await marketplaceMembershipCyclesService.reconcileMembershipCycles({
        membershipId: membership.id,
        now,
        client: options.client,
      });
    }

    const refreshed = await resolveCurrentMarketplaceMembershipForFreelancer(freelancerUserId, options);
    const current = refreshed || membership;
    const cycle = await marketplaceMembershipCyclesService.getCurrentActiveCycle(current.id, {
      client: options.client,
      now,
    });

    const allowed = cycle ? Number(cycle.priorityBidUsesAllowed) || 0 : 0;
    const used = cycle ? Number(cycle.priorityBidUsesConsumed) || 0 : 0;
    const remaining = Math.max(allowed - used, 0);
    const benefitsUsable = isBenefitUsableStatus(current.status);

    return {
      hasMembership: true,
      membership: {
        id: current.id,
        status: current.status,
        isCurrent: current.isCurrent,
        source: current.source,
        startedAt: current.startedAt,
        paidTermStartsAt: current.paidTermStartsAt,
        paidTermEndsAt: current.paidTermEndsAt,
        cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        plan: current.plan,
      },
      currentCycle: cycle
        ? {
            id: cycle.id,
            cycleNumber: cycle.cycleNumber,
            startsAt: cycle.startsAt,
            endsAt: cycle.endsAt,
            status: cycle.status,
            includedTokensAllowed: cycle.includedTokensAllowed,
          }
        : null,
      priorityBid: {
        allowed: benefitsUsable ? allowed : 0,
        used: benefitsUsable ? used : used,
        remaining: benefitsUsable ? remaining : 0,
        // Global Priority Bid engine remains OFF in Phase 3/3.1
        engineAvailable: false,
        membershipBenefitsUsable: benefitsUsable,
      },
    };
  } catch (err) {
    if (isMissingRelationError(err)) {
      return {
        hasMembership: false,
        membership: null,
        currentCycle: null,
        priorityBid: {
          allowed: 0,
          used: 0,
          remaining: 0,
          engineAvailable: false,
        },
        schemaPending: true,
      };
    }
    throw err;
  }
}

async function cancelMarketplaceMembership({
  membershipId,
  actorUserId = null,
  immediate = false,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const instant = toUtcDate(now);
    if (immediate) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'cancelled',
             is_current = FALSE,
             cancelled_at = $2,
             ended_at = $2,
             cancel_at_period_end = FALSE,
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId,
        client,
        now: instant,
        actorUserId,
      });
      await writeAudit(client, {
        membershipId,
        freelancerUserId: rows[0].freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CANCELLED,
        detail: { immediate: true, reason },
      });
    } else {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'cancel_at_period_end',
             cancel_at_period_end = TRUE,
             cancelled_at = COALESCE(cancelled_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await writeAudit(client, {
        membershipId,
        freelancerUserId: rows[0].freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_CANCEL_AT_PERIOD_END,
        detail: { immediate: false, reason },
      });
    }
    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
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
 * Suspend current membership (access hold). Paid term continues; no benefit consume.
 */
async function suspendMarketplaceMembership({
  membershipId,
  actorUserId = null,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const row = rows[0];
    if (!row.is_current) {
      throw createAppError("Only a current membership can be suspended.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_CURRENT",
      });
    }
    if (!["active", "cancel_at_period_end", "suspended"].includes(row.status)) {
      throw createAppError("Membership status cannot be suspended.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_SUSPEND_INVALID",
      });
    }
    if (row.status === "suspended") {
      if (ownTxn) await client.query("COMMIT");
      return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
    }

    const previousStatus = row.status;
    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = 'suspended',
           updated_at = NOW(),
           updated_by_user_id = $2
       WHERE id = $1`,
      [membershipId, actorUserId],
    );
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      actorUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUSPENDED,
      detail: { reason, previousStatus, at: toUtcDate(now).toISOString() },
    });
    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
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
 * Resume a suspended current membership → active (or cancel_at_period_end if flag set).
 * Then reconciles to the correct CURRENT anniversary cycle (no backlog benefits).
 */
async function resumeMarketplaceMembership({
  membershipId,
  actorUserId = null,
  reason = null,
  client: externalClient = null,
  now = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      throw createAppError("Membership not found.", 404, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_NOT_FOUND",
      });
    }
    const row = rows[0];
    if (!row.is_current || row.status !== "suspended") {
      throw createAppError("Only a current suspended membership can be resumed.", 409, {
        exposeToClient: true,
        publicCode: "MEMBERSHIP_RESUME_INVALID",
      });
    }

    // If paid term already ended during suspension → expire instead of resume benefits
    if (row.paid_term_ends_at && toUtcDate(row.paid_term_ends_at) <= instant) {
      await client.query(
        `UPDATE freelancer_marketplace_memberships
         SET status = 'expired',
             is_current = FALSE,
             ended_at = COALESCE(ended_at, $2),
             updated_at = NOW(),
             updated_by_user_id = $3
         WHERE id = $1`,
        [membershipId, instant.toISOString(), actorUserId],
      );
      await marketplaceMembershipCyclesService.closeActiveCycle({
        membershipId,
        client,
        now: instant,
        actorUserId,
      });
      await writeAudit(client, {
        membershipId,
        freelancerUserId: row.freelancer_user_id,
        actorUserId,
        action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
        detail: { via: "resume_after_term_ended", reason },
      });
      if (ownTxn) await client.query("COMMIT");
      return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
    }

    const nextStatus = row.cancel_at_period_end ? "cancel_at_period_end" : "active";
    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = $2,
           updated_at = NOW(),
           updated_by_user_id = $3
       WHERE id = $1`,
      [membershipId, nextStatus, actorUserId],
    );
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      actorUserId,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_RESUMED,
      detail: { reason, status: nextStatus, at: instant.toISOString() },
    });

    await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId,
      now: instant,
      client,
    });

    if (ownTxn) await client.query("COMMIT");
    return getMarketplaceMembershipById(membershipId, { client: ownTxn ? pool : client });
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

async function expireMarketplaceMembershipIfDue({
  membershipId,
  now = new Date(),
  client: externalClient = null,
}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    const instant = toUtcDate(now);
    const { rows } = await client.query(
      `SELECT * FROM freelancer_marketplace_memberships WHERE id = $1 FOR UPDATE`,
      [membershipId],
    );
    if (!rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false };
    }
    const row = rows[0];
    if (!RECONCILE_MEMBERSHIP_STATUSES.includes(row.status)) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false, reason: "not_expirable_status" };
    }
    if (!row.paid_term_ends_at || toUtcDate(row.paid_term_ends_at) > instant) {
      if (ownTxn) await client.query("COMMIT");
      return { expired: false, reason: "term_not_ended" };
    }

    await client.query(
      `UPDATE freelancer_marketplace_memberships
       SET status = 'expired',
           is_current = FALSE,
           ended_at = COALESCE(ended_at, $2),
           updated_at = NOW()
       WHERE id = $1`,
      [membershipId, instant.toISOString()],
    );
    await marketplaceMembershipCyclesService.closeActiveCycle({
      membershipId,
      client,
      now: instant,
    });
    await writeAudit(client, {
      membershipId,
      freelancerUserId: row.freelancer_user_id,
      action: MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_EXPIRED,
      detail: { paidTermEndsAt: row.paid_term_ends_at },
    });
    if (ownTxn) await client.query("COMMIT");
    return { expired: true };
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

async function listMarketplaceMembershipsForAdmin({
  limit = 50,
  offset = 0,
  freelancerUserId = null,
} = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const off = Math.max(Number(offset) || 0, 0);
  const params = [];
  let where = "";
  if (freelancerUserId != null) {
    params.push(Number(freelancerUserId));
    where = `WHERE m.freelancer_user_id = $${params.length}`;
  }
  params.push(lim, off);
  try {
    const extras = await marketplacePlanJoinSelectExtras(pool);
    const { rows } = await pool.query(
      `SELECT m.*,
              p.tier_code AS plan_tier_code,
              p.name_ar AS plan_name_ar,
              p.name_en AS plan_name_en,
              p.priority_bid_uses_per_cycle AS plan_priority_bid_uses_per_cycle,
              p.priority_bid_enabled AS plan_priority_bid_enabled,
              p.included_tokens_per_cycle AS plan_included_tokens_per_cycle,
              ${extras.sql},
              COALESCE(
                NULLIF(trim(concat_ws(' ', u.first_name, u.father_name, u.family_name)), ''),
                u.email
              ) AS freelancer_full_name,
              u.email AS freelancer_email
       FROM freelancer_marketplace_memberships m
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
       JOIN users u ON u.id = m.freelancer_user_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return rows.map((row) => {
      const m = mapMembership(row);
      m.plan = mapPlanFields(row);
      m.freelancer = {
        id: toIdString(row.freelancer_user_id),
        fullName: row.freelancer_full_name || null,
        email: row.freelancer_email || null,
      };
      return m;
    });
  } catch (err) {
    if (isMissingRelationError(err)) return [];
    throw err;
  }
}

module.exports = {
  mapMembership,
  writeAudit,
  createAndActivateMarketplaceMembership,
  resolveCurrentMarketplaceMembershipForFreelancer,
  getMarketplaceMembershipById,
  getFreelancerMarketplaceMembershipSnapshot,
  cancelMarketplaceMembership,
  suspendMarketplaceMembership,
  resumeMarketplaceMembership,
  expireMarketplaceMembershipIfDue,
  listMarketplaceMembershipsForAdmin,
  BENEFIT_USABLE_MEMBERSHIP_STATUSES,
};
