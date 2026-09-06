/**
 * Phase B4 — Priority Application Boost (ACTIVE product path).
 *
 * Binary boost on a real priced-bidding application:
 *   - 1 Bid Credit (normal application; charged by B2 service)
 *   - + 0 extra Bid Credits
 *   - + 0 Work Tokens
 *   - + 1 Priority Use from active Marketplace Membership cycle
 *
 * Does NOT auto-assign the Order. Does NOT rank by Token/Bid stake.
 * Legacy Phase 6 Token auction remains LEGACY_DEPRECATED (separate flag/schema).
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isPriorityApplicationBoostEngineActive,
  isPriorityBiddingEngineActive,
  assertMarketplaceEconomyRealOrdersOnly,
} = require("./marketplaceEconomySettingsService");
const {
  consumePriorityBidUse,
  returnPriorityBidUse,
  getPriorityBidAllowanceForFreelancer,
} = require("./marketplacePriorityBidUsageService");
const {
  PRIORITY_BOOST_ADDITIONAL_BID_COST,
  PRIORITY_BOOST_USE_COST,
  PRIORITY_BOOST_WORK_TOKEN_COST,
  PRIORITY_APPLICATION_BOOST_USAGE_REFERENCE_TYPE,
  PRIORITY_APPLICATION_BOOST_ERROR_CODES,
  buildPriorityApplicationBoostIdempotencyKey,
  sortBidsForPriorityDisplay,
} = require("../constants/marketplacePriorityApplicationBoost");
const {
  priorityApplicationBoostSchemaReady,
  clearPriorityApplicationBoostSchemaCache,
} = require("../utils/marketplacePriorityApplicationBoostSchema");

function mapBoostRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    bidId: String(row.bid_id),
    orderId: String(row.order_id),
    freelancerUserId: String(row.freelancer_user_id),
    membershipId: String(row.membership_id),
    cycleId: String(row.cycle_id),
    usageConsumeId: row.usage_consume_id != null ? String(row.usage_consume_id) : null,
    status: row.status,
    boostSource: row.boost_source,
    priorityUseCost: Number(row.priority_use_cost) || PRIORITY_BOOST_USE_COST,
    additionalBidCreditCost:
      Number(row.additional_bid_credit_cost) || PRIORITY_BOOST_ADDITIONAL_BID_COST,
    workTokenCost: Number(row.work_token_cost) || PRIORITY_BOOST_WORK_TOKEN_COST,
    idempotencyKey: row.idempotency_key,
    boostedAt: row.boosted_at,
    returnedAt: row.returned_at || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertNotFakeOrTraining(orderRow, poolKind) {
  const source = String(orderRow?.source_type || "").toLowerCase();
  if (
    poolKind !== "real" ||
    source === "fake" ||
    source === "training" ||
    orderRow?.is_fake === true
  ) {
    throw createAppError("Priority Boost is not available for fake/training orders.", 403, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_FAKE_FORBIDDEN,
    });
  }
}

function assertPricedBiddingEligible(orderRow) {
  const projectType = String(orderRow?.project_type || "").toLowerCase();
  if (projectType === "fixed" || projectType === "fixed_take" || projectType === "take") {
    throw createAppError("Priority Boost is not available for fixed-take Orders.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_FIXED_TAKE_FORBIDDEN,
    });
  }
  if (projectType !== "bidding") {
    throw createAppError("Priority Boost requires a priced-bidding Order.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
    });
  }
  if (
    orderRow?.bid_budget_min == null ||
    orderRow?.bid_budget_max == null ||
    !(Number(orderRow.bid_budget_min) >= 0) ||
    !(Number(orderRow.bid_budget_max) >= Number(orderRow.bid_budget_min))
  ) {
    throw createAppError("Priority Boost requires a priced-bidding budget range.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
    });
  }
}

function assertNotArticleSurface(orderRow, context = {}) {
  if (
    context.articleId != null ||
    context.isArticle === true ||
    String(orderRow?.source_type || "").toLowerCase() === "marketplace_article" ||
    orderRow?.marketplace_article_id != null
  ) {
    throw createAppError("Priority Boost is not available for Article applications.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_ARTICLE_FORBIDDEN,
    });
  }
}

function assertNotEliteDirectPrivateOffer(orderRow, context = {}) {
  if (
    context.eliteDirectOffer === true ||
    context.isEliteDirect === true ||
    String(orderRow?.assignment_mode || "").toLowerCase() === "elite_direct" ||
    String(orderRow?.visibility_scope || "").toLowerCase() === "elite_direct"
  ) {
    throw createAppError("Priority Boost is not available for Elite Direct Orders.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_ELITE_FORBIDDEN,
    });
  }
}

/** Reject boost once Order/bid is no longer open for Client selection. */
function assertOrderOpenForPriorityBoost(orderRow, bidRow = null) {
  const status = String(orderRow?.order_status || "").toLowerCase();
  if (status !== "open_for_bids") {
    throw createAppError("Priority Boost is only available while the Order is open for bids.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
    });
  }
  if (!orderRow?.is_published || !orderRow?.is_open_for_pool) {
    throw createAppError("Priority Boost is not available: Order is not open in the pool.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
    });
  }
  if (
    orderRow?.assigned_freelancer_id != null ||
    orderRow?.accepted_freelancer_id != null ||
    orderRow?.selected_bid_id != null ||
    orderRow?.received_at != null ||
    orderRow?.is_archived === true
  ) {
    throw createAppError("Priority Boost is not available after Order assignment or terminal state.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
    });
  }
  if (bidRow) {
    const bidStatus = String(bidRow.status || "").toLowerCase();
    if (bidStatus !== "pending") {
      throw createAppError("Priority Boost is only available for a pending application.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_INELIGIBLE,
      });
    }
  }
}

async function requireEngineAndSchema(client) {
  const schemaReady = await priorityApplicationBoostSchemaReady(client || pool);
  if (!schemaReady) {
    throw createAppError("Priority Application Boost schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_SCHEMA_NOT_READY,
    });
  }
  const settings = await getMarketplaceEconomySettings(client);
  if (!isPriorityApplicationBoostEngineActive(settings)) {
    throw createAppError("Priority Application Boost engine is OFF.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_ENGINE_OFF,
    });
  }
  // Mutual exclusion: legacy Token auction must not compete with the new Boost product.
  if (isPriorityBiddingEngineActive(settings)) {
    throw createAppError(
      "Legacy Priority auction engine is ON. Priority Application Boost cannot run concurrently.",
      409,
      {
        exposeToClient: true,
        publicCode: "PRIORITY_APPLICATION_BOOST_LEGACY_AUCTION_CONFLICT",
      },
    );
  }
  return settings;
}

async function findBoostByOrderFreelancer(client, orderId, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT * FROM order_freelancer_priority_application_boosts
      WHERE order_id = $1 AND freelancer_user_id = $2
      LIMIT 1
      FOR UPDATE`,
    [Number(orderId), Number(freelancerUserId)],
  );
  return rows[0] || null;
}

/**
 * Read-only quote for Freelancer UX (optional Priority Boost).
 */
async function quotePriorityApplicationBoost({
  order,
  freelancerUserId = null,
  poolKind = "real",
} = {}) {
  const settings = await getMarketplaceEconomySettings();
  const engineAvailable = isPriorityApplicationBoostEngineActive(settings);
  const schemaReady = await priorityApplicationBoostSchemaReady();

  const base = {
    applicable: true,
    engineAvailable,
    schemaReady,
    priorityUseCost: PRIORITY_BOOST_USE_COST,
    additionalBidCreditCost: PRIORITY_BOOST_ADDITIONAL_BID_COST,
    workTokenCost: PRIORITY_BOOST_WORK_TOKEN_COST,
    remainingPriorityUses: null,
    canBoost: false,
    alreadyBoosted: false,
    reason: null,
  };

  if (!engineAvailable || !schemaReady) {
    return {
      ...base,
      reason: !schemaReady ? "schema_not_ready" : "engine_off",
    };
  }

  try {
    assertNotFakeOrTraining(order, poolKind);
    assertPricedBiddingEligible(order);
    assertNotArticleSurface(order);
    assertNotEliteDirectPrivateOffer(order);
    assertMarketplaceEconomyRealOrdersOnly({
      orderSource: order?.source_type,
      kind: poolKind,
    });
  } catch (err) {
    return {
      ...base,
      reason: err.publicCode || "ineligible",
      canBoost: false,
    };
  }

  if (freelancerUserId == null) {
    return { ...base, reason: "freelancer_required" };
  }

  const client = await pool.connect();
  try {
    const existing = await client.query(
      `SELECT id, status FROM order_freelancer_priority_application_boosts
        WHERE order_id = $1 AND freelancer_user_id = $2
        LIMIT 1`,
      [Number(order?.id), Number(freelancerUserId)],
    );
    if (existing.rows[0]?.status === "active" || existing.rows[0]?.status === "returned") {
      return {
        ...base,
        alreadyBoosted: true,
        canBoost: false,
        reason: "already_boosted",
        remainingPriorityUses: null,
      };
    }

    const allowance = await getPriorityBidAllowanceForFreelancer(freelancerUserId, { client });
    const remaining = Number(allowance.remaining) || 0;
    const canBoost = Boolean(allowance.hasActiveCycle) && remaining >= PRIORITY_BOOST_USE_COST;
    return {
      ...base,
      remainingPriorityUses: remaining,
      canBoost,
      reason: canBoost
        ? null
        : !allowance.hasActiveCycle
          ? "no_active_membership_cycle"
          : "priority_uses_exhausted",
    };
  } finally {
    client.release();
  }
}

/**
 * Apply Priority Boost inside an existing txn (first submit or upgrade).
 * Consumes exactly 1 Priority Use. Idempotent per Order+Freelancer.
 */
async function applyPriorityApplicationBoost({
  client,
  freelancerUserId,
  orderId,
  bidId,
  orderRow,
  poolKind = "real",
  boostSource = "submit",
  actorUserId = null,
  context = {},
} = {}) {
  if (!client) {
    throw createAppError("applyPriorityApplicationBoost requires an open DB client.", 500);
  }
  if (!Number.isInteger(Number(bidId)) || Number(bidId) < 1) {
    throw createAppError("Existing application (bid) is required for Priority Boost.", 400, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_BID_REQUIRED,
    });
  }

  await requireEngineAndSchema(client);
  assertNotFakeOrTraining(orderRow, poolKind);
  assertPricedBiddingEligible(orderRow);
  assertNotArticleSurface(orderRow, context);
  assertNotEliteDirectPrivateOffer(orderRow, context);
  assertMarketplaceEconomyRealOrdersOnly({
    orderSource: orderRow?.source_type,
    kind: poolKind,
    isFake: orderRow?.is_fake,
  });

  let bidRowForGate = null;
  if (Number.isInteger(Number(bidId)) && Number(bidId) >= 1) {
    const { rows: bidGateRows } = await client.query(
      `SELECT id, status FROM order_freelancer_bids WHERE id = $1 LIMIT 1`,
      [Number(bidId)],
    );
    bidRowForGate = bidGateRows[0] || null;
  }
  assertOrderOpenForPriorityBoost(orderRow, bidRowForGate);

  const existing = await findBoostByOrderFreelancer(client, orderId, freelancerUserId);
  if (existing) {
    return {
      ok: true,
      idempotent: true,
      boosted: existing.status === "active" || existing.status === "returned",
      boost: mapBoostRow(existing),
      priorityUseCost: 0,
      additionalBidCreditCost: 0,
      workTokenCost: 0,
    };
  }

  const allowance = await getPriorityBidAllowanceForFreelancer(freelancerUserId, { client });
  if (!allowance.hasActiveCycle) {
    throw createAppError("No usable Marketplace Membership cycle for Priority Boost.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_NO_MEMBERSHIP,
    });
  }
  if ((Number(allowance.remaining) || 0) < PRIORITY_BOOST_USE_COST) {
    throw createAppError("No Priority Uses remaining in this cycle.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_USES_EXHAUSTED,
    });
  }

  const idempotencyKey = buildPriorityApplicationBoostIdempotencyKey(orderId, freelancerUserId);
  const source = boostSource === "upgrade" ? "upgrade" : "submit";

  let boostRow;
  try {
    const inserted = await client.query(
      `INSERT INTO order_freelancer_priority_application_boosts (
         bid_id, order_id, freelancer_user_id,
         membership_id, cycle_id,
         status, boost_source,
         priority_use_cost, additional_bid_credit_cost, work_token_cost,
         idempotency_key, actor_user_id
       ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        Number(bidId),
        Number(orderId),
        Number(freelancerUserId),
        Number(allowance.membershipId),
        Number(allowance.cycleId),
        source,
        PRIORITY_BOOST_USE_COST,
        PRIORITY_BOOST_ADDITIONAL_BID_COST,
        PRIORITY_BOOST_WORK_TOKEN_COST,
        idempotencyKey,
        actorUserId != null ? Number(actorUserId) : null,
      ],
    );
    boostRow = inserted.rows[0];
  } catch (err) {
    if (err && (err.code === "23505" || String(err.message || "").includes("unique"))) {
      const again = await findBoostByOrderFreelancer(client, orderId, freelancerUserId);
      if (again) {
        return {
          ok: true,
          idempotent: true,
          boosted: true,
          boost: mapBoostRow(again),
          priorityUseCost: 0,
          additionalBidCreditCost: 0,
          workTokenCost: 0,
        };
      }
    }
    throw err;
  }

  const consumed = await consumePriorityBidUse({
    client,
    freelancerUserId: Number(freelancerUserId),
    referenceType: PRIORITY_APPLICATION_BOOST_USAGE_REFERENCE_TYPE,
    referenceId: String(boostRow.id),
    reason: source === "upgrade" ? "priority_application_boost_upgrade" : "priority_application_boost_submit",
    actorUserId,
  });

  const { rows: updated } = await client.query(
    `UPDATE order_freelancer_priority_application_boosts
        SET usage_consume_id = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [boostRow.id, consumed.usage?.id != null ? Number(consumed.usage.id) : null],
  );

  return {
    ok: true,
    idempotent: Boolean(consumed.idempotent),
    boosted: true,
    boost: mapBoostRow(updated[0] || boostRow),
    priorityUseCost: consumed.idempotent ? 0 : PRIORITY_BOOST_USE_COST,
    additionalBidCreditCost: PRIORITY_BOOST_ADDITIONAL_BID_COST,
    workTokenCost: PRIORITY_BOOST_WORK_TOKEN_COST,
    remainingPriorityUses: consumed.remaining,
  };
}

/**
 * Upgrade an existing normal application to Priority (no extra Bid Credit).
 */
async function upgradeExistingApplicationToPriority({
  freelancerUserId,
  orderId,
  actorUserId = null,
  client: externalClient = null,
} = {}) {
  const own = !externalClient;
  const client = externalClient || (await pool.connect());
  try {
    if (own) await client.query("BEGIN");

    const { rows: orderRows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [
      Number(orderId),
    ]);
    const orderRow = orderRows[0];
    if (!orderRow) {
      throw createAppError("Order not found.", 404, { exposeToClient: true });
    }

    const { rows: bidRows } = await client.query(
      `SELECT * FROM order_freelancer_bids
        WHERE order_id = $1 AND freelancer_user_id = $2
        LIMIT 1
        FOR UPDATE`,
      [Number(orderId), Number(freelancerUserId)],
    );
    const bid = bidRows[0];
    if (!bid) {
      throw createAppError("Submit a normal application before upgrading to Priority.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_APPLICATION_BOOST_ERROR_CODES.PRIORITY_APPLICATION_BOOST_BID_REQUIRED,
      });
    }

    const result = await applyPriorityApplicationBoost({
      client,
      freelancerUserId,
      orderId,
      bidId: bid.id,
      orderRow,
      poolKind: "real",
      boostSource: "upgrade",
      actorUserId: actorUserId || freelancerUserId,
    });

    if (own) await client.query("COMMIT");
    return result;
  } catch (err) {
    if (own) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw err;
  } finally {
    if (own) client.release();
  }
}

/**
 * Return Priority Uses for all active boosts on an Order that ended with no Freelancer selected.
 * Idempotent per boost. Does not touch Bid Credit refund logic.
 */
async function returnPriorityBoostsForOrderEndedWithoutSelection({
  client,
  orderId,
  actorUserId = null,
  reason = "order_ended_without_selection",
} = {}) {
  if (!client) {
    throw createAppError("returnPriorityBoostsForOrderEndedWithoutSelection requires a client.", 500);
  }
  if (!(await priorityApplicationBoostSchemaReady(client))) {
    return { returned: 0, results: [], skipped: true, reason: "schema_not_ready" };
  }

  const { rows } = await client.query(
    `SELECT * FROM order_freelancer_priority_application_boosts
      WHERE order_id = $1 AND status = 'active'
      ORDER BY id ASC
      FOR UPDATE`,
    [Number(orderId)],
  );

  const results = [];
  for (const row of rows) {
    const returned = await returnPriorityBidUse({
      client,
      cycleId: row.cycle_id,
      referenceType: PRIORITY_APPLICATION_BOOST_USAGE_REFERENCE_TYPE,
      referenceId: String(row.id),
      reason,
      actorUserId,
    });

    const { rows: updated } = await client.query(
      `UPDATE order_freelancer_priority_application_boosts
          SET status = 'returned',
              returned_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING *`,
      [row.id],
    );

    results.push({
      boostId: String(row.id),
      freelancerUserId: String(row.freelancer_user_id),
      idempotent: Boolean(returned.idempotent),
      boost: mapBoostRow(updated[0] || { ...row, status: "returned" }),
    });
  }

  return { returned: results.length, results, skipped: false };
}

module.exports = {
  mapBoostRow,
  quotePriorityApplicationBoost,
  applyPriorityApplicationBoost,
  upgradeExistingApplicationToPriority,
  returnPriorityBoostsForOrderEndedWithoutSelection,
  sortBidsForPriorityDisplay,
  clearPriorityApplicationBoostSchemaCache,
  PRIORITY_BOOST_ADDITIONAL_BID_COST,
  PRIORITY_BOOST_USE_COST,
  PRIORITY_BOOST_WORK_TOKEN_COST,
  buildPriorityApplicationBoostIdempotencyKey,
};
