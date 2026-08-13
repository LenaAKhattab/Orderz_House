/**
 * Phase B6 — Bid package payment reversal (refund / dispute / partial manual review).
 *
 * Scope: ONLY the grant linked to the affected purchase (package_purchase).
 * No cross-source clawback, no negative balance, no account suspension.
 * Freeze/unfreeze = grant status; revoke = amount_revoked + ledger REVOKE.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const accounting = require("./marketplaceBidCreditAccountingService");
const {
  BID_PACKAGE_PURCHASE_GRANT_SOURCE,
  BID_PACKAGE_PURCHASE_REVOKE_LEDGER_EVENT,
  BID_PACKAGE_PURCHASE_ERROR_CODES,
  BID_PACKAGE_MANUAL_REVIEW_RESOLUTIONS,
  TERMINAL_REVERSAL_STATUSES,
  buildBidPackagePurchaseRevokeIdempotencyKey,
  unusedRemainderFromGrant,
} = require("../constants/marketplaceBidCreditPurchases");

function mapPurchaseRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    packageId: String(row.package_id),
    packageCodeSnapshot: row.package_code_snapshot,
    bidQuantitySnapshot: Number(row.bid_quantity_snapshot),
    priceJodSnapshot: Number(row.price_jod_snapshot),
    currency: row.currency,
    validityDaysSnapshot: Number(row.validity_days_snapshot),
    expectedAmountMinor: Number(row.expected_amount_minor),
    status: row.status,
    paymentReversalStatus: row.payment_reversal_status || "none",
    provider: row.provider,
    stripeCheckoutSessionId: row.stripe_checkout_session_id || null,
    stripePaymentIntentId: row.stripe_payment_intent_id || null,
    stripeRefundId: row.stripe_refund_id || null,
    stripeDisputeId: row.stripe_dispute_id || null,
    fulfilledGrantId: row.fulfilled_grant_id != null ? String(row.fulfilled_grant_id) : null,
    checkoutCreatedAt: row.checkout_created_at || null,
    paidAt: row.paid_at || null,
    fulfilledAt: row.fulfilled_at || null,
    cancelledAt: row.cancelled_at || null,
    failedAt: row.failed_at || null,
    failureReason: row.failure_reason || null,
    providerRefundRecordedAt: row.provider_refund_recorded_at || null,
    providerDisputeRecordedAt: row.provider_dispute_recorded_at || null,
    providerDisputeResolvedAt: row.provider_dispute_resolved_at || null,
    providerRefundStatus: row.provider_refund_status || null,
    providerDisputeStatus: row.provider_dispute_status || null,
    providerRefundAmountMinor:
      row.provider_refund_amount_minor != null ? Number(row.provider_refund_amount_minor) : null,
    consumedBeforeReversal:
      row.consumed_before_reversal != null ? Number(row.consumed_before_reversal) : null,
    unusedRevokedAmount: Number(row.unused_revoked_amount) || 0,
    unusedFrozenAmount: Number(row.unused_frozen_amount) || 0,
    manualReviewRequired: Boolean(row.manual_review_required),
    manualReviewResolution: row.manual_review_resolution || null,
    manualReviewResolvedAt: row.manual_review_resolved_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** Freelancer-safe display status (no provider IDs). */
function freelancerPurchaseDisplayStatus(purchase) {
  if (!purchase) return null;
  const rev = purchase.paymentReversalStatus || "none";
  if (rev === "refunded_full" || rev === "manual_resolved_revoked" || rev === "dispute_lost") {
    return "refunded";
  }
  if (rev === "dispute_open" || rev === "refunded_partial_manual_review") {
    return rev === "dispute_open" ? "payment_disputed" : "under_payment_review";
  }
  if (rev === "manual_resolved_kept_frozen") return "under_payment_review";
  if (purchase.status === "fulfilled") return "completed";
  if (purchase.status === "cancelled") return "cancelled";
  if (purchase.status === "failed") return "failed";
  if (purchase.status === "paid" || purchase.status === "checkout_created") return "processing";
  return purchase.status;
}

async function findPurchaseByIdForUpdate(client, purchaseId) {
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_purchases WHERE id = $1 FOR UPDATE`,
    [Number(purchaseId)],
  );
  return rows[0] || null;
}

async function findPurchaseByPaymentIntent(client, paymentIntentId) {
  if (!paymentIntentId) return null;
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_purchases
      WHERE stripe_payment_intent_id = $1
      ORDER BY id DESC
      LIMIT 1`,
    [String(paymentIntentId)],
  );
  return rows[0] || null;
}

async function lockPurchaseGrant(client, purchase) {
  if (!purchase?.fulfilled_grant_id) return null;
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
    [Number(purchase.fulfilled_grant_id)],
  );
  const grant = rows[0] || null;
  if (grant && grant.source_type !== BID_PACKAGE_PURCHASE_GRANT_SOURCE) {
    throw createAppError("Purchase grant source mismatch — refuse cross-source mutation.", 500, {
      exposeToClient: false,
    });
  }
  return grant;
}

function isTerminalReversal(purchase) {
  return TERMINAL_REVERSAL_STATUSES.has(String(purchase?.payment_reversal_status || "none"));
}

/**
 * Full provider refund → revoke unused remainder of THIS purchase grant only.
 */
async function applyFullBidPackageRefund({
  client,
  purchaseId = null,
  paymentIntentId = null,
  refundId = null,
  refundAmountMinor = null,
  stripeEventId = null,
  now = new Date(),
} = {}) {
  let purchase =
    purchaseId != null
      ? await findPurchaseByIdForUpdate(client, purchaseId)
      : await findPurchaseByPaymentIntent(client, paymentIntentId);
  if (purchase && purchaseId == null) {
    purchase = await findPurchaseByIdForUpdate(client, purchase.id);
  }
  if (!purchase) {
    return { status: "ignored", reason: "purchase_not_found" };
  }
  if (purchase.status !== "fulfilled" || !purchase.fulfilled_grant_id) {
    // Record refund timestamp even if not fulfilled (no Bid grant to revoke).
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET provider_refund_recorded_at = COALESCE(provider_refund_recorded_at, NOW()),
              provider_refund_status = COALESCE(provider_refund_status, 'refunded'),
              stripe_refund_id = COALESCE($2, stripe_refund_id),
              provider_refund_amount_minor = COALESCE($3, provider_refund_amount_minor),
              stripe_event_id = COALESCE($4, stripe_event_id),
              updated_at = NOW()
        WHERE id = $1`,
      [purchase.id, refundId, refundAmountMinor, stripeEventId],
    );
    return { status: "ignored", reason: "purchase_not_fulfilled", purchase: mapPurchaseRow(purchase) };
  }
  if (purchase.payment_reversal_status === "refunded_full") {
    return { status: "already_applied", reason: "already_refunded_full", purchase: mapPurchaseRow(purchase) };
  }
  if (purchase.payment_reversal_status === "dispute_lost") {
    // Already revoked via chargeback — record refund refs only.
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET provider_refund_recorded_at = COALESCE(provider_refund_recorded_at, NOW()),
              provider_refund_status = 'refunded',
              stripe_refund_id = COALESCE($2, stripe_refund_id),
              provider_refund_amount_minor = COALESCE($3, provider_refund_amount_minor),
              updated_at = NOW()
        WHERE id = $1`,
      [purchase.id, refundId, refundAmountMinor],
    );
    return { status: "already_applied", reason: "already_dispute_lost", purchaseId: purchase.id };
  }

  const grant = await lockPurchaseGrant(client, purchase);
  if (!grant) {
    return { status: "ignored", reason: "grant_missing" };
  }

  const consumedBefore = Number(grant.amount_consumed) || 0;
  const revokeKey =
    purchase.revoke_idempotency_key ||
    buildBidPackagePurchaseRevokeIdempotencyKey(purchase.id, "full_refund");

  const rev = await accounting.revokeUnusedBidCreditGrantRemainder({
    client,
    grantId: grant.id,
    idempotencyKey: revokeKey,
    eventType: BID_PACKAGE_PURCHASE_REVOKE_LEDGER_EVENT,
    reason: "bid_package_full_refund",
    referenceType: "marketplace_bid_credit_purchase",
    referenceId: String(purchase.id),
    metadata: {
      purchaseId: String(purchase.id),
      refundId,
      phase: "B6",
      policy: "REVOKE_UNUSED_PURCHASE_BIDS_ONLY",
    },
    now,
  });

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET payment_reversal_status = 'refunded_full',
            provider_refund_recorded_at = COALESCE(provider_refund_recorded_at, NOW()),
            provider_refund_status = 'refunded_full',
            stripe_refund_id = COALESCE($2, stripe_refund_id),
            provider_refund_amount_minor = COALESCE($3, provider_refund_amount_minor),
            stripe_event_id = COALESCE($4, stripe_event_id),
            consumed_before_reversal = COALESCE(consumed_before_reversal, $5),
            unused_revoked_amount = GREATEST(unused_revoked_amount, $6),
            unused_frozen_amount = 0,
            manual_review_required = FALSE,
            revoke_idempotency_key = COALESCE(revoke_idempotency_key, $7),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      purchase.id,
      refundId,
      refundAmountMinor,
      stripeEventId,
      consumedBefore,
      Number(rev.revoked) || 0,
      revokeKey,
    ],
  );

  return {
    status: rev.idempotent ? "already_applied" : "applied",
    reason: "full_refund_revoked_unused",
    revoked: Number(rev.revoked) || 0,
    consumedBefore,
    purchase: mapPurchaseRow(updated[0]),
    grant: rev.grant,
  };
}

/**
 * Partial refund → freeze remainder + manual_review_required (no proportional Bid math).
 */
async function applyPartialBidPackageRefund({
  client,
  purchaseId = null,
  paymentIntentId = null,
  refundId = null,
  refundAmountMinor = null,
  stripeEventId = null,
  now = new Date(),
} = {}) {
  let purchase =
    purchaseId != null
      ? await findPurchaseByIdForUpdate(client, purchaseId)
      : await findPurchaseByPaymentIntent(client, paymentIntentId);
  if (purchase && purchaseId == null) {
    purchase = await findPurchaseByIdForUpdate(client, purchase.id);
  }
  if (!purchase) return { status: "ignored", reason: "purchase_not_found" };
  if (isTerminalReversal(purchase)) {
    return { status: "ignored", reason: "terminal_reversal", purchase: mapPurchaseRow(purchase) };
  }
  if (purchase.payment_reversal_status === "refunded_partial_manual_review") {
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET provider_refund_recorded_at = COALESCE(provider_refund_recorded_at, NOW()),
              provider_refund_amount_minor = COALESCE($2, provider_refund_amount_minor),
              stripe_refund_id = COALESCE($3, stripe_refund_id),
              updated_at = NOW()
        WHERE id = $1`,
      [purchase.id, refundAmountMinor, refundId],
    );
    return { status: "already_applied", reason: "already_partial_review" };
  }

  const grant = await lockPurchaseGrant(client, purchase);
  let freezeResult = { frozen: false, unused: 0 };
  if (grant && purchase.status === "fulfilled") {
    freezeResult = await accounting.freezeBidCreditGrant({
      client,
      grantId: grant.id,
      reason: "partial_refund_manual_review",
      now,
    });
  }

  const consumedBefore = grant ? Number(grant.amount_consumed) || 0 : null;
  const unused = grant ? unusedRemainderFromGrant(grant) : 0;

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET payment_reversal_status = 'refunded_partial_manual_review',
            provider_refund_recorded_at = COALESCE(provider_refund_recorded_at, NOW()),
            provider_refund_status = 'partial',
            stripe_refund_id = COALESCE($2, stripe_refund_id),
            provider_refund_amount_minor = COALESCE($3, provider_refund_amount_minor),
            stripe_event_id = COALESCE($4, stripe_event_id),
            consumed_before_reversal = COALESCE(consumed_before_reversal, $5),
            unused_frozen_amount = GREATEST(unused_frozen_amount, $6),
            manual_review_required = TRUE,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [purchase.id, refundId, refundAmountMinor, stripeEventId, consumedBefore, unused],
  );

  return {
    status: "applied",
    reason: "partial_refund_manual_review",
    frozen: Boolean(freezeResult.frozen || freezeResult.reason === "already_frozen"),
    purchase: mapPurchaseRow(updated[0]),
  };
}

async function applyBidPackageDisputeOpened({
  client,
  purchaseId = null,
  paymentIntentId = null,
  disputeId = null,
  disputeStatus = null,
  stripeEventId = null,
  now = new Date(),
} = {}) {
  let purchase =
    purchaseId != null
      ? await findPurchaseByIdForUpdate(client, purchaseId)
      : await findPurchaseByPaymentIntent(client, paymentIntentId);
  if (purchase && purchaseId == null) {
    purchase = await findPurchaseByIdForUpdate(client, purchase.id);
  }
  if (!purchase) return { status: "ignored", reason: "purchase_not_found" };
  if (isTerminalReversal(purchase)) {
    return { status: "ignored", reason: "terminal_reversal", purchase: mapPurchaseRow(purchase) };
  }
  if (purchase.payment_reversal_status === "dispute_open") {
    return { status: "already_applied", reason: "already_dispute_open", purchase: mapPurchaseRow(purchase) };
  }

  const grant = await lockPurchaseGrant(client, purchase);
  let freezeResult = { frozen: false };
  const unused = grant ? unusedRemainderFromGrant(grant) : 0;
  const consumedBefore = grant ? Number(grant.amount_consumed) || 0 : null;
  if (grant && purchase.status === "fulfilled") {
    freezeResult = await accounting.freezeBidCreditGrant({
      client,
      grantId: grant.id,
      reason: "payment_dispute_open",
      now,
    });
  }

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET payment_reversal_status = 'dispute_open',
            provider_dispute_recorded_at = COALESCE(provider_dispute_recorded_at, NOW()),
            provider_dispute_status = COALESCE($2, provider_dispute_status, 'open'),
            stripe_dispute_id = COALESCE($3, stripe_dispute_id),
            stripe_event_id = COALESCE($4, stripe_event_id),
            consumed_before_reversal = COALESCE(consumed_before_reversal, $5),
            unused_frozen_amount = GREATEST(unused_frozen_amount, $6),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [purchase.id, disputeStatus, disputeId, stripeEventId, consumedBefore, unused],
  );

  return {
    status: "applied",
    reason: "dispute_opened_frozen",
    frozen: Boolean(freezeResult.frozen || freezeResult.reason === "already_frozen"),
    purchase: mapPurchaseRow(updated[0]),
    accountSuspended: false,
  };
}

async function applyBidPackageDisputeWon({
  client,
  purchaseId = null,
  paymentIntentId = null,
  disputeId = null,
  disputeStatus = null,
  stripeEventId = null,
  now = new Date(),
} = {}) {
  let purchase =
    purchaseId != null
      ? await findPurchaseByIdForUpdate(client, purchaseId)
      : await findPurchaseByPaymentIntent(client, paymentIntentId);
  if (purchase && purchaseId == null) {
    purchase = await findPurchaseByIdForUpdate(client, purchase.id);
  }
  if (!purchase) return { status: "ignored", reason: "purchase_not_found" };
  if (isTerminalReversal(purchase)) {
    return { status: "ignored", reason: "terminal_reversal" };
  }
  if (purchase.payment_reversal_status === "dispute_won") {
    return { status: "already_applied", reason: "already_dispute_won" };
  }

  const grant = await lockPurchaseGrant(client, purchase);
  let unfreezeResult = { unfrozen: false, reason: "no_grant" };
  if (grant) {
    unfreezeResult = await accounting.unfreezeBidCreditGrant({
      client,
      grantId: grant.id,
      now,
    });
  }

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET payment_reversal_status = 'dispute_won',
            provider_dispute_resolved_at = COALESCE(provider_dispute_resolved_at, NOW()),
            provider_dispute_status = COALESCE($2, 'won'),
            stripe_dispute_id = COALESCE($3, stripe_dispute_id),
            stripe_event_id = COALESCE($4, stripe_event_id),
            unused_frozen_amount = 0,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [purchase.id, disputeStatus || "won", disputeId, stripeEventId],
  );

  return {
    status: "applied",
    reason: unfreezeResult.unfrozen
      ? "dispute_won_unfrozen"
      : unfreezeResult.reason || "dispute_won",
    unfrozen: Boolean(unfreezeResult.unfrozen),
    purchase: mapPurchaseRow(updated[0]),
    grant: unfreezeResult.grant || null,
  };
}

async function applyBidPackageDisputeLost({
  client,
  purchaseId = null,
  paymentIntentId = null,
  disputeId = null,
  disputeStatus = null,
  stripeEventId = null,
  now = new Date(),
} = {}) {
  let purchase =
    purchaseId != null
      ? await findPurchaseByIdForUpdate(client, purchaseId)
      : await findPurchaseByPaymentIntent(client, paymentIntentId);
  if (purchase && purchaseId == null) {
    purchase = await findPurchaseByIdForUpdate(client, purchase.id);
  }
  if (!purchase) return { status: "ignored", reason: "purchase_not_found" };
  if (purchase.payment_reversal_status === "dispute_lost" || purchase.payment_reversal_status === "refunded_full") {
    return { status: "already_applied", reason: "already_terminal" };
  }

  const grant = await lockPurchaseGrant(client, purchase);
  const consumedBefore = grant ? Number(grant.amount_consumed) || 0 : 0;
  let rev = { revoked: 0 };
  if (grant && purchase.status === "fulfilled") {
    const revokeKey =
      purchase.revoke_idempotency_key ||
      buildBidPackagePurchaseRevokeIdempotencyKey(purchase.id, "dispute_lost");
    rev = await accounting.revokeUnusedBidCreditGrantRemainder({
      client,
      grantId: grant.id,
      idempotencyKey: revokeKey,
      eventType: BID_PACKAGE_PURCHASE_REVOKE_LEDGER_EVENT,
      reason: "bid_package_dispute_lost",
      referenceType: "marketplace_bid_credit_purchase",
      referenceId: String(purchase.id),
      metadata: { purchaseId: String(purchase.id), disputeId, phase: "B6" },
      now,
    });
    await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET revoke_idempotency_key = COALESCE(revoke_idempotency_key, $2)
        WHERE id = $1`,
      [purchase.id, revokeKey],
    );
  }

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_purchases
        SET payment_reversal_status = 'dispute_lost',
            provider_dispute_resolved_at = COALESCE(provider_dispute_resolved_at, NOW()),
            provider_dispute_status = COALESCE($2, 'lost'),
            stripe_dispute_id = COALESCE($3, stripe_dispute_id),
            stripe_event_id = COALESCE($4, stripe_event_id),
            consumed_before_reversal = COALESCE(consumed_before_reversal, $5),
            unused_revoked_amount = GREATEST(unused_revoked_amount, $6),
            unused_frozen_amount = 0,
            manual_review_required = FALSE,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      purchase.id,
      disputeStatus || "lost",
      disputeId,
      stripeEventId,
      consumedBefore,
      Number(rev.revoked) || 0,
    ],
  );

  return {
    status: rev.idempotent ? "already_applied" : "applied",
    reason: "dispute_lost_revoked_unused",
    revoked: Number(rev.revoked) || 0,
    consumedBefore,
    purchase: mapPurchaseRow(updated[0]),
  };
}

/**
 * Super Admin: resolve partial-refund manual review.
 * Allowed: keep_frozen | release_remaining | revoke_remaining
 */
async function resolveBidPackagePartialRefundManualReview({
  purchaseId,
  resolution,
  actorUserId,
  note = null,
  now = new Date(),
} = {}) {
  const res = String(resolution || "").trim();
  if (!BID_PACKAGE_MANUAL_REVIEW_RESOLUTIONS.includes(res)) {
    throw createAppError("Invalid manual review resolution.", 400, {
      exposeToClient: true,
      publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_REVERSAL_NOT_ALLOWED,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const purchase = await findPurchaseByIdForUpdate(client, purchaseId);
    if (!purchase) {
      throw createAppError("Purchase not found.", 404, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_NOT_FOUND,
      });
    }
    if (!purchase.manual_review_required) {
      throw createAppError("Purchase is not awaiting manual review.", 409, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_REVERSAL_NOT_ALLOWED,
      });
    }
    if (isTerminalReversal(purchase)) {
      throw createAppError("Purchase reversal is already terminal.", 409, {
        exposeToClient: true,
        publicCode: BID_PACKAGE_PURCHASE_ERROR_CODES.BID_PURCHASE_REVERSAL_NOT_ALLOWED,
      });
    }

    const grant = await lockPurchaseGrant(client, purchase);
    let outcome = { resolution: res };
    let nextStatus = "manual_resolved_kept_frozen";

    if (res === "keep_frozen") {
      if (grant) {
        await accounting.freezeBidCreditGrant({
          client,
          grantId: grant.id,
          reason: "manual_review_keep_frozen",
          now,
        });
      }
      nextStatus = "manual_resolved_kept_frozen";
    } else if (res === "release_remaining") {
      if (grant) {
        outcome.unfreeze = await accounting.unfreezeBidCreditGrant({
          client,
          grantId: grant.id,
          now,
        });
      }
      nextStatus = "manual_resolved_released";
    } else if (res === "revoke_remaining") {
      if (grant) {
        const revokeKey = buildBidPackagePurchaseRevokeIdempotencyKey(
          purchase.id,
          "manual_revoke",
        );
        outcome.revoke = await accounting.revokeUnusedBidCreditGrantRemainder({
          client,
          grantId: grant.id,
          idempotencyKey: revokeKey,
          eventType: BID_PACKAGE_PURCHASE_REVOKE_LEDGER_EVENT,
          reason: "bid_package_manual_revoke",
          referenceType: "marketplace_bid_credit_purchase",
          referenceId: String(purchase.id),
          actorUserId,
          metadata: { purchaseId: String(purchase.id), resolution: res },
          now,
        });
      }
      nextStatus = "manual_resolved_revoked";
    }

    const { rows: updated } = await client.query(
      `UPDATE marketplace_bid_credit_purchases
          SET payment_reversal_status = $2::varchar,
              manual_review_required = FALSE,
              manual_review_resolution = $3::varchar,
              manual_review_resolved_at = NOW(),
              manual_review_actor_user_id = $4,
              manual_review_note = $5,
              unused_frozen_amount = CASE WHEN $2::text = 'manual_resolved_released' THEN 0 ELSE unused_frozen_amount END,
              unused_revoked_amount = CASE
                WHEN $2::text = 'manual_resolved_revoked' THEN GREATEST(unused_revoked_amount, $6::int)
                ELSE unused_revoked_amount
              END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        purchase.id,
        nextStatus,
        res,
        actorUserId,
        note,
        Number(outcome.revoke?.revoked) || 0,
      ],
    );

    await client.query("COMMIT");
    return { purchase: mapPurchaseRow(updated[0]), outcome };
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
 * Webhook entry: classify charge.refunded as full vs partial against purchase snapshot.
 */
async function applyVerifiedChargeRefunded(charge, meta = {}, dbPool = pool) {
  const purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);
  const piId =
    typeof charge?.payment_intent === "string"
      ? charge.payment_intent
      : charge?.payment_intent?.id || null;
  const amount = charge?.amount != null ? Number(charge.amount) : null;
  const amountRefunded =
    charge?.amount_refunded != null ? Number(charge.amount_refunded) : null;
  const refundId =
    Array.isArray(charge?.refunds?.data) && charge.refunds.data[0]
      ? charge.refunds.data[0].id
      : charge?.id || null;

  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    let purchase =
      purchaseId > 0
        ? await findPurchaseByIdForUpdate(client, purchaseId)
        : await findPurchaseByPaymentIntent(client, piId);
    if (purchase && purchaseId <= 0) {
      purchase = await findPurchaseByIdForUpdate(client, purchase.id);
    }
    if (!purchase) {
      await client.query("COMMIT");
      return { status: "ignored", reason: "bid_pkg_refund_purchase_not_found" };
    }

    const expected = Number(purchase.expected_amount_minor);
    const isFull =
      amountRefunded != null &&
      expected > 0 &&
      amountRefunded >= expected &&
      (amount == null || amountRefunded >= amount);

    const result = isFull
      ? await applyFullBidPackageRefund({
          client,
          purchaseId: purchase.id,
          refundId,
          refundAmountMinor: amountRefunded,
        })
      : await applyPartialBidPackageRefund({
          client,
          purchaseId: purchase.id,
          refundId,
          refundAmountMinor: amountRefunded,
        });
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

async function applyVerifiedDisputeEvent(dispute, eventType, meta = {}, dbPool = pool) {
  const purchaseId = Number(meta.purchaseId || meta.purchase_id || 0);
  const piId =
    typeof dispute?.payment_intent === "string"
      ? dispute.payment_intent
      : dispute?.payment_intent?.id || null;
  const disputeId = dispute?.id || null;
  const disputeStatus = dispute?.status || null;
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    let purchase =
      purchaseId > 0
        ? await findPurchaseByIdForUpdate(client, purchaseId)
        : await findPurchaseByPaymentIntent(client, piId);
    if (purchase && purchaseId <= 0) {
      purchase = await findPurchaseByIdForUpdate(client, purchase.id);
    }
    if (!purchase) {
      await client.query("COMMIT");
      return { status: "ignored", reason: "bid_pkg_dispute_purchase_not_found" };
    }

    let result;
    if (eventType === "charge.dispute.created") {
      result = await applyBidPackageDisputeOpened({
        client,
        purchaseId: purchase.id,
        disputeId,
        disputeStatus,
      });
    } else {
      const st = String(disputeStatus || "").toLowerCase();
      if (st === "won" || st === "warning_closed") {
        result = await applyBidPackageDisputeWon({
          client,
          purchaseId: purchase.id,
          disputeId,
          disputeStatus: st,
        });
      } else if (
        st === "lost" ||
        st === "charge_refunded" ||
        String(eventType).includes("funds_withdrawn")
      ) {
        result = await applyBidPackageDisputeLost({
          client,
          purchaseId: purchase.id,
          disputeId,
          disputeStatus: st || "lost",
        });
      } else if (String(eventType).includes("closed")) {
        // Closed without clear status — do not invent; leave frozen if open.
        result = {
          status: "ignored",
          reason: `dispute_status_${st || "unknown"}`,
        };
      } else {
        result = {
          status: "ignored",
          reason: `dispute_status_${st || "unknown"}`,
        };
      }
    }
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

module.exports = {
  mapPurchaseRow,
  freelancerPurchaseDisplayStatus,
  applyFullBidPackageRefund,
  applyPartialBidPackageRefund,
  applyBidPackageDisputeOpened,
  applyBidPackageDisputeWon,
  applyBidPackageDisputeLost,
  resolveBidPackagePartialRefundManualReview,
  applyVerifiedChargeRefunded,
  applyVerifiedDisputeEvent,
  unusedRemainderFromGrant,
};
