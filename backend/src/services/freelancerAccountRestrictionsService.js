/**
 * Canonical Super Admin marketplace moderation / review-hold service.
 * Independent of users.is_active, KYC, membership eligibility, and Stripe.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  RESTRICTION_TYPES,
  RESTRICTION_STATUSES,
  RESTRICTION_SCOPES,
  BID_MODERATION_STATUS,
  AUDIT_ACTIONS,
  PUBLIC_MESSAGES,
} = require("../constants/freelancerAccountRestrictions");

const VALID_TYPES = new Set(Object.values(RESTRICTION_TYPES));
const VALID_SCOPES = new Set(Object.values(RESTRICTION_SCOPES));

let schemaReadyCache = null;

async function schemaReady(db = pool) {
  if (schemaReadyCache === true) return true;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.freelancer_account_restrictions') AS t`,
    );
    schemaReadyCache = Boolean(rows[0]?.t);
  } catch {
    schemaReadyCache = false;
  }
  return schemaReadyCache;
}

function clearSchemaCache() {
  schemaReadyCache = null;
}

function normalizeScopes(scopes) {
  const list = Array.isArray(scopes) ? scopes.map((s) => String(s || "").trim()) : [];
  const cleaned = [...new Set(list.filter((s) => VALID_SCOPES.has(s)))];
  if (!cleaned.length) return [RESTRICTION_SCOPES.ALL_MARKETPLACE];
  if (cleaned.includes(RESTRICTION_SCOPES.ALL_MARKETPLACE)) {
    return [RESTRICTION_SCOPES.ALL_MARKETPLACE];
  }
  return cleaned;
}

function scopesInclude(scopes, scope) {
  const list = Array.isArray(scopes) ? scopes : [];
  if (list.includes(RESTRICTION_SCOPES.ALL_MARKETPLACE)) return true;
  return list.includes(scope);
}

function mapRestriction(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    restrictionType: row.restriction_type,
    status: row.status,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    internalReason: row.internal_reason,
    internalNote: row.internal_note || null,
    createdByAdminId: row.created_by_admin_id != null ? String(row.created_by_admin_id) : null,
    createdByName: row.created_by_name || null,
    createdAt: row.created_at || null,
    startsAt: row.starts_at || null,
    expiresAt: row.expires_at || null,
    revokedAt: row.revoked_at || null,
    revokedByAdminId: row.revoked_by_admin_id != null ? String(row.revoked_by_admin_id) : null,
    revokeReason: row.revoke_reason || null,
    metadata: row.metadata || null,
    userEmail: row.user_email || null,
    userName: row.user_name || null,
    planTitle: row.plan_title || null,
    accountActive: row.account_active != null ? Boolean(row.account_active) : null,
  };
}

async function writeAudit(
  {
    restrictionId = null,
    actorAdminId = null,
    targetUserId,
    action,
    relatedEntityType = null,
    relatedEntityId = null,
    reason = null,
    metadata = null,
  },
  client = pool,
) {
  if (!(await schemaReady(client))) return null;
  const { rows } = await client.query(
    `INSERT INTO freelancer_account_restriction_audit_logs (
       restriction_id, actor_admin_id, target_user_id, action,
       related_entity_type, related_entity_id, reason, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     RETURNING id`,
    [
      restrictionId != null ? Number(restrictionId) : null,
      actorAdminId != null ? Number(actorAdminId) : null,
      Number(targetUserId),
      String(action),
      relatedEntityType,
      relatedEntityId != null ? Number(relatedEntityId) : null,
      reason,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0] || null;
}

async function expireDueRestrictions(client = pool, now = new Date()) {
  if (!(await schemaReady(client))) return 0;
  const { rows } = await client.query(
    `UPDATE freelancer_account_restrictions
        SET status = $2
      WHERE status = $1
        AND expires_at IS NOT NULL
        AND expires_at <= $3
      RETURNING id, user_id`,
    [RESTRICTION_STATUSES.ACTIVE, RESTRICTION_STATUSES.EXPIRED, now.toISOString()],
  );
  for (const row of rows) {
    await writeAudit(
      {
        restrictionId: row.id,
        targetUserId: row.user_id,
        action: AUDIT_ACTIONS.ACCOUNT_RESTRICTION_UPDATED,
        reason: "auto_expired",
        metadata: { status: RESTRICTION_STATUSES.EXPIRED },
      },
      client,
    );
  }
  return rows.length;
}

async function getActiveFreelancerRestrictions(userId, client = pool, { now = new Date() } = {}) {
  if (!(await schemaReady(client))) return [];
  await expireDueRestrictions(client, now);
  const { rows } = await client.query(
    `SELECT r.*
       FROM freelancer_account_restrictions r
      WHERE r.user_id = $1
        AND r.status = $2
        AND r.starts_at <= $3
        AND (r.expires_at IS NULL OR r.expires_at > $3)
      ORDER BY r.id DESC`,
    [Number(userId), RESTRICTION_STATUSES.ACTIVE, now.toISOString()],
  );
  return rows.map(mapRestriction);
}

/**
 * Effective restrictions = individual rows UNION inherited active plan policy.
 * Does not create per-user rows for plan policy.
 */
async function getEffectiveFreelancerRestrictions(userId, client = pool, opts = {}) {
  const individual = await getActiveFreelancerRestrictions(userId, client, opts);
  let plan = [];
  let planContext = null;
  try {
    const planService = require("./marketplacePlanRestrictionsService");
    planContext = await planService.resolveCanonicalMarketplacePlanForFreelancer(userId, client);
    if (planContext?.marketplacePlanId) {
      plan = await planService.getActivePlanRestrictionsForPlanId(
        planContext.marketplacePlanId,
        client,
        opts,
      );
    }
  } catch (err) {
    if (err?.code !== "42P01") {
      // eslint-disable-next-line no-console
      console.error("[restrictions] plan inheritance lookup failed:", err?.message || err);
    }
  }
  const scopeLists = [...individual.map((r) => r.scopes), ...plan.map((r) => r.scopes)];
  const effectiveScopes = (() => {
    const all = [];
    for (const list of scopeLists) {
      for (const s of list || []) all.push(s);
    }
    if (all.includes(RESTRICTION_SCOPES.ALL_MARKETPLACE)) {
      return [RESTRICTION_SCOPES.ALL_MARKETPLACE];
    }
    return [...new Set(all)];
  })();
  return {
    individual,
    plan,
    effectiveScopes,
    planContext,
    hasActiveRestriction: individual.length > 0 || plan.length > 0,
  };
}

function isScopeRestricted(activeRestrictions, scope) {
  return (activeRestrictions || []).some((r) => scopesInclude(r.scopes, scope));
}

/**
 * Returns whether marketplace action must be held for moderation.
 * Does not throw for hold — callers create HELD entities.
 * FULL_SUSPENSION still holds (does not disable login).
 * Includes inherited plan-level restrictions.
 */
async function assertMarketplaceActionAllowedOrHeld(userId, scope, client = pool, opts = {}) {
  const effective = await getEffectiveFreelancerRestrictions(userId, client, opts);
  const individualMatching = effective.individual.filter((r) => scopesInclude(r.scopes, scope));
  const planMatching = effective.plan.filter((r) => scopesInclude(r.scopes, scope));
  if (!individualMatching.length && !planMatching.length) {
    return {
      held: false,
      restrictions: [],
      planRestrictions: [],
      primaryRestriction: null,
      primaryPlanRestriction: null,
      effectiveScopes: [],
      source: null,
    };
  }
  const source =
    individualMatching.length && planMatching.length
      ? "both"
      : individualMatching.length
        ? "individual"
        : "plan";
  return {
    held: true,
    restrictions: individualMatching,
    planRestrictions: planMatching,
    primaryRestriction: individualMatching[0] || null,
    primaryPlanRestriction: planMatching[0] || null,
    effectiveScopes: effective.effectiveScopes,
    source,
    planContext: effective.planContext,
  };
}

/**
 * Hard block for real order assignment paths (claim approval, bid award, etc.).
 * Unlike hold-capable actions, assignment must not proceed while restricted.
 */
async function assertOrderAssignmentAllowed(userId, client = pool, opts = {}) {
  const decision = await assertMarketplaceActionAllowedOrHeld(
    userId,
    RESTRICTION_SCOPES.ORDER_ASSIGNMENTS,
    client,
    opts,
  );
  if (!decision.held) return decision;
  const err = createAppError(
    "Freelancer has an active marketplace assignment restriction.",
    409,
    { exposeToClient: true },
  );
  err.publicCode = "ACCOUNT_ASSIGNMENT_RESTRICTED";
  err.details = { held: true };
  throw err;
}

async function listRestrictions({
  status = null,
  q = null,
  limit = 50,
  offset = 0,
} = {}) {
  if (!(await schemaReady())) return { items: [], total: 0 };
  await expireDueRestrictions();
  const params = [];
  const where = [];
  if (status) {
    params.push(String(status).toUpperCase());
    where.push(`r.status = $${params.length}`);
  }
  if (q && String(q).trim()) {
    const term = `%${String(q).trim()}%`;
    params.push(term);
    const i = params.length;
    where.push(
      `(u.email ILIKE $${i} OR CAST(u.id AS TEXT) ILIKE $${i} OR COALESCE(u.first_name,'') || ' ' || COALESCE(u.family_name,'') ILIKE $${i})`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
  params.push(Math.max(Number(offset) || 0, 0));
  const limIdx = params.length - 1;
  const offIdx = params.length;

  const { rows } = await pool.query(
    `SELECT r.*,
            u.email AS user_email,
            u.is_active AS account_active,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.family_name,''))) AS user_name,
            TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS created_by_name,
            p.title AS plan_title
       FROM freelancer_account_restrictions r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users a ON a.id = r.created_by_admin_id
       LEFT JOIN LATERAL (
         SELECT fs.plan_id
           FROM freelancer_subscriptions fs
          WHERE fs.freelancer_user_id = r.user_id AND fs.is_current = TRUE
          ORDER BY fs.id DESC LIMIT 1
       ) cur ON TRUE
       LEFT JOIN plans p ON p.id = cur.plan_id
       ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );

  const countParams = params.slice(0, -2);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM freelancer_account_restrictions r
       JOIN users u ON u.id = r.user_id
       ${whereSql}`,
    countParams,
  );
  return { items: rows.map(mapRestriction), total: countRows[0]?.c || 0 };
}

async function getRestrictionById(id) {
  if (!(await schemaReady())) return null;
  const { rows } = await pool.query(
    `SELECT r.*,
            u.email AS user_email,
            u.is_active AS account_active,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.family_name,''))) AS user_name,
            TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS created_by_name
       FROM freelancer_account_restrictions r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN users a ON a.id = r.created_by_admin_id
      WHERE r.id = $1`,
    [Number(id)],
  );
  return mapRestriction(rows[0]);
}

async function createRestriction({
  userId,
  restrictionType,
  scopes,
  internalReason,
  internalNote = null,
  startsAt = null,
  expiresAt = null,
  actorAdminId,
  metadata = null,
}) {
  if (!(await schemaReady())) {
    throw createAppError("Account restrictions schema is not applied yet.", 503);
  }
  const type = String(restrictionType || "").trim().toUpperCase();
  if (!VALID_TYPES.has(type)) {
    throw createAppError("Invalid restriction type.", 400, { exposeToClient: true });
  }
  const reason = String(internalReason || "").trim();
  if (reason.length < 3) {
    throw createAppError("Internal reason is required.", 400, { exposeToClient: true });
  }
  const scopeList = normalizeScopes(scopes);
  const start = startsAt ? new Date(startsAt) : new Date();
  const exp = expiresAt ? new Date(expiresAt) : null;
  if (exp && Number.isFinite(exp.getTime()) && exp <= start) {
    throw createAppError("Expiry must be after start.", 400, { exposeToClient: true });
  }

  const { rows: userRows } = await pool.query(`SELECT id, role FROM users WHERE id = $1`, [
    Number(userId),
  ]);
  if (!userRows[0] || String(userRows[0].role) !== "freelancer") {
    throw createAppError("Freelancer user not found.", 404, { exposeToClient: true });
  }

  const { rows } = await pool.query(
    `INSERT INTO freelancer_account_restrictions (
       user_id, restriction_type, status, scopes, internal_reason, internal_note,
       created_by_admin_id, starts_at, expires_at, metadata
     ) VALUES ($1,$2,$3,$4::text[],$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      Number(userId),
      type,
      RESTRICTION_STATUSES.ACTIVE,
      scopeList,
      reason,
      internalNote != null ? String(internalNote).trim() || null : null,
      Number(actorAdminId),
      start.toISOString(),
      exp && Number.isFinite(exp.getTime()) ? exp.toISOString() : null,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  const created = mapRestriction(rows[0]);
  await writeAudit({
    restrictionId: created.id,
    actorAdminId,
    targetUserId: userId,
    action: AUDIT_ACTIONS.ACCOUNT_RESTRICTION_CREATED,
    reason,
    metadata: { scopes: scopeList, restrictionType: type },
  });
  return created;
}

async function updateRestriction(id, patch, actorAdminId) {
  const existing = await getRestrictionById(id);
  if (!existing) throw createAppError("Restriction not found.", 404, { exposeToClient: true });
  if (existing.status !== RESTRICTION_STATUSES.ACTIVE) {
    throw createAppError("Only active restrictions can be updated.", 409, { exposeToClient: true });
  }
  const scopes =
    patch.scopes != null ? normalizeScopes(patch.scopes) : existing.scopes;
  const reason =
    patch.internalReason != null
      ? String(patch.internalReason).trim()
      : existing.internalReason;
  if (reason.length < 3) {
    throw createAppError("Internal reason is required.", 400, { exposeToClient: true });
  }
  const note =
    patch.internalNote !== undefined
      ? String(patch.internalNote || "").trim() || null
      : existing.internalNote;
  const expiresAt =
    patch.expiresAt !== undefined
      ? patch.expiresAt
        ? new Date(patch.expiresAt).toISOString()
        : null
      : existing.expiresAt;

  const { rows } = await pool.query(
    `UPDATE freelancer_account_restrictions
        SET scopes = $2::text[],
            internal_reason = $3,
            internal_note = $4,
            expires_at = $5
      WHERE id = $1
      RETURNING *`,
    [Number(id), scopes, reason, note, expiresAt],
  );
  const updated = mapRestriction(rows[0]);
  await writeAudit({
    restrictionId: id,
    actorAdminId,
    targetUserId: existing.userId,
    action: AUDIT_ACTIONS.ACCOUNT_RESTRICTION_UPDATED,
    reason,
    metadata: { scopes },
  });
  return updated;
}

async function extendRestriction(id, expiresAt, actorAdminId, reason = null) {
  if (!expiresAt) {
    throw createAppError("New expiry is required.", 400, { exposeToClient: true });
  }
  return updateRestriction(
    id,
    { expiresAt, internalReason: reason || undefined },
    actorAdminId,
  ).then(async (row) => {
    await writeAudit({
      restrictionId: id,
      actorAdminId,
      targetUserId: row.userId,
      action: AUDIT_ACTIONS.ACCOUNT_RESTRICTION_EXTENDED,
      reason: reason || row.internalReason,
      metadata: { expiresAt: row.expiresAt },
    });
    return row;
  });
}

async function revokeRestriction(id, { actorAdminId, revokeReason = null } = {}) {
  const existing = await getRestrictionById(id);
  if (!existing) throw createAppError("Restriction not found.", 404, { exposeToClient: true });
  if (existing.status !== RESTRICTION_STATUSES.ACTIVE) {
    throw createAppError("Restriction is not active.", 409, { exposeToClient: true });
  }
  const { rows } = await pool.query(
    `UPDATE freelancer_account_restrictions
        SET status = $2,
            revoked_at = NOW(),
            revoked_by_admin_id = $3,
            revoke_reason = $4
      WHERE id = $1
      RETURNING *`,
    [
      Number(id),
      RESTRICTION_STATUSES.REVOKED,
      Number(actorAdminId),
      revokeReason != null ? String(revokeReason).trim() || null : null,
    ],
  );
  const revoked = mapRestriction(rows[0]);
  await writeAudit({
    restrictionId: id,
    actorAdminId,
    targetUserId: existing.userId,
    action: AUDIT_ACTIONS.ACCOUNT_RESTRICTION_REVOKED,
    reason: revokeReason || existing.internalReason,
  });
  return revoked;
}

async function listAuditForUser(userId, { limit = 50 } = {}) {
  if (!(await schemaReady())) return [];
  const { rows } = await pool.query(
    `SELECT *
       FROM freelancer_account_restriction_audit_logs
      WHERE target_user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [Number(userId), Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    restrictionId: r.restriction_id != null ? String(r.restriction_id) : null,
    actorAdminId: r.actor_admin_id != null ? String(r.actor_admin_id) : null,
    targetUserId: String(r.target_user_id),
    action: r.action,
    relatedEntityType: r.related_entity_type,
    relatedEntityId: r.related_entity_id != null ? String(r.related_entity_id) : null,
    reason: r.reason,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}

async function getUserRestrictionSummary(userId) {
  const effective = await getEffectiveFreelancerRestrictions(userId);
  return {
    hasActiveRestriction: effective.hasActiveRestriction,
    activeRestrictions: effective.individual.map((r) => ({
      id: r.id,
      restrictionType: r.restrictionType,
      scopes: r.scopes,
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      internalReason: r.internalReason,
      internalNote: r.internalNote,
      createdAt: r.createdAt,
      source: "individual",
    })),
    inheritedPlanRestrictions: effective.plan.map((r) => ({
      id: r.id,
      marketplacePlanId: r.marketplacePlanId,
      tierCode: r.tierCode,
      restrictionType: r.restrictionType,
      scopes: r.scopes,
      startsAt: r.startsAt,
      expiresAt: r.expiresAt,
      // Super Admin only — never expose to freelancer/client APIs.
      internalReason: r.internalReason,
      internalNote: r.internalNote,
      createdAt: r.createdAt,
      source: "plan",
      inheritedFromPlanLabel: r.tierCode ? `Inherited from plan: ${r.tierCode}` : null,
      inheritedFromPlanLabelAr: r.tierCode ? `قيد موروث من الباقة: ${r.tierCode}` : null,
    })),
    effectiveScopes: effective.effectiveScopes,
    planContext: effective.planContext,
  };
}

/** SQL fragment: client-visible bids only (published or legacy null). */
function clientVisibleBidModerationSql(alias = "b") {
  return `(${alias}.moderation_status IS NULL OR ${alias}.moderation_status = '${BID_MODERATION_STATUS.PUBLISHED}' OR ${alias}.moderation_status = '${BID_MODERATION_STATUS.RELEASED}')`;
}

async function listHeldBids({ userId = null, limit = 50 } = {}) {
  if (!(await schemaReady())) return [];
  const params = [];
  let where = `WHERE b.moderation_status = 'held'`;
  if (userId) {
    params.push(Number(userId));
    where += ` AND b.freelancer_user_id = $${params.length}`;
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
  const { rows } = await pool.query(
    `SELECT b.id, b.order_id, b.freelancer_user_id, b.amount, b.status, b.moderation_status,
            b.hold_restriction_id, b.bid_reservation_id, b.moderation_held_at, b.created_at,
            o.order_status, o.is_open_for_pool, o.assigned_freelancer_id
       FROM order_freelancer_bids b
       JOIN orders o ON o.id = b.order_id
       ${where}
      ORDER BY b.moderation_held_at DESC NULLS LAST, b.id DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: String(r.id),
    orderId: String(r.order_id),
    freelancerUserId: String(r.freelancer_user_id),
    amount: Number(r.amount),
    status: r.status,
    moderationStatus: r.moderation_status,
    holdRestrictionId: r.hold_restriction_id != null ? String(r.hold_restriction_id) : null,
    bidReservationId: r.bid_reservation_id != null ? String(r.bid_reservation_id) : null,
    heldAt: r.moderation_held_at,
    createdAt: r.created_at,
    orderStatus: r.order_status,
    orderStillOpen:
      Boolean(r.is_open_for_pool) &&
      !r.assigned_freelancer_id &&
      ["open_for_bids", "published", "open_for_freelancers"].includes(String(r.order_status || "")),
  }));
}

async function releaseHeldBid(bidId, { actorAdminId, reason = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT b.*, o.is_open_for_pool, o.assigned_freelancer_id, o.order_status, o.project_type
         FROM order_freelancer_bids b
         JOIN orders o ON o.id = b.order_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [Number(bidId)],
    );
    const bid = rows[0];
    if (!bid) throw createAppError("Held bid not found.", 404, { exposeToClient: true });
    if (String(bid.moderation_status) !== BID_MODERATION_STATUS.HELD) {
      throw createAppError("Bid is not held.", 409, { exposeToClient: true });
    }
    const orderOpen =
      Boolean(bid.is_open_for_pool) &&
      !bid.assigned_freelancer_id &&
      ["open_for_bids", "published", "open_for_freelancers"].includes(String(bid.order_status || ""));
    if (!orderOpen) {
      // Expire without publish + restore reservation
      await client.query(
        `UPDATE order_freelancer_bids
            SET moderation_status = $2,
                moderation_released_at = NOW(),
                updated_at = NOW()
          WHERE id = $1`,
        [bid.id, BID_MODERATION_STATUS.EXPIRED_WITHOUT_PUBLISH],
      );
      if (bid.bid_reservation_id) {
        const reservationService = require("./marketplaceBidCreditReservationService");
        await reservationService.releaseBidCreditReservation({
          client,
          reservationId: Number(bid.bid_reservation_id),
          reason: "held_bid_order_closed",
        });
      }
      await writeAudit(
        {
          restrictionId: bid.hold_restriction_id,
          actorAdminId,
          targetUserId: bid.freelancer_user_id,
          action: AUDIT_ACTIONS.BID_EXPIRED_WITHOUT_PUBLISH,
          relatedEntityType: "order_freelancer_bid",
          relatedEntityId: bid.id,
          reason: reason || "order_no_longer_open",
        },
        client,
      );
      await client.query("COMMIT");
      return { published: false, expiredWithoutPublish: true, bidId: String(bid.id) };
    }

    await client.query(
      `UPDATE order_freelancer_bids
          SET moderation_status = $2,
              moderation_released_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [bid.id, BID_MODERATION_STATUS.RELEASED],
    );

    if (bid.bid_reservation_id) {
      const reservationService = require("./marketplaceBidCreditReservationService");
      await reservationService.consumeBidCreditReservation({
        client,
        reservationId: Number(bid.bid_reservation_id),
        reason: "held_bid_released_to_client",
      });
    }

    await writeAudit(
      {
        restrictionId: bid.hold_restriction_id,
        actorAdminId,
        targetUserId: bid.freelancer_user_id,
        action: AUDIT_ACTIONS.BID_RELEASED,
        relatedEntityType: "order_freelancer_bid",
        relatedEntityId: bid.id,
        reason: reason || null,
      },
      client,
    );
    await client.query("COMMIT");
    return { published: true, expiredWithoutPublish: false, bidId: String(bid.id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function rejectHeldBid(bidId, { actorAdminId, reason = null } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM order_freelancer_bids WHERE id = $1 FOR UPDATE`,
      [Number(bidId)],
    );
    const bid = rows[0];
    if (!bid) throw createAppError("Held bid not found.", 404, { exposeToClient: true });
    if (String(bid.moderation_status) !== BID_MODERATION_STATUS.HELD) {
      throw createAppError("Bid is not held.", 409, { exposeToClient: true });
    }
    await client.query(
      `UPDATE order_freelancer_bids
          SET moderation_status = $2,
              status = 'rejected',
              moderation_released_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [bid.id, BID_MODERATION_STATUS.REJECTED_FROM_REVIEW],
    );
    if (bid.bid_reservation_id) {
      const reservationService = require("./marketplaceBidCreditReservationService");
      await reservationService.releaseBidCreditReservation({
        client,
        reservationId: Number(bid.bid_reservation_id),
        reason: "held_bid_rejected_from_review",
      });
    }
    await writeAudit(
      {
        restrictionId: bid.hold_restriction_id,
        actorAdminId,
        targetUserId: bid.freelancer_user_id,
        action: AUDIT_ACTIONS.BID_REJECTED_FROM_REVIEW,
        relatedEntityType: "order_freelancer_bid",
        relatedEntityId: bid.id,
        reason: reason || null,
      },
      client,
    );
    await client.query("COMMIT");
    return { rejected: true, bidId: String(bid.id) };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  schemaReady,
  clearSchemaCache,
  normalizeScopes,
  scopesInclude,
  mapRestriction,
  writeAudit,
  expireDueRestrictions,
  getActiveFreelancerRestrictions,
  getEffectiveFreelancerRestrictions,
  isScopeRestricted,
  assertMarketplaceActionAllowedOrHeld,
  assertOrderAssignmentAllowed,
  listRestrictions,
  getRestrictionById,
  createRestriction,
  updateRestriction,
  extendRestriction,
  revokeRestriction,
  listAuditForUser,
  getUserRestrictionSummary,
  clientVisibleBidModerationSql,
  listHeldBids,
  releaseHeldBid,
  rejectHeldBid,
  RESTRICTION_TYPES,
  RESTRICTION_STATUSES,
  RESTRICTION_SCOPES,
  BID_MODERATION_STATUS,
  AUDIT_ACTIONS,
  PUBLIC_MESSAGES,
};
