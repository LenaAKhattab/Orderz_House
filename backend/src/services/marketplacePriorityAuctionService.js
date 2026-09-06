/**
 * Phase 6 — Priority Bid Auction engine (LEGACY_DEPRECATED).
 *
 * ACTIVE product (Phase B4) is Priority Application Boost:
 *   marketplacePriorityApplicationBoostService + priority_application_boost_enabled
 * This Token auction path remains for rollback/audit until schema cleanup.
 * Do NOT enable priority_bidding_enabled in Production for the new product.
 *
 * REAL economic Orders only. Work Token RESERVE while bidding;
 * losers RELEASE 100%; winner CONSUMES reserved Tokens.
 * Separate from Phase 5 NORMAL_APPLICATION_* economics.
 *
 * Engines must stay OFF in Production until operator enablement:
 *   isPriorityBiddingEngineActive = priorityBiddingEnabled && workTokensEnabled
 *
 * Approved automatic creation trigger (prospective only):
 * when a REAL priced-bidding Order becomes open_for_bids + published + open_for_pool
 * via maybeCreatePriorityAuctionOnPricedBiddingOpen (same txn as visibility).
 * Super Admin manual create shares createPriorityAuctionForOrder.
 * Exactly one auction lifetime per order_id.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isPriorityBiddingEngineActive,
  assertMarketplaceEconomyRealOrdersOnly,
} = require("./marketplaceEconomySettingsService");
const {
  consumePriorityBidUse,
  returnPriorityBidUse,
  getPriorityBidAllowanceForFreelancer,
} = require("./marketplacePriorityBidUsageService");
const walletService = require("./marketplaceWorkTokenWalletService");
const {
  PRIORITY_AUCTION_RESOLUTION_REASONS,
  PRIORITY_AUCTION_REFERENCE_TYPES,
  PRIORITY_AUCTION_CREATION_SOURCES,
  PRIORITY_BID_RESERVE_EVENT,
  PRIORITY_BID_INCREASE_RESERVE_EVENT,
  PRIORITY_BID_RELEASE_EVENT,
  PRIORITY_BID_CONSUME_EVENT,
  PRIORITY_AUCTION_ERROR_CODES,
} = require("../constants/marketplacePriorityAuction");
const {
  DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY,
} = require("../constants/marketplaceEconomy");

function hasPricedBiddingRow(row) {
  if (!row || String(row.project_type) !== "bidding") return false;
  const min = row.bid_budget_min != null ? Number(row.bid_budget_min) : null;
  const max = row.bid_budget_max != null ? Number(row.bid_budget_max) : null;
  return Number.isFinite(min) && Number.isFinite(max) && min > 0 && max >= min;
}

function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  return null;
}

async function withOwnTransaction(fn) {
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

function mapAuction(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    resolvedAt: row.resolved_at || null,
    cancelledAt: row.cancelled_at || null,
    durationMinutes: Number(row.duration_minutes),
    minimumBidTokens: Number(row.minimum_bid_tokens),
    maximumBidTokens: row.maximum_bid_tokens != null ? Number(row.maximum_bid_tokens) : null,
    allowIncrease: Boolean(row.allow_increase),
    allowDecrease: Boolean(row.allow_decrease),
    allowWithdrawal: Boolean(row.allow_withdrawal),
    returnUseOnCancel: Boolean(row.return_use_on_cancel),
    autoAssignmentEnabled: Boolean(row.auto_assignment_enabled),
    assignmentStrategy: row.assignment_strategy,
    creationSource: row.creation_source || null,
    winnerAuctionBidId: row.winner_auction_bid_id != null ? String(row.winner_auction_bid_id) : null,
    winnerFreelancerUserId:
      row.winner_freelancer_user_id != null ? String(row.winner_freelancer_user_id) : null,
    resolutionReason: row.resolution_reason || null,
    resolutionDetail: row.resolution_detail_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBid(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    auctionId: String(row.auction_id),
    orderId: String(row.order_id),
    freelancerUserId: String(row.freelancer_user_id),
    membershipId: row.membership_id != null ? String(row.membership_id) : null,
    cycleId: row.cycle_id != null ? String(row.cycle_id) : null,
    bidTokens: Number(row.bid_tokens),
    reservationId: row.reservation_id != null ? String(row.reservation_id) : null,
    usageConsumeId: row.usage_consume_id != null ? String(row.usage_consume_id) : null,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    wonAt: row.won_at || null,
    lostAt: row.lost_at || null,
    cancelledAt: row.cancelled_at || null,
    skipReason: row.skip_reason || null,
    lastIncreaseAt: row.last_increase_at || null,
  };
}

function assertEngineActive(_settings) {
  // Phase B7B: legacy Token auction permanently unavailable (not just flag-gated).
  throw createAppError("Legacy Priority Auction is deprecated and no longer available.", 410, {
    exposeToClient: true,
    publicCode: "PRIORITY_AUCTION_DEPRECATED",
  });
}

function assertPositiveBidTokens(value, { min, max }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw createAppError("bidTokens must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_PRIORITY_BID_TOKENS",
    });
  }
  if (n < Number(min)) {
    throw createAppError(`Priority Bid must be at least ${min} Tokens.`, 400, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_BELOW_MINIMUM,
    });
  }
  if (max != null && n > Number(max)) {
    throw createAppError(`Priority Bid must be at most ${max} Tokens.`, 400, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_ABOVE_MAXIMUM,
    });
  }
  return n;
}

async function loadOrderForAuction(client, orderId) {
  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [
    Number(orderId),
  ]);
  return rows[0] || null;
}

function assertRealPricedBiddingOrderEligibleForAuction(order) {
  if (!order) {
    throw createAppError("Order not found.", 404, { exposeToClient: true });
  }
  assertMarketplaceEconomyRealOrdersOnly({
    kind: "real",
    orderSource: order.source_type,
    isFake: false,
    isTraining: false,
  });
  if (String(order.project_type) !== "bidding" || !hasPricedBiddingRow(order)) {
    throw createAppError("Priority Auction applies only to REAL priced-bidding Orders.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_PRICED_BIDDING,
    });
  }
  if (order.assigned_freelancer_id || order.accepted_freelancer_id || order.received_at) {
    throw createAppError("Order already has a selected Freelancer.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ORDER_INELIGIBLE,
    });
  }
  if (!order.is_published || !order.is_open_for_pool) {
    throw createAppError("Order is not open for Priority Auction.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ORDER_INELIGIBLE,
    });
  }
  const status = String(order.order_status || "");
  if (status !== "open_for_bids") {
    throw createAppError("Order status is not eligible for Priority Auction.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ORDER_INELIGIBLE,
    });
  }
  if (status === "cancelled" || order.is_archived === true) {
    throw createAppError("Order is terminal and cannot host a Priority Auction.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ORDER_INELIGIBLE,
    });
  }
}

/** @deprecated Use assertRealPricedBiddingOrderEligibleForAuction */
function assertRealOrderEligibleForAuction(order) {
  return assertRealPricedBiddingOrderEligibleForAuction(order);
}

function snapshotAuctionTimingFromSettings(settings) {
  const durationMinutes = Number(settings.priorityBidDurationMinutes);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 10080) {
    throw createAppError("Invalid priorityBidDurationMinutes economy setting.", 500, {
      exposeToClient: false,
      publicCode: "INVALID_PRIORITY_BID_DURATION_SETTING",
    });
  }
  const minimumBidTokens = Number(settings.priorityBidMinimumTokens);
  if (!Number.isInteger(minimumBidTokens) || minimumBidTokens < 1) {
    throw createAppError("Invalid priorityBidMinimumTokens economy setting.", 500, {
      exposeToClient: false,
      publicCode: "INVALID_PRIORITY_BID_MINIMUM_SETTING",
    });
  }
  const maximumBidTokens =
    settings.priorityBidMaximumTokens != null ? Number(settings.priorityBidMaximumTokens) : null;
  return { durationMinutes, minimumBidTokens, maximumBidTokens };
}

async function priorityAuctionTableExists(client) {
  const { rows } = await client.query(`SELECT to_regclass('public.priority_bid_auctions') AS reg`);
  return Boolean(rows[0]?.reg);
}

/**
 * Canonical create (automatic + Super Admin). Idempotent: one auction per order_id.
 * Returns { auction, created, reused }.
 */
async function createPriorityAuctionForOrder({
  orderId,
  actorUserId = null,
  client: externalClient = null,
  creationSource = PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL,
  /** @deprecated Ignored — product creation trigger is approved. Kept for call-site compatibility. */
  forceCreateWithoutProductTriggerDecision = false,
  /** When true (default), reuse existing auction instead of throwing. */
  idempotent = true,
} = {}) {
  void forceCreateWithoutProductTriggerDecision;

  const run = async (client) => {
    if (!(await priorityAuctionTableExists(client))) {
      throw createAppError("Priority Auction storage is not migrated yet.", 503, {
        exposeToClient: true,
        publicCode: "PRIORITY_AUCTION_SCHEMA_MISSING",
      });
    }

    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    const order = await loadOrderForAuction(client, orderId);

    // Phase 8: refuse Priority Auction while an Elite Direct Offer is PENDING
    // (checked before pool/open eligibility — Elite closes the pool by design)
    {
      const eliteSvc = require("./marketplaceEliteDirectOrdersService");
      await eliteSvc.assertNoPendingEliteOfferBlockingAuction(client, orderId);
    }

    assertRealPricedBiddingOrderEligibleForAuction(order);

    const { rows: existingRows } = await client.query(
      `SELECT * FROM priority_bid_auctions WHERE order_id = $1 FOR UPDATE`,
      [Number(orderId)],
    );
    if (existingRows[0]) {
      if (idempotent) {
        return { auction: mapAuction(existingRows[0]), created: false, reused: true };
      }
      throw createAppError("A Priority Auction already exists for this Order.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ALREADY_EXISTS,
      });
    }

    const { durationMinutes, minimumBidTokens, maximumBidTokens } =
      snapshotAuctionTimingFromSettings(settings);

    const { rows: nowRows } = await client.query(`SELECT NOW() AS now`);
    const startsAt = nowRows[0].now;
    const { rows: endRows } = await client.query(
      `SELECT ($1::timestamptz + make_interval(mins => $2::int)) AS ends_at`,
      [startsAt, durationMinutes],
    );
    const endsAt = endRows[0].ends_at;

    const source = String(creationSource || PRIORITY_AUCTION_CREATION_SOURCES.SUPER_ADMIN_MANUAL);

    try {
      const { rows } = await client.query(
        `INSERT INTO priority_bid_auctions (
           order_id, status, starts_at, ends_at,
           duration_minutes, minimum_bid_tokens, maximum_bid_tokens,
           allow_increase, allow_decrease, allow_withdrawal,
           return_use_on_cancel, auto_assignment_enabled, assignment_strategy,
           creation_source, created_by_user_id
         ) VALUES (
           $1, 'active', $2, $3,
           $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12,
           $13, $14
         )
         RETURNING *`,
        [
          Number(orderId),
          startsAt,
          endsAt,
          durationMinutes,
          minimumBidTokens,
          maximumBidTokens,
          Boolean(settings.priorityBidAllowIncrease),
          Boolean(settings.priorityBidAllowDecrease),
          Boolean(settings.priorityBidAllowWithdrawal),
          Boolean(settings.priorityBidReturnUseOnOrderCancel),
          Boolean(settings.priorityBidAutoAssignmentEnabled),
          String(settings.priorityBidAssignmentStrategy || DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY),
          source,
          actorUserId != null ? Number(actorUserId) : null,
        ],
      );
      return { auction: mapAuction(rows[0]), created: true, reused: false };
    } catch (err) {
      // Concurrent create: UNIQUE(order_id) race → reuse winner
      if (err && err.code === "23505") {
        const { rows: raced } = await client.query(
          `SELECT * FROM priority_bid_auctions WHERE order_id = $1`,
          [Number(orderId)],
        );
        if (raced[0] && idempotent) {
          return { auction: mapAuction(raced[0]), created: false, reused: true };
        }
        throw createAppError("A Priority Auction already exists for this Order.", 409, {
          exposeToClient: true,
          publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_ALREADY_EXISTS,
        });
      }
      throw err;
    }
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

/**
 * Approved automatic trigger: REAL priced-bidding Order becomes Freelancer-visible
 * (open_for_bids + published + open_for_pool). Safe no-op when engines OFF or ineligible.
 * Must run in the same DB transaction as the visibility transition when possible.
 */
async function maybeCreatePriorityAuctionOnPricedBiddingOpen({
  orderId,
  actorUserId = null,
  client: externalClient = null,
  orderRow = null,
} = {}) {
  // Phase B7B: never create new legacy Token auctions from product order flow.
  void orderId;
  void actorUserId;
  void externalClient;
  void orderRow;
  return { created: false, skipped: true, reason: "PRIORITY_AUCTION_DEPRECATED" };
}

/**
 * Block non-resolver assignment while a Priority Auction is scheduled/active/resolving.
 */
async function assertNoActivePriorityAuctionBlockingAssignment(client, orderId) {
  if (!(await priorityAuctionTableExists(client))) {
    return { blocked: false };
  }
  const { rows } = await client.query(
    `SELECT id, status FROM priority_bid_auctions
     WHERE order_id = $1
       AND status IN ('scheduled', 'active', 'resolving')
     LIMIT 1`,
    [Number(orderId)],
  );
  if (rows[0]) {
    const err = createAppError(
      "A Priority Bid auction is active for this Order. Cancel the auction before assigning another Freelancer.",
      409,
      {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_AUCTION_ACTIVE,
      },
    );
    err.auctionId = String(rows[0].id);
    throw err;
  }
  return { blocked: false };
}

async function cancelOpenPriorityAuctionsForOrder({
  orderId,
  actorUserId = null,
  reason = PRIORITY_AUCTION_RESOLUTION_REASONS.ORDER_CANCELLED_BEFORE_RESOLUTION,
  client: externalClient = null,
} = {}) {
  const run = async (client) => {
    if (!(await priorityAuctionTableExists(client))) {
      return { cancelled: false, skipped: true, reason: "SCHEMA_MISSING" };
    }
    const { rows } = await client.query(
      `SELECT id, status FROM priority_bid_auctions
       WHERE order_id = $1
         AND status IN ('scheduled', 'active')
       LIMIT 1
       FOR UPDATE`,
      [Number(orderId)],
    );
    if (!rows[0]) {
      return { cancelled: false, skipped: true, reason: "NO_OPEN_AUCTION" };
    }
    return cancelPriorityAuction({
      auctionId: rows[0].id,
      actorUserId,
      reason,
      client,
    });
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

async function lockAuction(client, auctionId) {
  const { rows } = await client.query(
    `SELECT * FROM priority_bid_auctions WHERE id = $1 FOR UPDATE`,
    [Number(auctionId)],
  );
  return rows[0] || null;
}

/**
 * Canonical lock order for terminal + bidding paths that also touch the Order:
 *   1) orders (FOR UPDATE)
 *   2) priority_bid_auctions (FOR UPDATE)
 *   3) priority_auction_bids (FOR UPDATE)
 *   4) wallet / reservation / PB usage (via Phase 3–4 helpers)
 *
 * Prevents deadlocks with resolve/cancel/assignment which already lock Order first.
 */
async function lockOrderThenAuction(client, auctionId) {
  const { rows: metaRows } = await client.query(
    `SELECT id, order_id, status, resolution_reason FROM priority_bid_auctions WHERE id = $1`,
    [Number(auctionId)],
  );
  const meta = metaRows[0];
  if (!meta) {
    return { meta: null, auction: null };
  }
  await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [Number(meta.order_id)]);
  const auction = await lockAuction(client, auctionId);
  return { meta, auction };
}

async function assertAuctionOpenForBidding(client, auction) {
  if (!auction) {
    throw createAppError("Priority Auction not found.", 404, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_FOUND,
    });
  }
  if (auction.status !== "active" && auction.status !== "scheduled") {
    throw createAppError("Priority Auction is not open for bidding.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_ACTIVE,
    });
  }
  const { rows } = await client.query(
    `SELECT NOW() >= $1::timestamptz AS closed`,
    [auction.ends_at],
  );
  if (rows[0].closed) {
    throw createAppError("Priority Auction has ended.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_CLOSED,
    });
  }
  if (auction.status === "scheduled") {
    await client.query(
      `UPDATE priority_bid_auctions SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'scheduled'`,
      [auction.id],
    );
    auction.status = "active";
  }
}

async function assertFreelancerActive(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT id, role, is_active FROM users WHERE id = $1 FOR UPDATE`,
    [Number(freelancerUserId)],
  );
  const u = rows[0];
  if (!u || u.role !== "freelancer" || u.is_active !== true) {
    throw createAppError("Freelancer is not eligible.", 409, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER",
    });
  }
  return u;
}

/**
 * Initial Priority Bid: consume one cycle use + reserve Tokens + create bid row.
 */
async function submitPriorityBid({
  auctionId,
  freelancerUserId,
  bidTokens,
  actorUserId = null,
  client: externalClient = null,
  poolKind = "real",
} = {}) {
  if (poolKind !== "real") {
    throw createAppError("Priority Auction is not available for fake/training Orders.", 409, {
      exposeToClient: true,
      publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_FAKE_TRAINING_FORBIDDEN,
    });
  }

  const run = async (client) => {
    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    const { auction } = await lockOrderThenAuction(client, auctionId);
    await assertAuctionOpenForBidding(client, auction);

    const order = await loadOrderForAuction(client, auction.order_id);
    assertRealOrderEligibleForAuction(order);
    await assertFreelancerActive(client, freelancerUserId);

    const tokens = assertPositiveBidTokens(bidTokens, {
      min: auction.minimum_bid_tokens,
      max: auction.maximum_bid_tokens,
    });

    const { rows: existingBid } = await client.query(
      `SELECT * FROM priority_auction_bids
       WHERE auction_id = $1 AND freelancer_user_id = $2
       FOR UPDATE`,
      [Number(auctionId), Number(freelancerUserId)],
    );
    if (existingBid[0]) {
      if (existingBid[0].status === "active") {
        throw createAppError("Priority Bid already exists; use increase instead.", 409, {
          exposeToClient: true,
          publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_ALREADY_EXISTS,
        });
      }
      throw createAppError("Priority Bid already exists for this auction.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_ALREADY_EXISTS,
      });
    }

    const allowance = await getPriorityBidAllowanceForFreelancer(freelancerUserId, { client });
    if (!allowance.hasActiveCycle || allowance.remaining < 1) {
      throw createAppError("No remaining Priority Bid uses in the current cycle.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_INSUFFICIENT_USES,
      });
    }

    const { rows: bidRows } = await client.query(
      `INSERT INTO priority_auction_bids (
         auction_id, order_id, freelancer_user_id,
         membership_id, cycle_id, bid_tokens, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING *`,
      [
        Number(auctionId),
        Number(auction.order_id),
        Number(freelancerUserId),
        allowance.membershipId ? Number(allowance.membershipId) : null,
        allowance.cycleId ? Number(allowance.cycleId) : null,
        tokens,
      ],
    );
    const bid = bidRows[0];

    const usage = await consumePriorityBidUse({
      client,
      freelancerUserId: Number(freelancerUserId),
      referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
      referenceId: String(bid.id),
      actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
      reason: "priority_auction_bid_submit",
    });

    const reserve = await walletService.reserveWorkTokens({
      client,
      freelancerUserId: Number(freelancerUserId),
      amountTokens: tokens,
      eventType: PRIORITY_BID_RESERVE_EVENT,
      referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
      referenceId: String(bid.id),
      idempotencyKey: `pb_reserve:bid:${bid.id}`,
      actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
      reason: "priority_bid_reserve",
      metadata: { auctionId: String(auctionId), orderId: String(auction.order_id) },
    });

    const { rows: updated } = await client.query(
      `UPDATE priority_auction_bids
          SET reservation_id = $2,
              usage_consume_id = $3,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        Number(bid.id),
        reserve.reservation?.id ? Number(reserve.reservation.id) : null,
        usage.usage?.id ? Number(usage.usage.id) : null,
      ],
    );

    return {
      bid: mapBid(updated[0]),
      auction: mapAuction(auction),
      reserve,
      usage,
    };
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

/**
 * Increase only (delta reserve). Decrease forbidden by default policy.
 */
async function increasePriorityBid({
  auctionId,
  freelancerUserId,
  newBidTokens,
  actorUserId = null,
  client: externalClient = null,
} = {}) {
  const run = async (client) => {
    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    const { auction } = await lockOrderThenAuction(client, auctionId);
    await assertAuctionOpenForBidding(client, auction);

    if (!auction.allow_increase) {
      throw createAppError("Priority Bid increases are disabled.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_INCREASE_REQUIRED,
      });
    }

    const { rows: bidRows } = await client.query(
      `SELECT * FROM priority_auction_bids
       WHERE auction_id = $1 AND freelancer_user_id = $2
       FOR UPDATE`,
      [Number(auctionId), Number(freelancerUserId)],
    );
    const bid = bidRows[0];
    if (!bid || bid.status !== "active") {
      throw createAppError("Active Priority Bid not found.", 404, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_NOT_FOUND,
      });
    }

    const desired = assertPositiveBidTokens(newBidTokens, {
      min: auction.minimum_bid_tokens,
      max: auction.maximum_bid_tokens,
    });
    // Re-read locked current amount — concurrent higher increase may have already won.
    const current = Number(bid.bid_tokens);
    if (desired < current) {
      throw createAppError("Priority Bid decrease is not allowed.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_DECREASE_NOT_ALLOWED,
      });
    }
    if (desired === current) {
      return { bid: mapBid(bid), skipped: true, reason: "unchanged" };
    }

    const increase = await walletService.increaseWorkTokenReservation({
      client,
      freelancerUserId: Number(freelancerUserId),
      desiredTotal: desired,
      eventType: PRIORITY_BID_INCREASE_RESERVE_EVENT,
      referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
      referenceId: String(bid.id),
      idempotencyKey: `pb_increase:bid:${bid.id}:to:${desired}`,
      actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
      reason: "priority_bid_increase",
      metadata: { auctionId: String(auctionId), from: current, to: desired },
    });

    const reservedAfter =
      increase.reservation?.reservedTokens != null
        ? Number(increase.reservation.reservedTokens)
        : desired;

    const { rows: updated } = await client.query(
      `UPDATE priority_auction_bids
          SET bid_tokens = $2,
              last_increase_at = NOW(),
              updated_at = NOW(),
              reservation_id = COALESCE($3, reservation_id)
        WHERE id = $1
        RETURNING *`,
      [
        Number(bid.id),
        reservedAfter,
        increase.reservation?.id ? Number(increase.reservation.id) : null,
      ],
    );

    return { bid: mapBid(updated[0]), increase, skipped: Boolean(increase.idempotent) };
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

async function withdrawPriorityBid() {
  throw createAppError("Priority Bid withdrawal is not allowed.", 409, {
    exposeToClient: true,
    publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_BID_WITHDRAWAL_NOT_ALLOWED,
  });
}

/**
 * Deterministic ranking: bid_tokens DESC, submitted_at ASC, id ASC.
 */
function rankPriorityBids(bids) {
  return [...bids].sort((a, b) => {
    const ta = Number(a.bid_tokens);
    const tb = Number(b.bid_tokens);
    if (tb !== ta) return tb - ta;
    const sa = new Date(a.submitted_at).getTime();
    const sb = new Date(b.submitted_at).getTime();
    if (sa !== sb) return sa - sb;
    return Number(a.id) - Number(b.id);
  });
}

async function isBidderEligibleAtResolution(client, bid) {
  const { rows: userRows } = await client.query(
    `SELECT id, role, is_active FROM users WHERE id = $1`,
    [Number(bid.freelancer_user_id)],
  );
  const u = userRows[0];
  if (!u || u.role !== "freelancer" || u.is_active !== true) {
    return { eligible: false, reason: "FREELANCER_INACTIVE" };
  }
  const allowance = await getPriorityBidAllowanceForFreelancer(bid.freelancer_user_id, { client });
  // Use already consumed; require membership still usable
  if (!allowance.hasActiveCycle) {
    return { eligible: false, reason: "MEMBERSHIP_INACTIVE" };
  }
  if (bid.status !== "active") {
    return { eligible: false, reason: "BID_NOT_ACTIVE" };
  }
  return { eligible: true, reason: null };
}

async function releaseBidReservation(client, bid, { actorUserId = null } = {}) {
  if (!bid.reservation_id && !bid.id) return { released: false };
  try {
    const out = await walletService.releaseWorkTokenReservation({
      client,
      freelancerUserId: Number(bid.freelancer_user_id),
      eventType: PRIORITY_BID_RELEASE_EVENT,
      referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
      referenceId: String(bid.id),
      idempotencyKey: `pb_release:bid:${bid.id}`,
      actorUserId: actorUserId != null ? Number(actorUserId) : null,
      reason: "priority_bid_loser_release",
    });
    return { released: true, out };
  } catch (err) {
    if (
      err.publicCode === "WORK_TOKEN_RESERVATION_ALREADY_RELEASED" ||
      err.publicCode === "WORK_TOKEN_RESERVATION_ALREADY_CONSUMED" ||
      err.publicCode === "WORK_TOKEN_RESERVATION_NOT_FOUND"
    ) {
      return { released: false, idempotent: true, err };
    }
    throw err;
  }
}

async function consumeWinnerReservation(client, bid, { actorUserId = null } = {}) {
  const out = await walletService.consumeWorkTokenReservation({
    client,
    freelancerUserId: Number(bid.freelancer_user_id),
    eventType: PRIORITY_BID_CONSUME_EVENT,
    referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
    referenceId: String(bid.id),
    idempotencyKey: `pb_consume:bid:${bid.id}`,
    actorUserId: actorUserId != null ? Number(actorUserId) : null,
    reason: "priority_bid_winner_consume",
  });
  return out;
}

async function applyWinnerToOrder(client, { order, winnerBid, auction }) {
  if (!auction.auto_assignment_enabled) {
    return { assigned: false, reason: "AUTO_ASSIGNMENT_DISABLED" };
  }
  if (order.assigned_freelancer_id) {
    return { assigned: false, reason: "ORDER_ALREADY_ASSIGNED", alreadyAssigned: true };
  }

  // Prefer existing pending money bid for canonical selection invariants
  const { rows: moneyBids } = await client.query(
    `SELECT * FROM order_freelancer_bids
     WHERE order_id = $1 AND freelancer_user_id = $2 AND status = 'pending'
     ORDER BY id ASC
     LIMIT 1
     FOR UPDATE`,
    [Number(order.id), Number(winnerBid.freelancer_user_id)],
  );
  const moneyBid = moneyBids[0] || null;

  if (order.payment_required === true) {
    if (!moneyBid) {
      return { assigned: false, reason: "WINNER_PENDING_MONEY_BID_OR_PAYMENT" };
    }
    await client.query(
      `UPDATE orders
          SET selected_bid_id = $2,
              is_open_for_pool = FALSE,
              order_status = 'awaiting_payment_after_bid_selection',
              updated_at = NOW()
        WHERE id = $1 AND assigned_freelancer_id IS NULL`,
      [Number(order.id), Number(moneyBid.id)],
    );
    await client.query(
      `UPDATE order_freelancer_bids SET status = 'selected_pending_payment', updated_at = NOW() WHERE id = $1`,
      [Number(moneyBid.id)],
    );
    await client.query(
      `UPDATE order_freelancer_bids
          SET status = 'rejected', updated_at = NOW()
        WHERE order_id = $1 AND id <> $2 AND status IN ('pending', 'selected_pending_payment')`,
      [Number(order.id), Number(moneyBid.id)],
    );

    // Soft select: AWARDED only (no EFFECTIVE / no APPLIED_AND_LOST until payment finalizes)
    {
      const fairDist = require("./marketplaceFairDistributionService");
      await fairDist.recordAwarded({
        client,
        order,
        freelancerUserId: winnerBid.freelancer_user_id,
        referenceType: "priority_auction_bid",
        referenceId: winnerBid.id,
        reason: "priority_winner_selected_pending_payment",
        metadata: { pendingPayment: true, auctionId: auction.id },
      });
    }

    return { assigned: true, mode: "selected_pending_payment", moneyBidId: String(moneyBid.id) };
  }

  // Non-payment orders: assign winner directly (preserve money bid link when present)
  const receivedAt = new Date();
  await client.query(
    `UPDATE orders
        SET assigned_freelancer_id = $2,
            selected_bid_id = $3,
            received_at = $4,
            is_open_for_pool = FALSE,
            order_status = 'in_progress',
            updated_at = NOW()
      WHERE id = $1 AND assigned_freelancer_id IS NULL`,
    [
      Number(order.id),
      Number(winnerBid.freelancer_user_id),
      moneyBid ? Number(moneyBid.id) : null,
      receivedAt,
    ],
  );
  let moneyLosers = [];
  if (moneyBid) {
    await client.query(
      `UPDATE order_freelancer_bids SET status = 'accepted', updated_at = NOW() WHERE id = $1`,
      [Number(moneyBid.id)],
    );
    await client.query(
      `UPDATE order_freelancer_bids
          SET status = 'rejected', updated_at = NOW()
        WHERE order_id = $1 AND id <> $2 AND status IN ('pending', 'selected_pending_payment')`,
      [Number(order.id), Number(moneyBid.id)],
    );
    const { rows: rejectedMoney } = await client.query(
      `SELECT freelancer_user_id FROM order_freelancer_bids
       WHERE order_id = $1 AND id <> $2 AND status = 'rejected'`,
      [Number(order.id), Number(moneyBid.id)],
    );
    moneyLosers = rejectedMoney.map((r) => r.freelancer_user_id);
  }

  // Effective assignment + AWARDED; money-bid losers get APPLIED_AND_LOST
  // (Priority auction losers already recorded in resolvePriorityAuction)
  {
    const fairDist = require("./marketplaceFairDistributionService");
    const orderForFair = {
      ...order,
      assigned_freelancer_id: winnerBid.freelancer_user_id,
      received_at: receivedAt,
    };
    await fairDist.recordAwarded({
      client,
      order: orderForFair,
      freelancerUserId: winnerBid.freelancer_user_id,
      referenceType: "priority_auction_bid",
      referenceId: winnerBid.id,
      reason: "priority_winner_assigned",
    });
    await fairDist.recordEffectiveAssignment({
      client,
      order: orderForFair,
      freelancerUserId: winnerBid.freelancer_user_id,
      reason: "priority_winner_assigned",
      occurredAt: receivedAt,
    });
    if (moneyLosers.length) {
      await fairDist.recordAppliedAndLostForOrderLosers({
        client,
        order: orderForFair,
        winnerFreelancerUserId: winnerBid.freelancer_user_id,
        loserFreelancerUserIds: moneyLosers,
        reason: "priority_winner_assigned_money_bid_losers",
      });
    }
  }

  return {
    assigned: true,
    mode: "assigned_in_progress",
    moneyBidId: moneyBid ? String(moneyBid.id) : null,
  };
}

/**
 * Resolve auction due for ending. Idempotent under concurrency.
 * Lock order: order → auction → bids.
 * Terminal ownership: active|scheduled → resolving → resolved.
 * Cancellation must not interrupt resolving.
 */
async function resolvePriorityAuction({
  auctionId,
  actorUserId = null,
  client: externalClient = null,
} = {}) {
  const run = async (client) => {
    const { meta, auction: locked } = await lockOrderThenAuction(client, auctionId);
    if (!meta || !locked) {
      throw createAppError("Priority Auction not found.", 404, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_FOUND,
      });
    }

    let auction = locked;
    if (auction.status === "resolved" || auction.status === "cancelled") {
      return {
        resolved: false,
        idempotent: true,
        auction: mapAuction(auction),
        reason: auction.resolution_reason || PRIORITY_AUCTION_RESOLUTION_REASONS.ALREADY_RESOLVED,
      };
    }

    if (auction.status === "active" || auction.status === "scheduled") {
      const { rows: dueGate } = await client.query(
        `SELECT NOW() >= $1::timestamptz AS due`,
        [auction.ends_at],
      );
      if (!dueGate[0].due) {
        throw createAppError("Priority Auction has not ended yet.", 409, {
          exposeToClient: true,
          publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_ACTIVE,
        });
      }

      const { rows: claimed } = await client.query(
        `UPDATE priority_bid_auctions
            SET status = 'resolving', updated_at = NOW()
          WHERE id = $1
            AND status IN ('active', 'scheduled')
          RETURNING *`,
        [auction.id],
      );
      if (!claimed[0]) {
        const again = await lockAuction(client, auctionId);
        if (!again || again.status === "resolved" || again.status === "cancelled") {
          return {
            resolved: false,
            idempotent: true,
            auction: mapAuction(again),
            reason: again?.resolution_reason || PRIORITY_AUCTION_RESOLUTION_REASONS.ALREADY_RESOLVED,
          };
        }
        auction = again;
      } else {
        auction = claimed[0];
      }
    }

    // status === resolving: this worker owns / recovers resolution
    if (auction.status !== "resolving") {
      throw createAppError("Priority Auction is not resolvable.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_ACTIVE,
      });
    }

    const order = await loadOrderForAuction(client, auction.order_id);
    const { rows: bids } = await client.query(
      `SELECT * FROM priority_auction_bids
       WHERE auction_id = $1
       FOR UPDATE`,
      [Number(auction.id)],
    );

    const fairDist = require("./marketplaceFairDistributionService");
    const { isFairWorkDistributionActive, getMarketplaceEconomySettings } = require("./marketplaceEconomySettingsService");

    const strategy = String(auction.assignment_strategy || DEFAULT_PRIORITY_BID_ASSIGNMENT_STRATEGY);
    fairDist.assertHybridNotOperational(strategy);

    const economySettings = await getMarketplaceEconomySettings(client);
    const useFairFirst =
      strategy === "FAIR_DISTRIBUTION_FIRST" && isFairWorkDistributionActive(economySettings);

    const skipped = [];
    let winner = null;
    let fairDecision = null;
    let resolutionStrategyUsed = "HIGHEST_TOKEN_ONLY";

    if (useFairFirst) {
      resolutionStrategyUsed = "FAIR_DISTRIBUTION_FIRST";
      const eligibleCandidates = [];
      for (const bid of bids.filter((b) => b.status === "active")) {
        // eslint-disable-next-line no-await-in-loop
        const check = await isBidderEligibleAtResolution(client, bid);
        if (!check.eligible) {
          skipped.push({ bidId: String(bid.id), reason: check.reason });
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `UPDATE priority_auction_bids
                SET status = 'skipped_ineligible', skip_reason = $2, lost_at = NOW(), updated_at = NOW()
              WHERE id = $1`,
            [bid.id, check.reason],
          );
          // eslint-disable-next-line no-await-in-loop
          await releaseBidReservation(client, bid, { actorUserId });
          // eslint-disable-next-line no-await-in-loop
          await fairDist.recordIneligibleSkipped({
            client,
            order,
            freelancerUserId: bid.freelancer_user_id,
            referenceId: bid.id,
            reason: check.reason,
            actorUserId,
          });
          continue;
        }
        eligibleCandidates.push({
          freelancerUserId: bid.freelancer_user_id,
          candidateKey: `priority_bid:${bid.id}`,
          stableId: String(bid.id),
          eligible: true,
          priorityBidTokens: Number(bid.bid_tokens),
          submittedAt: bid.submitted_at,
          applicationOrBidId: bid.id,
        });
      }

      fairDecision = await fairDist.decideFairDistributionFirst({
        client,
        order,
        candidates: eligibleCandidates,
        lookbackDays: economySettings.fairDistributionLookbackDays,
        includePriorityTokens: true,
        priorityAuctionId: auction.id,
        persistDecision: true,
        selectionSource: "priority_auction_fair_distribution_first",
      });

      if (fairDecision.winner) {
        winner =
          bids.find(
            (b) => Number(b.id) === Number(fairDecision.winner.applicationOrBidId),
          ) || null;
      }
    } else {
      // Phase 6 default: highest eligible Token bid
      const ranked = rankPriorityBids(bids.filter((b) => b.status === "active"));
      for (const candidate of ranked) {
        // eslint-disable-next-line no-await-in-loop
        const check = await isBidderEligibleAtResolution(client, candidate);
        if (!check.eligible) {
          skipped.push({ bidId: String(candidate.id), reason: check.reason });
          // eslint-disable-next-line no-await-in-loop
          await client.query(
            `UPDATE priority_auction_bids
                SET status = 'skipped_ineligible', skip_reason = $2, lost_at = NOW(), updated_at = NOW()
              WHERE id = $1`,
            [candidate.id, check.reason],
          );
          // eslint-disable-next-line no-await-in-loop
          await releaseBidReservation(client, candidate, { actorUserId });
          // eslint-disable-next-line no-await-in-loop
          await fairDist.recordIneligibleSkipped({
            client,
            order,
            freelancerUserId: candidate.freelancer_user_id,
            referenceId: candidate.id,
            reason: check.reason,
            actorUserId,
          });
          continue;
        }
        winner = candidate;
        break;
      }
    }

    const losers = [];
    for (const bid of bids) {
      if (winner && Number(bid.id) === Number(winner.id)) continue;
      if (bid.status === "active") losers.push(bid);
    }

    let assignment = null;
    let resolutionReason = PRIORITY_AUCTION_RESOLUTION_REASONS.NO_ELIGIBLE_WINNER;

    if (winner) {
      resolutionReason = PRIORITY_AUCTION_RESOLUTION_REASONS.HIGHEST_TOKEN_WON;
      if (useFairFirst) {
        resolutionReason = "FAIR_DISTRIBUTION_FIRST_WON";
      }
      await consumeWinnerReservation(client, winner, { actorUserId });
      await client.query(
        `UPDATE priority_auction_bids
            SET status = 'won', won_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [winner.id],
      );
      for (const loser of losers) {
        if (Number(loser.id) === Number(winner.id)) continue;
        if (loser.status === "active") {
          await client.query(
            `UPDATE priority_auction_bids
                SET status = 'lost', lost_at = NOW(), updated_at = NOW()
              WHERE id = $1`,
            [loser.id],
          );
          await releaseBidReservation(client, loser, { actorUserId });
          await fairDist.recordFairDistributionEvent({
            client,
            freelancerUserId: loser.freelancer_user_id,
            orderId: order.id,
            outcomeCode: "APPLIED_AND_LOST",
            scope: fairDist.resolveFairnessScope(order),
            referenceType: "priority_auction_bid",
            referenceId: String(loser.id),
            idempotencyKey: `applied_and_lost:order:${order.id}:freelancer:${loser.freelancer_user_id}`,
            reason: "priority_auction_lost",
          });
        }
      }
      assignment = await applyWinnerToOrder(client, { order, winnerBid: winner, auction });
    } else {
      for (const bid of bids) {
        if (bid.status === "active") {
          await client.query(
            `UPDATE priority_auction_bids
                SET status = 'lost', lost_at = NOW(), updated_at = NOW()
              WHERE id = $1`,
            [bid.id],
          );
          await releaseBidReservation(client, bid, { actorUserId });
        }
      }
      await fairDist.recordNoEligibleWinner({
        client,
        order,
        actorRole: "system",
        actorUserId,
        reason: "priority_auction_no_eligible_winner",
      });
    }

    const detail = {
      skipped,
      assignment,
      strategy: resolutionStrategyUsed,
      fairDecisionId: fairDecision?.decisionId || null,
      participantCount: bids.length,
      winnerBidTokens: winner ? Number(winner.bid_tokens) : null,
    };

    const { rows: resolvedRows } = await client.query(
      `UPDATE priority_bid_auctions
          SET status = 'resolved',
              resolved_at = NOW(),
              winner_auction_bid_id = $2,
              winner_freelancer_user_id = $3,
              resolution_reason = $4,
              resolution_detail_json = $5::jsonb,
              updated_at = NOW()
        WHERE id = $1
          AND status = 'resolving'
        RETURNING *`,
      [
        auction.id,
        winner ? Number(winner.id) : null,
        winner ? Number(winner.freelancer_user_id) : null,
        resolutionReason,
        JSON.stringify(detail),
      ],
    );

    if (!resolvedRows[0]) {
      const again = await getAuctionById(auction.id, { client });
      return {
        resolved: false,
        idempotent: true,
        auction: again,
        reason: again?.resolutionReason || PRIORITY_AUCTION_RESOLUTION_REASONS.ALREADY_RESOLVED,
      };
    }

    return {
      resolved: true,
      idempotent: false,
      auction: mapAuction(resolvedRows[0]),
      winner: winner ? mapBid(winner) : null,
      reason: resolutionReason,
      assignment,
      skipped,
    };
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

/**
 * Cancel before resolution: release all reservations; return PB uses when snapshotted policy says so.
 * Lock order: order → auction → bids.
 * Allowed only from active|scheduled. resolving is owned by resolve (no-op / blocked).
 * Does NOT transition through resolving.
 */
async function cancelPriorityAuction({
  auctionId,
  actorUserId = null,
  reason = PRIORITY_AUCTION_RESOLUTION_REASONS.CANCELLED_BEFORE_RESOLUTION,
  client: externalClient = null,
} = {}) {
  const run = async (client) => {
    const { meta, auction } = await lockOrderThenAuction(client, auctionId);
    if (!meta || !auction) {
      throw createAppError("Priority Auction not found.", 404, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_FOUND,
      });
    }
    if (auction.status === "cancelled") {
      return { cancelled: false, idempotent: true, auction: mapAuction(auction) };
    }
    if (auction.status === "resolved") {
      return {
        cancelled: false,
        idempotent: true,
        blocked: true,
        reason: "ALREADY_RESOLVED",
        auction: mapAuction(auction),
      };
    }
    if (auction.status === "resolving") {
      return {
        cancelled: false,
        idempotent: false,
        blocked: true,
        reason: "RESOLUTION_IN_PROGRESS",
        auction: mapAuction(auction),
      };
    }
    if (auction.status !== "active" && auction.status !== "scheduled") {
      throw createAppError("Priority Auction is not cancellable.", 409, {
        exposeToClient: true,
        publicCode: PRIORITY_AUCTION_ERROR_CODES.PRIORITY_AUCTION_NOT_ACTIVE,
      });
    }

    const { rows: bids } = await client.query(
      `SELECT * FROM priority_auction_bids WHERE auction_id = $1 FOR UPDATE`,
      [Number(auction.id)],
    );

    for (const bid of bids) {
      if (bid.status === "active") {
        await releaseBidReservation(client, bid, { actorUserId });
        await client.query(
          `UPDATE priority_auction_bids
              SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
            WHERE id = $1`,
          [bid.id],
        );
        if (auction.return_use_on_cancel) {
          try {
            await returnPriorityBidUse({
              client,
              freelancerUserId: Number(bid.freelancer_user_id),
              referenceType: PRIORITY_AUCTION_REFERENCE_TYPES.BID,
              referenceId: String(bid.id),
              actorUserId: actorUserId != null ? Number(actorUserId) : null,
              reason: "priority_auction_cancelled",
            });
          } catch (err) {
            if (
              err.publicCode !== "PRIORITY_BID_USE_RETURN_NOT_FOUND" &&
              err.publicCode !== "USAGE_RETURN_NOT_FOUND"
            ) {
              if (!String(err.publicCode || "").includes("RETURN")) throw err;
            }
          }
        }
      }
    }

    const { rows } = await client.query(
      `UPDATE priority_bid_auctions
          SET status = 'cancelled',
              cancelled_at = NOW(),
              resolved_at = NOW(),
              resolution_reason = $2,
              resolution_detail_json = $3::jsonb,
              updated_at = NOW()
        WHERE id = $1
          AND status IN ('active', 'scheduled')
        RETURNING *`,
      [
        auction.id,
        reason,
        JSON.stringify({ cancelledBidCount: bids.length, returnUse: auction.return_use_on_cancel }),
      ],
    );

    if (!rows[0]) {
      const again = await getAuctionById(auction.id, { client });
      return {
        cancelled: false,
        idempotent: true,
        blocked: again?.status === "resolving" || again?.status === "resolved",
        reason: again?.status === "resolving" ? "RESOLUTION_IN_PROGRESS" : "ALREADY_TERMINAL",
        auction: again,
      };
    }

    return { cancelled: true, idempotent: false, auction: mapAuction(rows[0]) };
  };

  if (externalClient) return run(externalClient);
  return withOwnTransaction(run);
}

async function listDueAuctionsForResolution({ limit = 50, client: db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT id FROM priority_bid_auctions
     WHERE status IN ('scheduled', 'active')
       AND ends_at <= NOW()
     ORDER BY ends_at ASC, id ASC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return rows.map((r) => String(r.id));
}

async function resolveDuePriorityAuctions({ limit = 50, actorUserId = null } = {}) {
  // Phase B7B: resolve tick must not mutate legacy Token auctions / WT reservations.
  void limit;
  void actorUserId;
  return {
    processed: 0,
    results: [],
    skipped: true,
    code: "PRIORITY_AUCTION_DEPRECATED",
  };
}

async function getAuctionById(auctionId, { client: db = pool } = {}) {
  const { rows } = await db.query(`SELECT * FROM priority_bid_auctions WHERE id = $1`, [
    Number(auctionId),
  ]);
  return mapAuction(rows[0]);
}

async function getAuctionByOrderId(orderId, { client: db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM priority_bid_auctions
     WHERE order_id = $1
     ORDER BY id DESC
     LIMIT 1`,
    [Number(orderId)],
  );
  return mapAuction(rows[0]);
}

async function listAuctionBids(auctionId, { client: db = pool } = {}) {
  const { rows } = await db.query(
    `SELECT * FROM priority_auction_bids WHERE auction_id = $1 ORDER BY bid_tokens DESC, submitted_at ASC, id ASC`,
    [Number(auctionId)],
  );
  return rows.map(mapBid);
}

/**
 * Freelancer-safe auction view: own bid + anonymous highest + ends_at.
 */
async function getFreelancerAuctionView({ auctionId, freelancerUserId, client: db = pool }) {
  const auction = await getAuctionById(auctionId, { client: db });
  if (!auction) return null;
  const bids = await listAuctionBids(auctionId, { client: db });
  const active = bids.filter((b) => b.status === "active" || b.status === "won");
  const own = bids.find((b) => String(b.freelancerUserId) === String(freelancerUserId)) || null;
  const highest = active.length ? Math.max(...active.map((b) => b.bidTokens)) : null;
  let position = null;
  if (own && (own.status === "active" || own.status === "won")) {
    const ranked = rankPriorityBids(active);
    position = ranked.findIndex((b) => String(b.id) === String(own.id)) + 1;
  }
  const allowance = await getPriorityBidAllowanceForFreelancer(freelancerUserId, { client: db });
  return {
    auction: {
      id: auction.id,
      orderId: auction.orderId,
      status: auction.status,
      startsAt: auction.startsAt,
      endsAt: auction.endsAt,
      minimumBidTokens: auction.minimumBidTokens,
      allowIncrease: auction.allowIncrease,
      resolutionReason: auction.status === "resolved" ? auction.resolutionReason : null,
    },
    ownBid: own
      ? {
          id: own.id,
          bidTokens: own.bidTokens,
          status: own.status,
          submittedAt: own.submittedAt,
        }
      : null,
    highestBidTokens: highest,
    position,
    remainingPriorityBidUses: allowance.remaining,
  };
}

module.exports = {
  createPriorityAuctionForOrder,
  maybeCreatePriorityAuctionOnPricedBiddingOpen,
  assertNoActivePriorityAuctionBlockingAssignment,
  cancelOpenPriorityAuctionsForOrder,
  submitPriorityBid,
  increasePriorityBid,
  withdrawPriorityBid,
  resolvePriorityAuction,
  cancelPriorityAuction,
  listDueAuctionsForResolution,
  resolveDuePriorityAuctions,
  getAuctionById,
  getAuctionByOrderId,
  listAuctionBids,
  getFreelancerAuctionView,
  rankPriorityBids,
  mapAuction,
  mapBid,
  hasPricedBiddingRow,
  PRIORITY_AUCTION_CREATION_SOURCES,
};
