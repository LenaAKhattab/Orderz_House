/**
 * Phase B2 — Normal priced-bid application Bid Credit charge + eligible refund.
 *
 * Surface: order_freelancer_bids / submitPoolOrderBid ONLY (not fixed take).
 * Engine gate: bid_credits_enabled (independent of work_tokens_enabled).
 * Fake/training: never called — controller routes fake to fakeOrdersService.
 * Cost: always NORMAL_APPLICATION_BID_COST (1). No budget×rate math.
 *
 * Refund (owner-approved):
 *   Eligible ONLY when real Order ends with NO Freelancer selected.
 *   - Unexpired source grant → restore 1 Bid to SAME bucket
 *   - Expired source grant → compensating SYSTEM grant (1 Bid, +30 days)
 *   Withdrawal / another Freelancer wins → NO refund
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

const NORMAL_APPLICATION_BID_CONSUME_IDEMPOTENCY_PREFIX =
  "normal_application_bid_consume";
const NORMAL_APPLICATION_BID_REFUND_IDEMPOTENCY_PREFIX =
  "normal_application_bid_refund";
const REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION = "order_ended_without_selection";

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

  const base = {
    applicable: true,
    engineAvailable,
    schemaReady,
    bidCreditCost: NORMAL_APPLICATION_BID_COST,
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
      canApply: available >= NORMAL_APPLICATION_BID_COST,
      orderId: order?.id != null ? String(order.id) : null,
    };
  } finally {
    client.release();
  }
}

/**
 * Charge exactly 1 Bid Credit on first Freelancer+Order priced bid when engine ON.
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

  const existing = await findEconomicsByOrderFreelancer(client, orderId, freelancerUserId);
  if (existing && existing.charge_status === "charged") {
    return {
      charged: false,
      skipped: true,
      reason: "already_charged",
      bidCreditCost: NORMAL_APPLICATION_BID_COST,
      economics: mapEconomicsRow(existing),
    };
  }

  await distribution.reconcileFreelancerBidDistributions({
    client,
    freelancerUserId: Number(freelancerUserId),
    now,
  });

  // E1: membership daily Bid spend gate (unified wallet — before FEFO).
  try {
    const dailySpend = require("./marketplaceMembershipDailyBidSpendService");
    await dailySpend.assertAndConsumeDailyBidSpend({
      client,
      freelancerUserId: Number(freelancerUserId),
      amount: NORMAL_APPLICATION_BID_COST,
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
    amount: NORMAL_APPLICATION_BID_COST,
    idempotencyKey,
    referenceType: "order_freelancer_bid",
    referenceId: String(bidId),
    reason: "normal_application_bid_consume",
    actorUserId: actorUserId != null ? Number(actorUserId) : Number(freelancerUserId),
    metadata: {
      orderId: String(orderId),
      bidId: String(bidId),
      orderSourceType: orderRow?.source_type || null,
      phase: "B2",
    },
    now,
  });

  if (consume.idempotent && existing) {
    return {
      charged: false,
      skipped: true,
      reason: "idempotent_replay",
      bidCreditCost: NORMAL_APPLICATION_BID_COST,
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
      NORMAL_APPLICATION_BID_COST,
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
      bidCreditCost: NORMAL_APPLICATION_BID_COST,
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
    bidCreditCost: NORMAL_APPLICATION_BID_COST,
    availableBidsAfter: availableAfter,
    economics: mapEconomicsRow(rows[0]),
    consume,
  };
}

/**
 * Refund a single charged Bid economics row (100% / 1 Bid) when Order ended without selection.
 * Same-bucket restore if original grant still unexpired; else compensating 30-day grant.
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

  // Prefer primary grant; fall back to first FEFO allocation.
  let grantId =
    locked.primary_grant_id != null
      ? Number(locked.primary_grant_id)
      : Number(locked.fefo_allocations?.[0]?.grantId || 0) || null;

  let grant = null;
  if (grantId) {
    const { rows: gRows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
      [grantId],
    );
    grant = gRows[0] || null;
  }

  const sourceStillValid =
    grant &&
    new Date(grant.expires_at) > instant &&
    Number(grant.amount_consumed) >= NORMAL_APPLICATION_BID_COST;

  let refundMode;
  let refundLedgerEntryId = null;
  let compensatingGrantId = null;

  if (sourceStillValid) {
    refundMode = "same_bucket_restore";
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
      [grant.id, NORMAL_APPLICATION_BID_COST],
    );
    if (!updatedGrant[0]) {
      throw createAppError("Unable to restore Bid Credit to original grant.", 409, {
        exposeToClient: false,
      });
    }

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
        grant.id,
        NORMAL_APPLICATION_BID_COST,
        String(locked.id),
        refundKey,
        reason || REFUND_REASON_ORDER_ENDED_WITHOUT_SELECTION,
        actorUserId,
        JSON.stringify({
          economicsId: String(locked.id),
          orderId: String(locked.order_id),
          bidId: String(locked.bid_id),
          refundMode,
          originalGrantId: String(grant.id),
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
  } else {
    refundMode = "compensating_grant_30d";
    const expiresAt = new Date(
      instant.getTime() + NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS * 86400000,
    );
    const created = await accounting.createBidCreditGrant({
      client,
      freelancerUserId: locked.freelancer_user_id,
      sourceType: "normal_application_refund",
      amount: NORMAL_APPLICATION_BID_COST,
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
        originalGrantId: grantId != null ? String(grantId) : null,
        originalGrantExpired: true,
        compensatingDays: NORMAL_APPLICATION_BID_REFUND_COMPENSATING_DAYS,
      },
      grantedAt: instant,
    });
    compensatingGrantId = created.grant?.id ? Number(created.grant.id) : null;
    // createBidCreditGrant inserts ledger with key ledger:{idempotencyKey}; also store economics refund key.
    const { rows: ledgerRows } = await client.query(
      `SELECT id FROM marketplace_bid_credit_ledger_entries
        WHERE idempotency_key = $1 OR idempotency_key = $2
        ORDER BY id DESC LIMIT 1`,
      [refundKey, `ledger:${refundKey}`],
    );
    refundLedgerEntryId = ledgerRows[0]?.id || null;
  }

  const { rows: marked } = await client.query(
    `UPDATE order_freelancer_bid_credit_economics
        SET refund_status = 'refunded',
            refund_mode = $2,
            refund_ledger_entry_id = COALESCE($3, refund_ledger_entry_id),
            compensating_grant_id = COALESCE($4, compensating_grant_id),
            refund_idempotency_key = COALESCE(refund_idempotency_key, $5),
            refunded_at = COALESCE(refunded_at, NOW()),
            updated_at = NOW()
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
    ],
  );

  if (!marked[0]) {
    const again = await findEconomicsByIdForUpdate(client, locked.id);
    return { refunded: false, idempotent: true, economics: mapEconomicsRow(again) };
  }

  return {
    refunded: true,
    idempotent: false,
    refundMode,
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
  chargeNormalApplicationBidCreditOnFirstBid,
  refundSingleNormalApplicationBidEconomics,
  refundChargedBidApplicationsForOrderEndedWithoutSelection,
  mapEconomicsRow,
  findEconomicsByOrderFreelancer,
};
