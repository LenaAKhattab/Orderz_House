/**
 * Plan-level marketplace restriction policy.
 * Inherited dynamically by freelancers whose CURRENT CANONICAL marketplace plan matches.
 * Never inserts per-subscriber freelancer_account_restrictions rows.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  RESTRICTION_TYPES,
  RESTRICTION_STATUSES,
  RESTRICTION_SCOPES,
  AUDIT_ACTIONS,
  PLAN_RESTRICTION_TIER_CODES,
} = require("../constants/freelancerAccountRestrictions");

const VALID_TYPES = new Set(Object.values(RESTRICTION_TYPES));
const VALID_SCOPES = new Set(Object.values(RESTRICTION_SCOPES));

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

let schemaReadyCache = null;

async function schemaReady(db = pool) {
  if (schemaReadyCache === true) return true;
  try {
    const { rows } = await db.query(
      `SELECT to_regclass('public.marketplace_plan_restrictions') AS t`,
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

function mapPlanRestriction(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    marketplacePlanId: String(row.marketplace_plan_id),
    tierCode: row.tier_code ? String(row.tier_code).toUpperCase() : null,
    planNameAr: row.plan_name_ar || null,
    planNameEn: row.plan_name_en || null,
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
    source: "plan",
    currentSubscriberCount:
      row.current_subscriber_count != null ? Number(row.current_subscriber_count) : null,
  };
}

async function writePlanAudit(
  {
    planRestrictionId = null,
    marketplacePlanId = null,
    actorAdminId = null,
    action,
    reason = null,
    metadata = null,
  },
  client = pool,
) {
  if (!(await schemaReady(client))) return null;
  const { rows } = await client.query(
    `INSERT INTO marketplace_plan_restriction_audit_logs (
       plan_restriction_id, marketplace_plan_id, actor_admin_id, action, reason, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     RETURNING id`,
    [
      planRestrictionId != null ? Number(planRestrictionId) : null,
      marketplacePlanId != null ? Number(marketplacePlanId) : null,
      actorAdminId != null ? Number(actorAdminId) : null,
      String(action),
      reason,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
  return rows[0] || null;
}

async function expireDuePlanRestrictions(client = pool, now = new Date()) {
  if (!(await schemaReady(client))) return 0;
  const { rows } = await client.query(
    `UPDATE marketplace_plan_restrictions
        SET status = $2
      WHERE status = $1
        AND expires_at IS NOT NULL
        AND expires_at <= $3
      RETURNING id, marketplace_plan_id`,
    [RESTRICTION_STATUSES.ACTIVE, RESTRICTION_STATUSES.EXPIRED, now.toISOString()],
  );
  for (const row of rows) {
    await writePlanAudit(
      {
        planRestrictionId: row.id,
        marketplacePlanId: row.marketplace_plan_id,
        action: AUDIT_ACTIONS.PLAN_RESTRICTION_EXPIRED,
        reason: "auto_expired",
        metadata: { status: RESTRICTION_STATUSES.EXPIRED },
      },
      client,
    );
  }
  return rows.length;
}

/**
 * SQL: resolve each freelancer's canonical marketplace tier.
 * Canonical subscription (company_approved + assigned_not_started|active) wins over
 * stale freelancer_marketplace_memberships.is_current rows.
 */
function canonicalTierCteSql() {
  return `
    canonical_sub AS (
      SELECT fs.freelancer_user_id,
             CASE
               WHEN lower(p.name) ~ '^marketplace_membership_(starter|silver|pro|elite)$'
                 THEN upper(substring(lower(p.name) from 'marketplace_membership_(.*)'))
               WHEN upper(btrim(COALESCE(p.title, ''))) IN ('STARTER','SILVER','PRO','ELITE')
                 THEN upper(btrim(p.title))
               ELSE NULL
             END AS tier_code
        FROM freelancer_subscriptions fs
        JOIN plans p ON p.id = fs.plan_id
       WHERE fs.is_current = TRUE
         AND lower(COALESCE(fs.status, '')) IN ('assigned_not_started', 'active')
         AND lower(COALESCE(fs.activation_status, '')) = 'company_approved'
    ),
    membership_tier AS (
      SELECT m.freelancer_user_id,
             upper(btrim(p.tier_code)) AS tier_code
        FROM freelancer_marketplace_memberships m
        JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
       WHERE m.is_current = TRUE
         AND lower(btrim(p.tier_code)) = ANY($tier_codes$::text[])
    ),
    resolved AS (
      SELECT COALESCE(c.freelancer_user_id, m.freelancer_user_id) AS freelancer_user_id,
             COALESCE(c.tier_code, m.tier_code) AS tier_code
        FROM canonical_sub c
        FULL OUTER JOIN membership_tier m ON m.freelancer_user_id = c.freelancer_user_id
       WHERE COALESCE(c.tier_code, m.tier_code) IS NOT NULL
    )
  `.replace(/\$tier_codes\$/g, `ARRAY[${PLAN_RESTRICTION_TIER_CODES.map((t) => `'${t}'`).join(",")}]`);
}

async function countCurrentSubscribersForTier(tierCode, client = pool) {
  const tier = String(tierCode || "").trim().toUpperCase();
  if (!PLAN_RESTRICTION_TIER_CODES.includes(tier.toLowerCase())) return 0;
  const { rows } = await client.query(
    `WITH ${canonicalTierCteSql()}
     SELECT COUNT(*)::int AS c
       FROM resolved r
       JOIN users u ON u.id = r.freelancer_user_id
      WHERE r.tier_code = $1
        AND u.role = 'freelancer'`,
    [tier],
  );
  return Number(rows[0]?.c || 0);
}

async function countCurrentSubscribersForPlanId(marketplacePlanId, client = pool) {
  const { rows } = await client.query(
    `SELECT upper(tier_code) AS tier_code FROM marketplace_membership_plans WHERE id = $1`,
    [Number(marketplacePlanId)],
  );
  if (!rows[0]?.tier_code) return 0;
  return countCurrentSubscribersForTier(rows[0].tier_code, client);
}

/**
 * Resolve the freelancer's current canonical marketplace plan id + tier.
 */
async function resolveCanonicalMarketplacePlanForFreelancer(freelancerUserId, client = pool) {
  const uid = Number(freelancerUserId);
  if (!Number.isInteger(uid) || uid < 1) return null;

  // 1) Canonical subscription bridge
  try {
    const { resolveCanonicalMarketplaceDisplay } = require("./canonicalCurrentMembershipDisplay");
    const subscriptionsService = require("./subscriptionsService");
    const subscription = await subscriptionsService.getCurrentSubscriptionForFreelancer(uid);
    const display = resolveCanonicalMarketplaceDisplay(subscription);
    if (display?.tierCode) {
      const { rows } = await client.query(
        `SELECT id, tier_code, name_ar, name_en
           FROM marketplace_membership_plans
          WHERE lower(tier_code) = lower($1)
          ORDER BY is_active DESC NULLS LAST, id ASC
          LIMIT 1`,
        [display.tierCode],
      );
      if (rows[0]) {
        return {
          marketplacePlanId: Number(rows[0].id),
          tierCode: String(rows[0].tier_code).toUpperCase(),
          planNameAr: rows[0].name_ar || null,
          planNameEn: rows[0].name_en || null,
          source: "canonical_subscription",
        };
      }
    }
  } catch (err) {
    if (err?.code !== "42P01") {
      // eslint-disable-next-line no-console
      console.error("[plan-restrictions] canonical plan resolve failed:", err?.message || err);
    }
  }

  // 2) Fallback: current marketplace membership row
  try {
    const { rows } = await client.query(
      `SELECT p.id, p.tier_code, p.name_ar, p.name_en
         FROM freelancer_marketplace_memberships m
         JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
        WHERE m.freelancer_user_id = $1
          AND m.is_current = TRUE
        LIMIT 1`,
      [uid],
    );
    if (rows[0] && PLAN_RESTRICTION_TIER_CODES.includes(String(rows[0].tier_code || "").toLowerCase())) {
      return {
        marketplacePlanId: Number(rows[0].id),
        tierCode: String(rows[0].tier_code).toUpperCase(),
        planNameAr: rows[0].name_ar || null,
        planNameEn: rows[0].name_en || null,
        source: "marketplace_membership",
      };
    }
  } catch (err) {
    if (err?.code !== "42P01") throw err;
  }
  return null;
}

async function getActivePlanRestrictionsForPlanId(marketplacePlanId, client = pool, { now = new Date() } = {}) {
  if (!(await schemaReady(client))) return [];
  if (!marketplacePlanId) return [];
  await expireDuePlanRestrictions(client, now);
  const { rows } = await client.query(
    `SELECT r.*, p.tier_code, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en
       FROM marketplace_plan_restrictions r
       JOIN marketplace_membership_plans p ON p.id = r.marketplace_plan_id
      WHERE r.marketplace_plan_id = $1
        AND r.status = $2
        AND r.starts_at <= $3
        AND (r.expires_at IS NULL OR r.expires_at > $3)
      ORDER BY r.id DESC`,
    [Number(marketplacePlanId), RESTRICTION_STATUSES.ACTIVE, now.toISOString()],
  );
  return rows.map(mapPlanRestriction);
}

async function getActivePlanRestrictionsForFreelancer(freelancerUserId, client = pool, opts = {}) {
  const plan = await resolveCanonicalMarketplacePlanForFreelancer(freelancerUserId, client);
  if (!plan) return [];
  return getActivePlanRestrictionsForPlanId(plan.marketplacePlanId, client, opts);
}

async function listCanonicalPlansWithRestrictionState() {
  if (!(await schemaReady())) {
    // Still list plans if membership plans exist
  }
  await expireDuePlanRestrictions();
  const { rows: plans } = await pool.query(
    `SELECT id, tier_code, name_ar, name_en, is_active
       FROM marketplace_membership_plans
      WHERE lower(tier_code) = ANY($1::text[])
      ORDER BY
        CASE lower(tier_code)
          WHEN 'starter' THEN 1
          WHEN 'silver' THEN 2
          WHEN 'pro' THEN 3
          WHEN 'elite' THEN 4
          ELSE 99
        END,
        id ASC`,
    [PLAN_RESTRICTION_TIER_CODES],
  );

  const items = [];
  for (const p of plans) {
    const tier = String(p.tier_code || "").toUpperCase();
    const subscriberCount = await countCurrentSubscribersForTier(tier);
    let active = null;
    let latest = null;
    if (await schemaReady()) {
      const { rows: activeRows } = await pool.query(
        `SELECT r.*,
                TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS created_by_name,
                p.tier_code, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en
           FROM marketplace_plan_restrictions r
           JOIN marketplace_membership_plans p ON p.id = r.marketplace_plan_id
           LEFT JOIN users a ON a.id = r.created_by_admin_id
          WHERE r.marketplace_plan_id = $1 AND r.status = $2
          ORDER BY r.id DESC LIMIT 1`,
        [p.id, RESTRICTION_STATUSES.ACTIVE],
      );
      active = mapPlanRestriction(activeRows[0]);
      if (active) active.currentSubscriberCount = subscriberCount;

      const { rows: latestRows } = await pool.query(
        `SELECT r.*,
                TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS created_by_name,
                p.tier_code, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en
           FROM marketplace_plan_restrictions r
           JOIN marketplace_membership_plans p ON p.id = r.marketplace_plan_id
           LEFT JOIN users a ON a.id = r.created_by_admin_id
          WHERE r.marketplace_plan_id = $1
          ORDER BY r.id DESC LIMIT 1`,
        [p.id],
      );
      latest = mapPlanRestriction(latestRows[0]);
      if (latest) latest.currentSubscriberCount = subscriberCount;
    }

    const displayStatus = active
      ? RESTRICTION_STATUSES.ACTIVE
      : latest?.status === RESTRICTION_STATUSES.EXPIRED
        ? RESTRICTION_STATUSES.EXPIRED
        : latest?.status === RESTRICTION_STATUSES.REVOKED
          ? RESTRICTION_STATUSES.REVOKED
          : "NONE";

    items.push({
      marketplacePlanId: String(p.id),
      tierCode: tier,
      planNameAr: p.name_ar || tier,
      planNameEn: p.name_en || tier,
      isActivePlan: p.is_active !== false,
      currentSubscriberCount: subscriberCount,
      restrictionStatus: displayStatus,
      activeRestriction: active,
      latestRestriction: latest,
      scopes: active?.scopes || null,
      startsAt: active?.startsAt || null,
      expiresAt: active?.expiresAt || null,
      createdByName: active?.createdByName || latest?.createdByName || null,
      createdByAdminId: active?.createdByAdminId || latest?.createdByAdminId || null,
      restrictionId: active?.id || latest?.id || null,
    });
  }
  return { items };
}

async function getPlanRestrictionById(id) {
  if (!(await schemaReady())) return null;
  const { rows } = await pool.query(
    `SELECT r.*,
            p.tier_code, p.name_ar AS plan_name_ar, p.name_en AS plan_name_en,
            TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS created_by_name
       FROM marketplace_plan_restrictions r
       JOIN marketplace_membership_plans p ON p.id = r.marketplace_plan_id
       LEFT JOIN users a ON a.id = r.created_by_admin_id
      WHERE r.id = $1`,
    [Number(id)],
  );
  const mapped = mapPlanRestriction(rows[0]);
  if (!mapped) return null;
  mapped.currentSubscriberCount = await countCurrentSubscribersForPlanId(mapped.marketplacePlanId);
  return mapped;
}

async function listPlanRestrictionAudit(planRestrictionId, { limit = 50 } = {}) {
  if (!(await schemaReady())) return [];
  const { rows } = await pool.query(
    `SELECT l.*,
            TRIM(CONCAT(COALESCE(a.first_name,''), ' ', COALESCE(a.family_name,''))) AS actor_name
       FROM marketplace_plan_restriction_audit_logs l
       LEFT JOIN users a ON a.id = l.actor_admin_id
      WHERE l.plan_restriction_id = $1
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $2`,
    [Number(planRestrictionId), Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    planRestrictionId: r.plan_restriction_id != null ? String(r.plan_restriction_id) : null,
    marketplacePlanId: r.marketplace_plan_id != null ? String(r.marketplace_plan_id) : null,
    actorAdminId: r.actor_admin_id != null ? String(r.actor_admin_id) : null,
    actorName: r.actor_name || null,
    action: r.action,
    reason: r.reason,
    metadata: r.metadata,
    createdAt: r.created_at,
  }));
}

async function getPlanRestrictionImpact(marketplacePlanId) {
  const planId = Number(marketplacePlanId);
  const subscriberCount = await countCurrentSubscribersForPlanId(planId);
  let heldBids = 0;
  let heldClaims = 0;
  let heldArticles = 0;
  if (await schemaReady()) {
    const { rows: b } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM order_freelancer_bids
        WHERE moderation_status = 'held' AND hold_plan_restriction_id IN (
          SELECT id FROM marketplace_plan_restrictions WHERE marketplace_plan_id = $1
        )`,
      [planId],
    );
    heldBids = Number(b[0]?.c || 0);
    const { rows: c } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_moderation_held_claims
        WHERE status = 'held' AND plan_restriction_id IN (
          SELECT id FROM marketplace_plan_restrictions WHERE marketplace_plan_id = $1
        )`,
      [planId],
    );
    heldClaims = Number(c[0]?.c || 0);
    const { rows: a } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_article_applications
        WHERE moderation_status = 'held' AND hold_plan_restriction_id IN (
          SELECT id FROM marketplace_plan_restrictions WHERE marketplace_plan_id = $1
        )`,
      [planId],
    );
    heldArticles = Number(a[0]?.c || 0);
  }
  return {
    currentSubscriberCount: subscriberCount,
    heldBids,
    heldClaims,
    heldArticles,
    heldCompetitionEntries: heldArticles,
  };
}

async function createPlanRestriction({
  marketplacePlanId,
  restrictionType = RESTRICTION_TYPES.ACCOUNT_REVIEW_HOLD,
  scopes,
  internalReason,
  internalNote = null,
  startsAt = null,
  expiresAt = null,
  actorAdminId,
  metadata = null,
}) {
  if (!(await schemaReady())) {
    throw createAppError("Plan restrictions schema is not applied yet.", 503);
  }
  const planId = Number(marketplacePlanId);
  const { rows: planRows } = await pool.query(
    `SELECT id, tier_code FROM marketplace_membership_plans WHERE id = $1`,
    [planId],
  );
  if (!planRows[0] || !PLAN_RESTRICTION_TIER_CODES.includes(String(planRows[0].tier_code || "").toLowerCase())) {
    throw createAppError("Canonical marketplace plan not found.", 404, { exposeToClient: true });
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

  await expireDuePlanRestrictions();
  const existingActive = await getActivePlanRestrictionsForPlanId(planId);
  if (existingActive.length) {
    throw createAppError("An active restriction already exists for this plan.", 409, {
      exposeToClient: true,
      publicCode: "PLAN_RESTRICTION_ALREADY_ACTIVE",
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO marketplace_plan_restrictions (
       marketplace_plan_id, restriction_type, status, scopes, internal_reason, internal_note,
       created_by_admin_id, starts_at, expires_at, metadata
     ) VALUES ($1,$2,$3,$4::text[],$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      planId,
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
  const created = await getPlanRestrictionById(rows[0].id);
  await writePlanAudit({
    planRestrictionId: created.id,
    marketplacePlanId: planId,
    actorAdminId,
    action: AUDIT_ACTIONS.PLAN_RESTRICTION_CREATED,
    reason,
    metadata: {
      scopes: scopeList,
      restrictionType: type,
      tierCode: created.tierCode,
      currentSubscriberCount: created.currentSubscriberCount,
    },
  });
  return created;
}

async function updatePlanRestriction(id, patch, actorAdminId) {
  const existing = await getPlanRestrictionById(id);
  if (!existing) throw createAppError("Plan restriction not found.", 404, { exposeToClient: true });
  if (existing.status !== RESTRICTION_STATUSES.ACTIVE) {
    throw createAppError("Only active plan restrictions can be updated.", 409, { exposeToClient: true });
  }
  const scopes = patch.scopes != null ? normalizeScopes(patch.scopes) : existing.scopes;
  const reason =
    patch.internalReason != null ? String(patch.internalReason).trim() : existing.internalReason;
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

  await pool.query(
    `UPDATE marketplace_plan_restrictions
        SET scopes = $2::text[],
            internal_reason = $3,
            internal_note = $4,
            expires_at = $5
      WHERE id = $1`,
    [Number(id), scopes, reason, note, expiresAt],
  );
  const updated = await getPlanRestrictionById(id);
  await writePlanAudit({
    planRestrictionId: id,
    marketplacePlanId: existing.marketplacePlanId,
    actorAdminId,
    action: AUDIT_ACTIONS.PLAN_RESTRICTION_UPDATED,
    reason,
    metadata: { scopes },
  });
  return updated;
}

async function extendPlanRestriction(id, expiresAt, actorAdminId, reason = null) {
  if (!expiresAt) {
    throw createAppError("New expiry is required.", 400, { exposeToClient: true });
  }
  const updated = await updatePlanRestriction(
    id,
    { expiresAt, internalReason: reason || undefined },
    actorAdminId,
  );
  await writePlanAudit({
    planRestrictionId: id,
    marketplacePlanId: updated.marketplacePlanId,
    actorAdminId,
    action: AUDIT_ACTIONS.PLAN_RESTRICTION_EXTENDED,
    reason: reason || updated.internalReason,
    metadata: { expiresAt: updated.expiresAt },
  });
  return updated;
}

async function revokePlanRestriction(id, { actorAdminId, revokeReason = null } = {}) {
  const existing = await getPlanRestrictionById(id);
  if (!existing) throw createAppError("Plan restriction not found.", 404, { exposeToClient: true });
  if (existing.status !== RESTRICTION_STATUSES.ACTIVE) {
    throw createAppError("Plan restriction is not active.", 409, { exposeToClient: true });
  }
  await pool.query(
    `UPDATE marketplace_plan_restrictions
        SET status = $2,
            revoked_at = NOW(),
            revoked_by_admin_id = $3,
            revoke_reason = $4
      WHERE id = $1`,
    [
      Number(id),
      RESTRICTION_STATUSES.REVOKED,
      Number(actorAdminId),
      revokeReason != null ? String(revokeReason).trim() || null : null,
    ],
  );
  const revoked = await getPlanRestrictionById(id);
  await writePlanAudit({
    planRestrictionId: id,
    marketplacePlanId: existing.marketplacePlanId,
    actorAdminId,
    action: AUDIT_ACTIONS.PLAN_RESTRICTION_REVOKED,
    reason: revokeReason || existing.internalReason,
  });
  return revoked;
}

function unionScopes(scopeLists) {
  const all = [];
  for (const list of scopeLists) {
    for (const s of list || []) all.push(s);
  }
  if (all.includes(RESTRICTION_SCOPES.ALL_MARKETPLACE)) {
    return [RESTRICTION_SCOPES.ALL_MARKETPLACE];
  }
  return [...new Set(all.filter((s) => Object.values(RESTRICTION_SCOPES).includes(s)))];
}

module.exports = {
  schemaReady,
  clearSchemaCache,
  mapPlanRestriction,
  writePlanAudit,
  expireDuePlanRestrictions,
  countCurrentSubscribersForTier,
  countCurrentSubscribersForPlanId,
  resolveCanonicalMarketplacePlanForFreelancer,
  getActivePlanRestrictionsForPlanId,
  getActivePlanRestrictionsForFreelancer,
  listCanonicalPlansWithRestrictionState,
  getPlanRestrictionById,
  listPlanRestrictionAudit,
  getPlanRestrictionImpact,
  createPlanRestriction,
  updatePlanRestriction,
  extendPlanRestriction,
  revokePlanRestriction,
  unionScopes,
  scopesInclude,
  PLAN_RESTRICTION_TIER_CODES,
};
