/**
 * Phase B2 / E3 — Normal priced-bid application Bid Credit charge + eligible refund.
 *
 * Surface: order_freelancer_bids / submitPoolOrderBid ONLY (not fixed take).
 * Engine gate: bid_credits_enabled (independent of work_tokens_enabled).
 * Fake/training: never called — controller routes fake to fakeOrdersService.
 * Cost (E3): Order.application_bid_cost snapshot (Admin-constrained); legacy NULL → 1.
 * Multi-Bid FEFO consume is atomic; daily E1 cap uses full quantity.
 *
 * Refund (owner-approved):
 *   Eligible ONLY when real Order ends with NO Freelancer selected (or configured full policy).
 *   Restores exact consumed quantity (100%):
 *   - Unexpired source grant slices → restore to SAME buckets (FEFO reverse)
 *   - Expired / unrestorable → compensating SYSTEM grant (qty, +30 days)
 *   Withdrawal / another Freelancer wins → NO refund (default policy)
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isBidCreditsEngineActive,
} = require("./marketplaceEconomySettingsService");
const {
  NORMAL_APPLICATION_BID_COST,
  NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS,
  BID_CREDIT_ERROR_CODES,
} = require("../constants/marketplaceBidCredits");
const accounting = require("./marketplaceBidCreditAccountingService");
const distribution = require("./marketplaceBidCreditDistributionService");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");
const {
  resolveOrderApplicationBidCost,
} = require("./marketplaceNormalOrderRulesService");

const NORMAL_APPLICATION_BID_CONSUME_IDEMPOTENCY_PREFIX =
  "normal_application_bid_consume";
const NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX =
  "normal_application_bid_refund";
const REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION = "order_ended_without_selection";

function resolveChargeAmount(orderRow) {
  return resolveOrderApplicationBidCost(orderRow || {});
}

function buildNormalApplicationBidConsumeIdempotencyKey(orderId, freelancerUserId) {
  return `${NORMAL_APPLICATION_BID_CONSUME_IDEMPOTENCY_PREFIX}:order:${Number(orderId)}:freelancer:${Number(freelancerUserId)}`;
}

function buildNormalApplicationBidRefundIdempotencyKey(orderId, freelancerUserId) {
  return `${NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX}:order:${Number(orderId)}:freelancer:${Number(freelancerUserId)}`;
}

let economicsTableReadyCache = null;

async function normalApplicationBidEconomicsSchemaReady(db = pool) {
  if (economicsTableReadyCache === true) return true;
  if (economicsTableReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT to_regclass('public.order_freelancer_bid_credit_economics') AS t`,
  );
  economicsTableReadyCache = Boolean(rows[0]?.t);
  return economicsTableReadyCache;
}

function clearNormalApplicationBidEconomicsSchemaCache() {
  economicsTableReadyCache = null;
}

function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  return null;
}

function mapEconomicsRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    bidId: String(row.bid_id),
    orderId: String(row.order_id),
    freelancerUserId: String(row.freelancer_user_id),
    bidCreditCost: Number(row.bid_credit_cost) || NORMAL_APPLICATION_BID_COST,
    chargeStatus: row.charge_status,
    refundStatus: row.refund_status,
    refundMode: row.refund_mode || null,
    consumeLedgerEntryId:
      row.consume_ledger_entry_id != null ? String(row.consume_ledger_entry_id) : null,
    primaryGrantId: row.primary_grant_id != null ? String(row.primary_grant_id) : null,
    grantExpiresAtSnapshot: row.grant_expires_at_snapshot || null,
    refundLedgerEntryId:
      row.refund_ledger_entry_id != null ? String(row.refund_ledger_entry_id) : null,
    compensatingGrantId:
      row.compensating_grant_id != null ? String(row.compensating_grant_id) : null,
    refundIdempotencyKey: row.refund_idempotency_key || null,
    idempotencyKey: row.idempotency_key,
    fefoAllocations: row.fefo_allocations || [],
    chargedAt: row.charged_at || null,
    refundedAt: row.refunded_at || null,
    createdAt: row.created_at || null,
  };
}

async function findEconomicsByOrderFreelancer(client, orderId, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT * FROM order_freelancer_bid_credit_economics
      WHERE order_id = $1 AND freelancer_user_id = $2
      LIMIT 1`,
    [Number(orderId), Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function findEconomicsByIdForUpdate(client, economicsId) {
  const { rows } = await client.query(
    `SELECT * FROM order_freelancer_bid_credit_economics WHERE id = $1 FOR UPDATE`,
    [Number(economicsId)],
  );
  return rows[0] || null;
}

/**
 * Read-only quote for Freelancer apply UX.
 */
async function quoteNormalApplicationBidCost({
  order,
  freelancerUserId = null,
  now = new Date(),
} = {}) {
  const settings = await getMarketplaceEconomySettings();
  const engineAvailable = isBidCreditsEngineActive(settings);
  const schemaReady =
    (await marketplaceBidCreditsSchemaReady()) &&
    (await normalApplicationBidEconomicsSchemaReady());

  const bidCreditCost = resolveChargeAmount(order);

  const base = {
    applicable: true,
    engineAvailable,
    schemaReady,
    bidCreditCost,
    availableBids: null,
    canApply: null,
  };

  if (!engineAvailable || !schemaReady || freelancerUserId == null) {
    return {
      ...base,
      canApply: engineAvailable ? null : true,
      reason: !schemaReady ? "schema_not_ready" : !engineAvailable ? "engine_off" : null,
    };
  }

  await distribution.reconcileFreelancerBidDistributions({
    freelancerUserId: Number(freelancerUserId),
    now,
  });
  const client = await pool.connect();
  try {
    const available = await accounting.sumAvailableBidCredits({
      client,
      freelancerUserId: Number(freelancerUserId),
      now,
    });
    return {
      ...base,
      availableBids: available,
      canApply: available >= bidCreditCost,
      orderId: order?.id != null ? String(order.id) : null,
    };
  } finally {
    client.release();
  }
}

/**
 * Charge Order snapshotted Bid cost on first Freelancer+Order priced bid when engine ON.
 * Quantity is atomic via FEFO; daily spend increments by full cost.
 */
async function chargeNormalApplicationBidCreditOnFirstBid({
  client,
  freelancerUserId,
  orderId,
  bidId,
  orderRow,
  poolKind,
  actorUserId = null,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("chargeNormalApplicationBidCreditOnFirstBid requires an open DB client.", 500);
  }
  if (poolKind !== "real") {
    return { charged: false, skipped: true, reason: "not_real_pool_kind", bidCreditCost: 0 };
  }
  if (!Number.isInteger(Number(bidId)) || Number(bidId) < 1) {
    throw createAppError("bidId is required for normal application Bid Credit charge.", 500);
  }

  const settings = await getMarketplaceEconomySettings(client);
  if (!isBidCreditsEngineActive(settings)) {
    return { charged: false, skipped: true, reason: "engine_off", bidCreditCost: 0 };
  }

  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
  if (!(await normalApplicationBidEconomicsSchemaReady(client))) {
    throw createAppError("Normal application Bid Credit economics schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }

  const bidCreditCost = resolveChargeAmount(orderRow);

  const existing = await findEconomicsByOrderFreelancer(client, orderId, freelancerUserId);
  if (existing && existing.charge_status === "charged") {
    return {
      charged: false,
      skipped: true,
      reason: "already_charged",
      bidCreditCost: Number(existing.bid_credit_cost) || bidCreditCost,
      economics: mapEconomicsRow(existing),
    };
  }

  await distribution.reconcileFreelancerBidDistributions({
    client,
    freelancerUserId: Number(freelancerUserId),
    now,
  });

  // E1: membership daily Bid spend gate (unified wallet — before FEFO). Quantity-aware.
  try {
    const dailySpend = require("./marketplaceMembershipDailyBidSpendService");
    await dailySpend.assertAndConsumeDailyBidSpend({
      client,
      freelancerUserId: Number(freelancerUserId),
      amount: bidCreditCost,
      now,
    });
  } catch (dailyErr) {
    if (dailyErr?.code === "42P01") {
      // Table not migrated yet — skip gate until 153 applied.
    } else {
      throw dailyErr;
    }
  }

  const idempotencyKey = buildNormalApplicationBidConsumeIdempotencyKey(orderId, freelancerUserId);

  const consume = await accounting.consumeBidCreditsFefo({
    client,
    freelancerUserId: Number(freelancerUserId),
    amount: bidCreditCost,
    idempotencyKey,
    referenceType: "order_freelancer_bid",
    referenceId: String(bidId),
    reason: "normal_application_bid_consume",
    actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
    metadata: {
      orderId: String(orderId),
      bidId: String(bidId),
      orderSourceType: orderRow?.source_type || null,
      phase: "E3",
      bidCreditCost,
    },
    now,
  });

  if (consume.idempotent && existing) {
    return {
      charged: false,
      skipped: true,
      reason: "idempotent_replay",
      bidCreditCost: Number(existing.bid_credit_cost) || bidCreditCost,
      economics: mapEconomicsRow(existing),
      consume,
    };
  }

  const primaryGrantId = consume.allocations?.[0]?.grantId || null;
  let grantExpiresAt = null;
  if (primaryGrantId != null) {
    const { rows: gRows } = await client.query(
      `SELECT expires_at FROM marketplace_bid_credit_grants WHERE id = $1`,
      [Number(primaryGrantId)],
    );
    grantExpiresAt = gRows[0]?.expires_at || null;
  }

  const { rows } = await client.query(
    `INSERT INTO order_freelancer_bid_credit_economics (
       bid_id, order_id, freelancer_user_id,
       bid_credit_cost, charge_status, refund_status,
       consume_ledger_entry_id, primary_grant_id, grant_expires_at_snapshot,
       idempotency_key, fefo_allocations, charged_at
     ) VALUES (
       $1, $2, $3,
       $4, 'charged', 'none',
       $5, $6, $7,
       $8, $9::jsonb, NOW()
     )
     ON CONFLICT (order_id, freelancer_user_id) DO NOTHING
     RETURNING *`,
    [
      Number(bidId),
      Number(orderId),
      Number(freelancerUserId),
      bidCreditCost,
      consume.entry?.id ? Number(consume.entry.id) : null,
      primaryGrantId != null ? Number(primaryGrantId) : null,
      grantExpiresAt,
      idempotencyKey,
      JSON.stringify(consume.allocations || []),
    ],
  );

  if (!rows[0]) {
    const again = await findEconomicsByOrderFreelancer(client, orderId, freelancerUserId);
    return {
      charged: false,
      skipped: true,
      reason: "concurrent_first_charge",
      bidCreditCost: Number(again?.bid_credit_cost) || bidCreditCost,
      economics: mapEconomicsRow(again),
      consume,
    };
  }

  const availableAfter = await accounting.sumAvailableBidCredits({
    client,
    freelancerUserId: Number(freelancerUserId),
    now,
  });

  return {
    charged: true,
    skipped: false,
    bidCreditCost,
    availableBidsAfter: availableAfter,
    economics: mapEconomicsRow(rows[0]),
    consume,
  };
}

/**
 * Refund a single charged Bid economics row (100% of consumed quantity) when eligible.
 * Restores FEFO slices to same buckets when unexpired; otherwise compensating grant for remainder.
 */
async function refundSingleNormalApplicationBidEconomics({
  client,
  economicsRow,
  reason = REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
  actorUserId = null,
  now = new Date(),
} = {}) {
  if (!client) {
    throw createAppError("refundSingleNormalApplicationBidEconomics requires an open DB client.", 500);
  }
  if (!economicsRow || economicsRow.charge_status !== "charged") {
    throw createAppError("Normal application was not charged with Bid Credits.", 409, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.NORMAL_APPLICATION_NOT_CHARGED,
    });
  }
  if (economicsRow.refund_status === "refunded") {
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(economicsRow) };
  }
  if (economicsRow.refund_status === "not_applicable") {
    throw createAppError("Normal application Bid refund is not applicable.", 409, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.NORMAL_APPLICATION_BID_REFUND_NOT_ELIGIBLE,
    });
  }

  const locked = await findEconomicsByIdForUpdate(client, economicsRow.id);
  if (!locked) {
    throw createAppError("Normal application Bid economics not found.", 404, { exposeToClient: true });
  }
  if (locked.refund_status === "refunded") {
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(locked) };
  }

  const refundKey = buildNormalApplicationBidRefundIdempotencyKey(
    locked.order_id,
    locked.freelancer_user_id,
  );
  const instant = new Date(now);
  const totalQty =
    Number(locked.bid_credit_cost) >= 1
      ? Number(locked.bid_credit_cost)
      : NORMAL_APPLICATION_BID_COST;

  let allocations = Array.isArray(locked.fefo_allocations) ? locked.fefo_allocations : [];
  if (!allocations.length && locked.primary_grant_id != null) {
    allocations = [{ grantId: locked.primary_grant_id, amount: totalQty }];
  }

  let restoredTotal = 0;
  const restoreDetails = [];

  for (const alloc of allocations) {
    const grantId = Number(alloc.grantId ?? alloc.grant_id);
    const amount = Number(alloc.amount) || 0;
    if (!grantId || amount < 1) continue;

    // eslint-disable-next-line no-await-in-loop
    const { rows: gRows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
      [grantId],
    );
    const grant = gRows[0] || null;
    const sourceStillValid =
      grant &&
      new Date(grant.expires_at) > instant &&
      Number(grant.amount_consumed) >= amount;

    if (!sourceStillValid) continue;

    // eslint-disable-next-line no-await-in-loop
    const { rows: updatedGrant } = await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_consumed = amount_consumed - $2,
              status = CASE
                WHEN status IN ('exhausted', 'active')
                  AND (amount_granted - (amount_consumed - $2) - amount_expired) > 0
                THEN 'active'
                ELSE status
              END,
              exhausted_at = CASE
                WHEN (amount_granted - (amount_consumed - $2) - amount_expired) > 0 THEN NULL
                ELSE exhausted_at
              END,
              updated_at = NOW()
        WHERE id = $1
          AND amount_consumed >= $2
        RETURNING *`,
      [grant.id, amount],
    );
    if (!updatedGrant[0]) continue;
    restoredTotal += amount;
    restoreDetails.push({ grantId: String(grant.id), amount });
  }

  const compensatingQty = totalQty - restoredTotal;
  let refundMode;
  let refundLedgerEntryId = null;
  let compensatingGrantId = null;

  if (compensatingQty <= 0) {
    refundMode = "same_bucket_restore";
    const { rows: ledgerRows } = await client.query(
      `INSERT INTO marketplace_bid_credit_ledger_entries (
         freelancer_user_id, grant_id, event_type, amount, direction,
         reference_type, reference_id, idempotency_key,
         reason, actor_user_id, metadata
       ) VALUES (
         $1, $2, 'NORMAL_APPLICATION_BID_REFUND', $3, 1,
         'order_freelancer_bid_credit_economics', $4, $5,
         $6, $7, $8::jsonb
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        locked.freelancer_user_id,
        restoreDetails[0] ? Number(restoreDetails[0].grantId) : locked.primary_grant_id,
        totalQty,
        String(locked.id),
        refundKey,
        reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        actorUserId,
        JSON.stringify({
          economicsId: String(locked.id),
          orderId: String(locked.order_id),
          bidId: String(locked.bid_id),
          refundMode,
          restoreDetails,
          totalQty,
        }),
      ],
    );
    if (ledgerRows[0]) {
      refundLedgerEntryId = ledgerRows[0].id;
    } else {
      const { rows: existingLedger } = await client.query(
        `SELECT id FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1`,
        [refundKey],
      );
      refundLedgerEntryId = existingLedger[0]?.id || null;
    }
  } else if (restoredTotal === 0) {
    refundMode = "compensating_grant_30d";
    const expiresAt = new Date(
      instant.getTime() + NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS * 86400000,
    );
    const created = await accounting.createBidCreditGrant({
      client,
      freelancerUserId: locked.freelancer_user_id,
      sourceType: "normal_application_refund",
      amount: totalQty,
      expiresAt,
      eventType: "NORMAL_APPLICATION_BID_REFUND",
      idempotencyKey: refundKey,
      reason: reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
      actorUserId,
      referenceType: "order_freelancer_bid_credit_economics",
      referenceId: String(locked.id),
      metadata: {
        economicsId: String(locked.id),
        orderId: String(locked.order_id),
        bidId: String(locked.bid_id),
        refundMode,
        totalQty,
        originalGrantExpired: true,
        compensatingDays: NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS,
      },
      grantedAt: instant,
    });
    compensatingGrantId = created.grant?.id ? Number(created.grant.id) : null;
    const { rows: ledgerRows } = await client.query(
      `SELECT id FROM marketplace_bid_credit_ledger_entries
        WHERE idempotency_key = $1 OR idempotency_key = $2
        ORDER BY id DESC LIMIT 1`,
      [refundKey, `ledger:${refundKey}`],
    );
    refundLedgerEntryId = ledgerRows[0]?.id || null;
  } else {
    // Partial same-bucket + compensating remainder
    refundMode = "same_bucket_restore";
    const expiresAt = new Date(
      instant.getTime() + NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS * 86400000,
    );
    const created = await accounting.createBidCreditGrant({
      client,
      freelancerUserId: locked.freelancer_user_id,
      sourceType: "normal_application_refund",
      amount: compensatingQty,
      expiresAt,
      eventType: "NORMAL_APPLICATION_BID_REFUND",
      idempotencyKey: `${refundKey}:comp`,
      reason: reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
      actorUserId,
      referenceType: "order_freelancer_bid_credit_economics",
      referenceId: String(locked.id),
      metadata: {
        economicsId: String(locked.id),
        orderId: String(locked.order_id),
        bidId: String(locked.bid_id),
        refundMode: "mixed_restore_and_compensating",
        restoreDetails,
        restoredTotal,
        compensatingQty,
        totalQty,
      },
      grantedAt: instant,
    });
    compensatingGrantId = created.grant?.id ? Number(created.grant.id) : null;
    const { rows: ledgerRows } = await client.query(
      `INSERT INTO marketplace_bid_credit_ledger_entries (
         freelancer_user_id, grant_id, event_type, amount, direction,
         reference_type, reference_id, idempotency_key,
         reason, actor_user_id, metadata
       ) VALUES (
         $1, $2, 'NORMAL_APPLICATION_BID_REFUND', $3, 1,
         'order_freelancer_bid_credit_economics', $4, $5,
         $6, $7, $8::jsonb
       )
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING *`,
      [
        locked.freelancer_user_id,
        restoreDetails[0] ? Number(restoreDetails[0].grantId) : null,
        restoredTotal,
        String(locked.id),
        refundKey,
        reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        actorUserId,
        JSON.stringify({
          economicsId: String(locked.id),
          restoreDetails,
          restoredTotal,
          compensatingQty,
          compensatingGrantId,
          totalQty,
        }),
      ],
    );
    refundLedgerEntryId = ledgerRows[0]?.id || null;
    if (!refundLedgerEntryId) {
      const { rows: existingLedger } = await client.query(
        `SELECT id FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1`,
        [refundKey],
      );
      refundLedgerEntryId = existingLedger[0]?.id || null;
    }
  }

  const { rows: marked } = await client.query(
    `UPDATE order_freelancer_bid_credit_economics
        SET refund_status = 'refunded',
            refund_mode = $2,
            refund_ledger_entry_id = COALESCE($3, refund_ledger_entry_id),
            compensating_grant_id = COALESCE($4, compensating_grant_id),
            refund_idempotency_key = COALESCE(refund_idempotency_key, $5),
            refunded_at = COALESCE(refunded_at, NOW()),
            updated_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb
      WHERE id = $1
        AND charge_status = 'charged'
        AND refund_status = 'none'
      RETURNING *`,
    [
      Number(locked.id),
      refundMode,
      refundLedgerEntryId,
      compensatingGrantId,
      refundKey,
      JSON.stringify({ refundQty: totalQty, restoreDetails, compensatingQty }),
    ],
  );

  if (!marked[0]) {
    const again = await findEconomicsByIdForUpdate(client, locked.id);
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(again) };
  }

  // Freelancer notify: eligible Bid refund (deduped; never fail the refund txn).
  try {
    const notificationEventsService = require("./notificationEventsService");
    await notificationEventsService.notifyAssignedFreelancer(
      {
        order: { id: locked.order_id },
        freelancerUserId: locked.freelancer_user_id,
        type: "order.bid.refunded",
        title: "تم استرجاع العروض المتاحة",
        message: `تم استرجاع ${totalQty} عرضاً متاحاً بعد إغلاق/إلغاء الطلب دون اختيار مستقل.`,
        priority: "high",
        dedupeKey: `normal_app_bid_refund_${locked.order_id}_${locked.freelancer_user_id}`,
        metadata: {
          orderId: String(locked.order_id),
          freelancerUserId: String(locked.freelancer_user_id),
          refundQty: totalQty,
          reason: reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        },
      },
      client,
    );
  } catch {
    /* ignore notify failures */
  }

  return {
    refunded: true,
    idempotent: false,
    refundMode,
    refundQty: totalQty,
    economics: mapEconomicsRow(marked[0]),
  };
}

/**
 * Canonical refund for all charged Bid applications on an order that ended with no selection.
 */
async function refundChargedBidApplicationsForOrderEndedWithoutSelection(input = {}) {
  const orderId = Number(input.orderId);
  const external = resolveDbClient(input.client);
  const ownClient = !external;
  const client = external ? external.client : await pool.connect();
  const ownTxn = ownClient;

  try {
    if (ownTxn) await client.query("BEGIN");

    if (!(await normalApplicationBidEconomicsSchemaReady(client))) {
      if (ownTxn) await client.query("COMMIT");
      return { refundedCount: 0, results: [], schemaReady: false };
    }

    const { rows } = await client.query(
      `SELECT * FROM order_freelancer_bid_credit_economics
        WHERE order_id = $1
          AND charge_status = 'charged'
          AND refund_status = 'none'
        ORDER BY id ASC
        FOR UPDATE`,
      [orderId],
    );

    const results = [];
    for (const row of rows) {
      // eslint-disable-next-line no-await-in-loop
      const out = await refundSingleNormalApplicationBidEconomics({
        client,
        economicsRow: row,
        reason: input.reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        actorUserId: input.actorUserId ?? null,
        now: input.now || new Date(),
      });
      results.push(out);
    }

    if (ownTxn) await client.query("COMMIT");
    return {
      refundedCount: results.filter((r) => r.refunded).length,
      results,
      schemaReady: true,
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
  NORMAL_APPLICATION_BID_COST,
  NORMAL_APPLICATION_BID_CONSUME_IDEMPOTENCY_PREFIX,
  NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX,
  REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
  buildNormalApplicationBidConsumeIdempotencyKey,
  buildNormalApplicationBidRefundIdempotencyKey,
  normalApplicationBidEconomicsSchemaReady,
  clearNormalApplicationBidEconomicsSchemaCache,
  quoteNormalApplicationBidCost,
  resolveChargeAmount,
  chargeNormalApplicationBidCreditOnFirstBid,
  refundSingleNormalApplicationBidEconomics,
  refundChargedBidApplicationsForOrderEndedWithoutSelection,
  mapEconomicsRow,
  findEconomicsByOrderFreelancer,
};
