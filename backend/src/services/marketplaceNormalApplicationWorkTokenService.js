/**
 * LEGACY_DEPRECATED — Phase 5 Work Token normal-application charge + refund.
 *
 * Phase B2 disconnected this from submitPoolOrderBid (Bid Credits replace it).
 * Schema/tests retained for audit/rollback until Work Token schema deletion.
 * Do NOT re-wire to active Freelancer apply runtime.
 *
 * Historical surface: order_freelancer_bids / submitPoolOrderBid ONLY (not fixed take).
 * Engine gate: work_tokens_enabled.
 * Fake/training: never called — controller routes fake to fakeOrdersService.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isWorkTokensEngineActive,
} = require("./marketplaceEconomySettingsService");
const walletService = require("./marketplaceWorkTokenWalletService");
const {
  ceilRequiredNormalApplicationTokens,
  assertNormalApplicationRefundPercentage,
  isExactFullRefundPercentage,
  refundTokensFromEconomicSnapshot,
} = require("../utils/marketplaceNormalApplicationTokenMath");
const {
  WORK_TOKEN_ERROR_CODES,
  NORMAL_APPLICATION_REFERENCE_TYPES,
  NORMAL_APPLICATION_COST_ROUNDING,
  NORMAL_APPLICATION_REFUND_ROUNDING_FULL,
  NORMAL_APPLICATION_REFUND_ROUNDING_POLICY_PENDING,
  NORMAL_APPLICATION_CONSUME_EVENT,
  NORMAL_APPLICATION_REFUND_EVENT,
} = require("../constants/marketplaceWorkTokens");

const REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION = "order_ended_without_selection";

function resolveRefundRoundingRuleForConfiguredPercentage(refundPercentage) {
  return isExactFullRefundPercentage(refundPercentage)
    ? NORMAL_APPLICATION_REFUND_ROUNDING_FULL
    : NORMAL_APPLICATION_REFUND_ROUNDING_POLICY_PENDING;
}

function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  return null;
}

function assertPositiveOrderBudget(budget) {
  const n = Number(budget);
  if (!Number.isFinite(n) || n <= 0) {
    throw createAppError(
      "تعذر احتساب رسوم التقديم: قيمة الطلب غير متوفرة.",
      409,
      {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE,
      },
    );
  }
  return budget;
}

function mapEconomicsRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    bidId: String(row.bid_id),
    orderId: String(row.order_id),
    freelancerUserId: String(row.freelancer_user_id),
    orderBudgetJod: Number(row.order_budget_jod),
    tokensPerOrderJod: Number(row.tokens_per_order_jod),
    tokenCost: Number(row.token_cost),
    costRoundingRule: row.cost_rounding_rule,
    refundPercentage: Number(row.refund_percentage),
    refundRoundingRule: row.refund_rounding_rule,
    chargeStatus: row.charge_status,
    refundStatus: row.refund_status,
    refundTokens: row.refund_tokens != null ? Number(row.refund_tokens) : null,
    refundReason: row.refund_reason || null,
    chargeLedgerEntryId: row.charge_ledger_entry_id != null ? String(row.charge_ledger_entry_id) : null,
    refundLedgerEntryId: row.refund_ledger_entry_id != null ? String(row.refund_ledger_entry_id) : null,
    chargedAt: row.charged_at,
    refundedAt: row.refunded_at || null,
  };
}

async function findEconomicsByOrderFreelancer(client, orderId, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT *
     FROM order_freelancer_bid_work_token_economics
     WHERE order_id = $1
       AND freelancer_user_id = $2
     LIMIT 1
     FOR UPDATE`,
    [Number(orderId), Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function findEconomicsByIdForUpdate(client, economicsId) {
  const { rows } = await client.query(
    `SELECT *
     FROM order_freelancer_bid_work_token_economics
     WHERE id = $1
     LIMIT 1
     FOR UPDATE`,
    [Number(economicsId)],
  );
  return rows[0] || null;
}

/**
 * Quote required tokens for UX (read-only). Does not create wallet or charge.
 */
async function quoteNormalApplicationTokenCost({ order, settings: settingsIn } = {}) {
  const settings = settingsIn || (await getMarketplaceEconomySettings());
  const engineOn = isWorkTokensEngineActive(settings);
  if (!engineOn) {
    return {
      engineAvailable: false,
      requiredTokens: null,
      refundPercentage: null,
      pricingAvailable: false,
    };
  }
  try {
    assertPositiveOrderBudget(order?.budget ?? order?.budgetJod);
    const budget = order.budget != null ? order.budget : order.budgetJod;
    const requiredTokens = ceilRequiredNormalApplicationTokens(
      budget,
      settings.normalApplicationTokensPerOrderJod,
    );
    const refundPercentage = assertNormalApplicationRefundPercentage(
      settings.normalApplicationTokenRefundPercentage,
    );
    return {
      engineAvailable: true,
      requiredTokens,
      refundPercentage,
      pricingAvailable: true,
      costRoundingRule: NORMAL_APPLICATION_COST_ROUNDING,
      refundRoundingRule: resolveRefundRoundingRuleForConfiguredPercentage(refundPercentage),
      orderBudgetJod: Number(budget),
      tokensPerOrderJod: Number(settings.normalApplicationTokensPerOrderJod),
    };
  } catch (err) {
    if (err.publicCode === WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_TOKEN_PRICING_UNAVAILABLE) {
      let refundPercentage = null;
      try {
        refundPercentage = assertNormalApplicationRefundPercentage(
          settings.normalApplicationTokenRefundPercentage,
        );
      } catch {
        refundPercentage = null;
      }
      return {
        engineAvailable: true,
        requiredTokens: null,
        refundPercentage,
        pricingAvailable: false,
        publicCode: err.publicCode,
      };
    }
    throw err;
  }
}

/**
 * Charge Tokens for the FIRST economic application of Freelancer+Order.
 * Must run inside caller's open transaction (client required).
 *
 * @returns {{ charged: boolean, skipped: boolean, reason?: string, economics?: object, consume?: object }}
 */
async function chargeNormalApplicationOnFirstBid({
  client,
  freelancerUserId,
  orderId,
  bidId,
  orderRow,
  poolKind,
  actorUserId = null,
}) {
  if (!client) {
    throw createAppError("chargeNormalApplicationOnFirstBid requires an open DB client.", 500);
  }
  if (poolKind !== "real") {
    return { charged: false, skipped: true, reason: "not_real_pool_kind" };
  }
  if (!Number.isInteger(Number(bidId)) || Number(bidId) < 1) {
    throw createAppError("bidId is required for normal application Token charge.", 500);
  }

  const settings = await getMarketplaceEconomySettings(client);
  if (!isWorkTokensEngineActive(settings)) {
    return { charged: false, skipped: true, reason: "engine_off" };
  }

  const existing = await findEconomicsByOrderFreelancer(client, orderId, freelancerUserId);
  if (existing && existing.charge_status === "charged") {
    return { charged: false, skipped: true, reason: "already_charged", economics: mapEconomicsRow(existing) };
  }

  assertPositiveOrderBudget(orderRow.budget);
  const tokenCost = ceilRequiredNormalApplicationTokens(
    orderRow.budget,
    settings.normalApplicationTokensPerOrderJod,
  );
  // Canonical CURRENT policy: marketplace_economy_settings.normal_application_token_refund_percentage
  // Snapshot the configured value so later setting edits never rewrite this application.
  const refundPercentage = assertNormalApplicationRefundPercentage(
    settings.normalApplicationTokenRefundPercentage,
  );
  const refundRoundingRule = resolveRefundRoundingRuleForConfiguredPercentage(refundPercentage);
  const referenceId = String(bidId);
  const idempotencyKey = `normal_app_consume:order:${orderId}:freelancer:${freelancerUserId}`;

  const consume = await walletService.consumeAvailableWorkTokens({
    client,
    freelancerUserId: Number(freelancerUserId),
    amountTokens: tokenCost,
    eventType: NORMAL_APPLICATION_CONSUME_EVENT,
    referenceType: NORMAL_APPLICATION_REFERENCE_TYPES.BID,
    referenceId,
    idempotencyKey,
    actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
    reason: "normal_application_consume",
    metadata: {
      orderId: String(orderId),
      bidId: String(bidId),
      orderBudgetJod: String(orderRow.budget),
      tokensPerOrderJod: String(settings.normalApplicationTokensPerOrderJod),
      costRoundingRule: NORMAL_APPLICATION_COST_ROUNDING,
      refundPercentage,
      refundRoundingRule,
    },
  });

  if (consume.idempotent && existing) {
    return { charged: false, skipped: true, reason: "idempotent_replay", economics: mapEconomicsRow(existing), consume };
  }

  const { rows } = await client.query(
    `INSERT INTO order_freelancer_bid_work_token_economics (
       bid_id, order_id, freelancer_user_id,
       order_budget_jod, tokens_per_order_jod, token_cost, cost_rounding_rule,
       refund_percentage, refund_rounding_rule,
       charge_status, refund_status,
       charge_ledger_entry_id
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7,
       $8, $9,
       'charged', 'none',
       $10
     )
     ON CONFLICT (order_id, freelancer_user_id) DO NOTHING
     RETURNING *`,
    [
      Number(bidId),
      Number(orderId),
      Number(freelancerUserId),
      orderRow.budget,
      settings.normalApplicationTokensPerOrderJod,
      tokenCost,
      NORMAL_APPLICATION_COST_ROUNDING,
      refundPercentage,
      refundRoundingRule,
      consume.entry?.id ? Number(consume.entry.id) : null,
    ],
  );

  if (!rows[0]) {
    // Concurrent inserter won — treat as already charged (wallet consume is idempotent by key).
    const again = await findEconomicsByOrderFreelancer(client, orderId, freelancerUserId);
    return {
      charged: false,
      skipped: true,
      reason: "concurrent_first_charge",
      economics: mapEconomicsRow(again),
      consume,
    };
  }

  return { charged: true, skipped: false, economics: mapEconomicsRow(rows[0]), consume };
}

/**
 * Prove order ended/closed without any Freelancer selection.
 */
async function assertOrderEndedWithoutFreelancerSelection(client, orderId) {
  const { rows } = await client.query(
    `SELECT id, order_status, assigned_freelancer_id, accepted_freelancer_id,
            selected_bid_id, received_at, is_open_for_pool, is_published
     FROM orders
     WHERE id = $1
     FOR UPDATE`,
    [Number(orderId)],
  );
  const order = rows[0];
  if (!order) {
    throw createAppError("Order not found.", 404, { exposeToClient: true });
  }

  const selected =
    order.assigned_freelancer_id != null ||
    order.accepted_freelancer_id != null ||
    order.selected_bid_id != null ||
    order.received_at != null;

  if (selected) {
    throw createAppError("Order already has a selected Freelancer; no normal-application refund.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
    });
  }

  const { rows: acceptedBids } = await client.query(
    `SELECT id FROM order_freelancer_bids
     WHERE order_id = $1
       AND status IN ('accepted', 'selected_pending_payment')
     LIMIT 1`,
    [Number(orderId)],
  );
  if (acceptedBids[0]) {
    throw createAppError("Order has a selected bid; no normal-application refund.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
    });
  }

  const status = String(order.order_status || "");
  const closed =
    status === "cancelled" ||
    (order.is_open_for_pool === false && order.is_published === false) ||
    (order.is_open_for_pool === false && status !== "open_for_bids" && status !== "awaiting_payment_after_bid_selection");

  // Caller may close the order in the same transaction before calling refund; require cancelled or closed pool.
  if (status !== "cancelled" && order.is_open_for_pool !== false) {
    throw createAppError("Order has not ended without selection.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
    });
  }

  return { order, closed };
}

/**
 * Refund a single charged economics row (idempotent).
 */
async function refundSingleNormalApplicationEconomics({
  client,
  economicsRow,
  reason = REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
  actorUserId = null,
}) {
  if (!economicsRow || economicsRow.charge_status !== "charged") {
    throw createAppError("Normal application was not charged.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_NOT_CHARGED,
    });
  }
  if (economicsRow.refund_status === "refunded") {
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(economicsRow) };
  }
  if (economicsRow.refund_status === "not_applicable") {
    throw createAppError("Normal application refund is not applicable.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
    });
  }

  const refundTokens = refundTokensFromEconomicSnapshot({
    tokenCost: Number(economicsRow.token_cost),
    refundPercentage: economicsRow.refund_percentage,
    refundRoundingRule: economicsRow.refund_rounding_rule,
  });
  const idempotencyKey = `normal_app_refund:econ:${economicsRow.id}`;

  let credit = null;
  if (refundTokens > 0) {
    credit = await walletService.creditWorkTokens({
      client,
      freelancerUserId: Number(economicsRow.freelancer_user_id),
      amountTokens: refundTokens,
      eventType: NORMAL_APPLICATION_REFUND_EVENT,
      referenceType: NORMAL_APPLICATION_REFERENCE_TYPES.BID,
      referenceId: String(economicsRow.bid_id),
      idempotencyKey,
      actorUserId: actorUserId != null ? Number(actorUserId) : null,
      reason: reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
      metadata: {
        economicsId: String(economicsRow.id),
        orderId: String(economicsRow.order_id),
        tokenCost: Number(economicsRow.token_cost),
        refundPercentage: Number(economicsRow.refund_percentage),
        refundRoundingRule: String(economicsRow.refund_rounding_rule),
      },
    });
    if (credit.idempotent) {
      const locked = await findEconomicsByIdForUpdate(client, economicsRow.id);
      if (locked?.refund_status === "refunded") {
        return { refunded: false, idempotent: true, economics: mapEconomicsRow(locked), credit };
      }
    }
  }

  const { rows } = await client.query(
    `UPDATE order_freelancer_bid_work_token_economics
        SET refund_status = 'refunded',
            refund_tokens = $2,
            refund_reason = $3,
            refund_ledger_entry_id = COALESCE($4, refund_ledger_entry_id),
            refunded_at = COALESCE(refunded_at, NOW()),
            updated_at = NOW()
      WHERE id = $1
        AND charge_status = 'charged'
        AND refund_status = 'none'
      RETURNING *`,
    [
      Number(economicsRow.id),
      refundTokens,
      reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
      credit?.entry?.id ? Number(credit.entry.id) : null,
    ],
  );

  if (!rows[0]) {
    const locked = await findEconomicsByIdForUpdate(client, economicsRow.id);
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(locked), credit };
  }

  return { refunded: true, idempotent: false, economics: mapEconomicsRow(rows[0]), credit };
}

/**
 * Canonical refund for all charged applications on an order that ended with no selection.
 */
async function refundChargedApplicationsForOrderEndedWithoutSelection(input = {}) {
  const orderId = Number(input.orderId);
  const external = resolveDbClient(input.client);
  const ownClient = !external;
  const client = external ? external.client : await pool.connect();
  const ownTxn = ownClient;

  try {
    if (ownTxn) await client.query("BEGIN");

    await assertOrderEndedWithoutFreelancerSelection(client, orderId);

    const { rows } = await client.query(
      `SELECT *
       FROM order_freelancer_bid_work_token_economics
       WHERE order_id = $1
         AND charge_status = 'charged'
         AND refund_status = 'none'
       FOR UPDATE`,
      [orderId],
    );

    const results = [];
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const out = await refundSingleNormalApplicationEconomics({
        client,
        economicsRow: row,
        reason: input.reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        actorUserId: input.actorUserId || null,
      });
      results.push(out);
    }

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      orderId: String(orderId),
      refundedCount: results.filter((r) => r.refunded).length,
      results,
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
    if (ownClient) client.release();
  }
}

/**
 * Close an open bidding order without Freelancer selection, then refund charged applications.
 * Used for client/admin/system cancellation before selection (outcomes E/F) and explicit close (D).
 */
async function endOpenBiddingOrderWithoutSelection({
  orderId,
  actorUserId = null,
  actorRole = null,
  reason = REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
  client: externalClient = null,
} = {}) {
  const external = resolveDbClient(externalClient);
  const ownClient = !external;
  const client = external ? external.client : await pool.connect();
  const ownTxn = ownClient;

  try {
    if (ownTxn) await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [Number(orderId)],
    );
    const order = rows[0];
    if (!order) {
      throw createAppError("Order not found.", 404, { exposeToClient: true });
    }

    if (actorRole === "client") {
      if (String(order.source_type) !== "client_created" || Number(order.created_by_user_id) !== Number(actorUserId)) {
        throw createAppError("Not allowed to cancel this order.", 403, { exposeToClient: true });
      }
    }

    const selected =
      order.assigned_freelancer_id != null ||
      order.accepted_freelancer_id != null ||
      order.selected_bid_id != null ||
      order.received_at != null;
    if (selected) {
      throw createAppError("Cannot end order without selection: a Freelancer is already selected.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
      });
    }

    const { rows: selectedBids } = await client.query(
      `SELECT id FROM order_freelancer_bids
       WHERE order_id = $1 AND status IN ('accepted', 'selected_pending_payment')
       LIMIT 1`,
      [Number(orderId)],
    );
    if (selectedBids[0]) {
      throw createAppError("Cannot end order without selection: a bid is already selected.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.NORMAL_APPLICATION_REFUND_NOT_ELIGIBLE,
      });
    }

    await client.query(
      `UPDATE orders
          SET order_status = 'cancelled',
              is_open_for_pool = FALSE,
              updated_at = NOW()
        WHERE id = $1`,
      [Number(orderId)],
    );

    // Reject remaining pending bids (no per-bid refund — order-level refund handles charged apps).
    await client.query(
      `UPDATE order_freelancer_bids
          SET status = 'rejected',
              updated_at = NOW()
        WHERE order_id = $1
          AND status = 'pending'`,
      [Number(orderId)],
    );

    // Phase 6: cancel any open Priority Auction on this Order (release reservations; return PB uses per snapshot).
    const priorityAuctionService = require("./marketplacePriorityAuctionService");
    await priorityAuctionService.cancelOpenPriorityAuctionsForOrder({
      client,
      orderId,
      actorUserId,
      reason: "ORDER_CANCELLED_BEFORE_RESOLUTION",
    });

    // Phase 8: cancel PENDING Elite Direct Offer and release reserved entitlement
    {
      const eliteSvc = require("./marketplaceEliteDirectOrdersService");
      const { ELITE_REASON_CODES } = require("../constants/marketplaceEliteDirectOrders");
      await eliteSvc.cancelPendingEliteOffersForOrder({
        client,
        orderId,
        actorUserId,
        reasonCode: ELITE_REASON_CODES.ORDER_CANCELLED,
      });
    }

    // Phase 7.1: pre-selection cancel — NO APPLIED_AND_LOST
    {
      const fairDist = require("./marketplaceFairDistributionService");
      await fairDist.recordOrderCancelledBeforeResolution({
        client,
        order,
        actorRole: actorRole || "system",
        actorUserId,
        reason: reason || "order_cancelled_before_resolution",
      });
    }

    // Phase B2: active normal-application refund is Bid Credits only.
    // Legacy WT refund remains exported for Phase 5 tests / historical rows; not invoked here.
    const bidCreditApp = require("./marketplaceNormalApplicationBidCreditService");
    const bidCreditRefund =
      await bidCreditApp.refundChargedBidApplicationsForOrderEndedWithoutSelection({
        client,
        orderId,
        actorUserId,
        reason,
      });

    // Phase B4: return Priority Uses only on no-selection (same eligibility window).
    const priorityBoostSvc = require("./marketplacePriorityApplicationBoostService");
    const priorityBoostReturn =
      await priorityBoostSvc.returnPriorityBoostsForOrderEndedWithoutSelection({
        client,
        orderId,
        actorUserId,
        reason,
      });

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      orderId: String(orderId),
      cancelled: true,
      refund: bidCreditRefund,
      bidCreditRefund,
      priorityBoostReturn,
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
    if (ownClient) client.release();
  }
}

module.exports = {
  quoteNormalApplicationTokenCost,
  chargeNormalApplicationOnFirstBid,
  refundSingleNormalApplicationEconomics,
  refundChargedApplicationsForOrderEndedWithoutSelection,
  endOpenBiddingOrderWithoutSelection,
  assertOrderEndedWithoutFreelancerSelection,
  mapEconomicsRow,
  REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
};
