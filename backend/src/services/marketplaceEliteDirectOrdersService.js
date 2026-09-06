/**
 * Phase 8 — Elite Direct Orders: private exclusive timed offer to ONE Elite Freelancer.
 * Engine gated by elite_engine_enabled (default OFF). 0 Work Tokens. Distinct entitlement.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isEliteEngineActive,
  assertMarketplaceEconomyRealOrdersOnly,
} = require("./marketplaceEconomySettingsService");
const {
  ELITE_DIRECT_ORDER_ERROR_CODES,
  ELITE_REASON_CODES,
  ELITE_DIRECT_ORDER_WORK_TOKEN_COST,
  ELITE_OFFER_TERMINAL_STATUSES,
} = require("../constants/marketplaceEliteDirectOrders");
const { isBenefitUsableStatus } = require("../constants/marketplaceMemberships");
const entitlement = require("./marketplaceEliteDirectOrderEntitlementService");
const notificationService = require("./notificationService");

const FAKE_TRAINING_ELITE_DIRECT_ORDER_LINKAGE = "NONE";
const ELITE_HISTORICAL_BACKFILL = "NONE";

function assertEngineActive(settings) {
  if (!isEliteEngineActive(settings)) {
    throw createAppError("Elite Direct Order engine is off.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ENGINE_OFF,
    });
  }
}

async function eliteOffersSchemaReady(client) {
  const { rows } = await client.query(`SELECT to_regclass('public.elite_direct_offers') AS t`);
  return Boolean(rows[0]?.t);
}

function mapOffer(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    creatorUserId: String(row.creator_user_id),
    creatorRole: row.creator_role,
    creationSource: row.creation_source,
    targetFreelancerUserId: String(row.target_freelancer_user_id),
    targetMembershipId: String(row.target_membership_id),
    targetCycleId: String(row.target_cycle_id),
    tierCodeSnapshot: row.tier_code_snapshot,
    eliteCapabilitySnapshot: Boolean(row.elite_capability_snapshot),
    entitlementQuantity: Number(row.entitlement_quantity) || 1,
    reserveEventId: row.reserve_event_id != null ? String(row.reserve_event_id) : null,
    consumeEventId: row.consume_event_id != null ? String(row.consume_event_id) : null,
    releaseEventId: row.release_event_id != null ? String(row.release_event_id) : null,
    status: row.status,
    reasonCode: row.reason_code || null,
    durationMinutesSnapshot: Number(row.duration_minutes_snapshot),
    offeredAt: row.offered_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at || null,
    declinedAt: row.declined_at || null,
    expiredAt: row.expired_at || null,
    cancelledAt: row.cancelled_at || null,
    selectedBidId: row.selected_bid_id != null ? String(row.selected_bid_id) : null,
    assignmentReference: row.assignment_reference || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    metadata: row.metadata_json || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    workTokenCost: ELITE_DIRECT_ORDER_WORK_TOKEN_COST,
  };
}

async function withTxn(externalClient, fn) {
  if (externalClient) return fn(externalClient);
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

/** Run after COMMIT so a failed INSERT cannot abort the business transaction. */
async function afterCommitNotify(externalClient, fn) {
  if (externalClient) {
    try {
      await externalClient.query("SAVEPOINT elite_notify");
      await fn(externalClient);
      await externalClient.query("RELEASE SAVEPOINT elite_notify");
    } catch {
      try {
        await externalClient.query("ROLLBACK TO SAVEPOINT elite_notify");
      } catch {
        /* ignore */
      }
    }
    return;
  }
  await notifySafe(() => fn(null));
}

async function lockOrder(client, orderId) {
  const { rows } = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [
    Number(orderId),
  ]);
  return rows[0] || null;
}

async function lockOffer(client, offerId) {
  const { rows } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1 FOR UPDATE`, [
    Number(offerId),
  ]);
  return rows[0] || null;
}

async function getPendingOfferForOrder(client, orderId) {
  const { rows } = await client.query(
    `SELECT * FROM elite_direct_offers WHERE order_id = $1 AND status = 'pending' LIMIT 1`,
    [Number(orderId)],
  );
  return rows[0] || null;
}

/**
 * Used by Priority Auction create to refuse when an Elite offer is PENDING.
 */
async function assertNoPendingEliteOfferBlockingAuction(client, orderId) {
  if (!(await eliteOffersSchemaReady(client))) return { blocked: false };
  const pending = await getPendingOfferForOrder(client, orderId);
  if (pending) {
    throw createAppError(
      "An Elite Direct Offer is pending for this Order. Resolve or cancel it before starting a Priority Auction.",
      409,
      {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ACTIVE_OFFER_EXISTS,
      },
    );
  }
  return { blocked: false };
}

function assertRealOrderEligibleForElite(order) {
  if (!order) {
    throw createAppError("Order not found.", 404, { exposeToClient: true });
  }
  assertMarketplaceEconomyRealOrdersOnly({
    kind: "real",
    orderSource: order.source_type,
    isFake: false,
    isTraining: false,
  });
  const src = String(order.source_type || "").toLowerCase();
  if (src === "fake" || src === "training") {
    throw createAppError("Fake/training orders cannot use Elite Direct Orders.", 403, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_FAKE_TRAINING_FORBIDDEN,
    });
  }
  if (order.assigned_freelancer_id || order.accepted_freelancer_id || order.received_at) {
    throw createAppError("Order already has an assigned Freelancer.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ORDER_NOT_ELIGIBLE,
    });
  }
  const status = String(order.order_status || "");
  if (status === "cancelled" || order.is_archived === true) {
    throw createAppError("Order is not eligible for Elite Direct Offer.", 409, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ORDER_NOT_ELIGIBLE,
    });
  }
  // Fixed-take pool claims are separate — do not classify fixed as Elite path for claimPoolOrder,
  // but creator may still send Elite on a bidding/real order. Fixed project_type without payment
  // can use direct assignment on accept.
  if (String(order.project_type) === "fixed" && order.payment_required !== true) {
    // allowed — internal/funded fixed may accept into assignment
  }
}

/**
 * Creator may create Elite offer if they can already create/manage the Order.
 * Client owner OR staff managing admin/partner-created Order. Freelancers never.
 */
function assertCreatorAuthorized(order, { actorUserId, actorRole, creationSource }) {
  const role = String(actorRole || "").toLowerCase();
  const uid = Number(actorUserId);
  if (role === "freelancer") {
    throw createAppError("Freelancers cannot create Elite Direct Offers.", 403, {
      exposeToClient: true,
      publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_CREATOR,
    });
  }
  if (role === "client") {
    if (
      String(order.source_type) !== "client_created" ||
      Number(order.created_by_user_id) !== uid
    ) {
      throw createAppError("Not authorized to create Elite Direct Offer on this Order.", 403, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_CREATOR,
      });
    }
    return { creatorRole: "client", creationSource: creationSource || "client" };
  }
  if (role === "admin" || role === "super_admin" || role === "partner" || role === "internal") {
    // Staff/partner already must have reached this via existing order-management RBAC.
    const src = String(order.source_type || "");
    if (src === "client_created" && Number(order.created_by_user_id) !== uid) {
      // Staff managing client orders is allowed only when existing admin flows permit;
      // Phase 8 reuses that gate at the route layer. Here allow staff roles.
    }
    return {
      creatorRole: role === "super_admin" ? "super_admin" : role === "admin" ? "admin" : role,
      creationSource: creationSource || "internal",
    };
  }
  throw createAppError("Not authorized to create Elite Direct Offer.", 403, {
    exposeToClient: true,
    publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_CREATOR,
  });
}

/**
 * Load target Elite eligibility (Marketplace Membership — not legacy subscriptions).
 */
async function loadEliteTargetEligibility(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT m.id AS membership_id,
            m.status AS membership_status,
            m.is_current,
            m.freelancer_user_id,
            p.tier_code,
            p.elite_direct_orders_enabled,
            c.id AS cycle_id,
            c.elite_direct_orders_allowed,
            c.elite_direct_orders_reserved,
            c.elite_direct_orders_consumed,
            c.status AS cycle_status
     FROM freelancer_marketplace_memberships m
     JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
     LEFT JOIN marketplace_membership_cycles c
       ON c.membership_id = m.id AND c.status = 'active'
     WHERE m.freelancer_user_id = $1
       AND m.is_current = TRUE
     LIMIT 1
     FOR UPDATE OF m`,
    [Number(freelancerUserId)],
  );
  const row = rows[0];
  if (!row) {
    return { eligible: false, reason: "NO_CURRENT_MEMBERSHIP" };
  }
  if (!isBenefitUsableStatus(row.membership_status)) {
    return { eligible: false, reason: "MEMBERSHIP_NOT_USABLE", row };
  }
  if (String(row.tier_code || "").toLowerCase() !== "elite") {
    return { eligible: false, reason: "NOT_ELITE_TIER", row };
  }
  if (!(row.elite_direct_orders_enabled === true || row.elite_direct_orders_enabled === "t")) {
    return { eligible: false, reason: "ELITE_CAPABILITY_OFF", row };
  }
  if (!row.cycle_id) {
    return { eligible: false, reason: "NO_ACTIVE_CYCLE", row };
  }
  const available = entitlement.availableFromCycle(row);
  return {
    eligible: true,
    available,
    row,
    membershipId: row.membership_id,
    cycleId: row.cycle_id,
    tierCode: row.tier_code,
    eliteCapability: true,
  };
}

function resolveEliteAcceptAmount(order) {
  if (order.bid_budget_min != null && Number(order.bid_budget_min) > 0) {
    return Number(order.bid_budget_min);
  }
  if (order.budget != null && Number(order.budget) > 0) {
    return Number(order.budget);
  }
  return null;
}

/**
 * Soft-select or assign after Elite accept — reuses selected_pending_payment when payment required.
 * Creates/updates a money bid WITHOUT Work Token charge (Elite cost = 0).
 */
async function applyEliteAcceptanceToOrder(client, { order, freelancerUserId, offerId, actorUserId }) {
  const amount = resolveEliteAcceptAmount(order);
  let moneyBidId = null;

  if (order.payment_required === true) {
    if (amount == null) {
      throw createAppError("Order requires payment but has no bid/budget amount for Elite selection.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ORDER_NOT_ELIGIBLE,
      });
    }
    const { rows: bidRows } = await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status, is_fake_bid, fake_round_id)
       VALUES ($1, $2, $3, 'selected_pending_payment', FALSE, NULL)
       ON CONFLICT (order_id, freelancer_user_id)
       DO UPDATE SET amount = EXCLUDED.amount,
                     status = 'selected_pending_payment',
                     is_fake_bid = FALSE,
                     fake_round_id = NULL,
                     updated_at = NOW()
       RETURNING id`,
      [Number(order.id), Number(freelancerUserId), amount],
    );
    moneyBidId = bidRows[0].id;
    await client.query(
      `UPDATE order_freelancer_bids
          SET status = 'rejected', updated_at = NOW()
        WHERE order_id = $1 AND id <> $2 AND status IN ('pending', 'selected_pending_payment')`,
      [Number(order.id), Number(moneyBidId)],
    );
    await client.query(
      `UPDATE orders
          SET selected_bid_id = $2,
              is_open_for_pool = FALSE,
              order_status = 'awaiting_payment_after_bid_selection',
              updated_at = NOW()
        WHERE id = $1 AND assigned_freelancer_id IS NULL`,
      [Number(order.id), Number(moneyBidId)],
    );

    const fairDist = require("./marketplaceFairDistributionService");
    await fairDist.recordAwarded({
      client,
      order,
      freelancerUserId,
      referenceType: "elite_direct_offer",
      referenceId: offerId,
      actorRole: "system",
      actorUserId,
      reason: "elite_accepted_selected_pending_payment",
      metadata: { pendingPayment: true, eliteOfferId: String(offerId) },
    });

    return {
      mode: "selected_pending_payment",
      moneyBidId: String(moneyBidId),
      assignmentReference: `selected_pending_payment:bid:${moneyBidId}`,
      effectiveAssigned: false,
    };
  }

  // Non-payment / pre-authorized: effective assignment
  const receivedAt = new Date();
  if (amount != null) {
    const { rows: bidRows } = await client.query(
      `INSERT INTO order_freelancer_bids (order_id, freelancer_user_id, amount, status, is_fake_bid, fake_round_id)
       VALUES ($1, $2, $3, 'accepted', FALSE, NULL)
       ON CONFLICT (order_id, freelancer_user_id)
       DO UPDATE SET amount = EXCLUDED.amount,
                     status = 'accepted',
                     is_fake_bid = FALSE,
                     fake_round_id = NULL,
                     updated_at = NOW()
       RETURNING id`,
      [Number(order.id), Number(freelancerUserId), amount],
    );
    moneyBidId = bidRows[0].id;
  }
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
      Number(freelancerUserId),
      moneyBidId != null ? Number(moneyBidId) : null,
      receivedAt,
    ],
  );

  const fairDist = require("./marketplaceFairDistributionService");
  await fairDist.recordAwarded({
    client,
    order,
    freelancerUserId,
    referenceType: "elite_direct_offer",
    referenceId: offerId,
    actorRole: "system",
    actorUserId,
    reason: "elite_accepted_assigned",
    metadata: { eliteOfferId: String(offerId) },
  });
  await fairDist.recordEffectiveAssignment({
    client,
    order,
    freelancerUserId,
    referenceType: "elite_direct_offer",
    referenceId: offerId,
    actorRole: "system",
    actorUserId,
    reason: "elite_accepted_effective_assignment",
    occurredAt: receivedAt,
    metadata: { eliteOfferId: String(offerId) },
  });

  return {
    mode: "assigned",
    moneyBidId: moneyBidId != null ? String(moneyBidId) : null,
    assignmentReference: `assigned:freelancer:${freelancerUserId}`,
    effectiveAssigned: true,
  };
}

async function notifySafe(fn) {
  try {
    await fn();
  } catch {
    /* never fail txn on notification */
  }
}

async function createEliteDirectOffer({
  orderId,
  targetFreelancerUserId,
  actorUserId,
  actorRole,
  creationSource = null,
  idempotencyKey = null,
  client: externalClient = null,
} = {}) {
  return withTxn(externalClient, async (client) => {
    if (!(await eliteOffersSchemaReady(client))) {
      throw createAppError("Elite Direct Order schema missing.", 503, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_SCHEMA_MISSING,
      });
    }
    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    // Idempotent create by client key
    if (idempotencyKey) {
      const { rows: existing } = await client.query(
        `SELECT * FROM elite_direct_offers
         WHERE metadata_json->>'idempotencyKey' = $1
         LIMIT 1`,
        [String(idempotencyKey)],
      );
      if (existing[0]) {
        return { offer: mapOffer(existing[0]), created: false, idempotent: true };
      }
    }

    // Phase 6.1 order-first lock
    const order = await lockOrder(client, orderId);
    assertRealOrderEligibleForElite(order);
    const auth = assertCreatorAuthorized(order, { actorUserId, actorRole, creationSource });

    const pending = await getPendingOfferForOrder(client, order.id);
    if (pending) {
      throw createAppError("An active Elite Direct Offer already exists for this Order.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ACTIVE_OFFER_EXISTS,
      });
    }

    const priorityAuctionService = require("./marketplacePriorityAuctionService");
    await priorityAuctionService.assertNoActivePriorityAuctionBlockingAssignment(client, order.id);

    const targetId = Number(targetFreelancerUserId);
    if (!Number.isInteger(targetId) || targetId < 1) {
      throw createAppError("Invalid Elite target Freelancer.", 400, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_TARGET_INELIGIBLE,
      });
    }

    const eligibility = await loadEliteTargetEligibility(client, targetId);
    if (!eligibility.eligible) {
      throw createAppError("Target Freelancer is not Elite-eligible.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_TARGET_INELIGIBLE,
        details: { reason: eligibility.reason },
      });
    }
    if (eligibility.available < 1) {
      throw createAppError("Elite Direct Order entitlement unavailable.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_DIRECT_ORDER_ENTITLEMENT_UNAVAILABLE,
      });
    }

    const durationMinutes = Number(settings.eliteOfferDurationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      throw createAppError("Invalid eliteOfferDurationMinutes setting.", 500, {
        exposeToClient: false,
      });
    }

    const { rows: nowRows } = await client.query(`SELECT NOW() AS now`);
    const offeredAt = nowRows[0].now;
    const { rows: endRows } = await client.query(
      `SELECT ($1::timestamptz + make_interval(mins => $2::int)) AS expires_at`,
      [offeredAt, durationMinutes],
    );
    const expiresAt = endRows[0].expires_at;

    let offerRow;
    try {
      const inserted = await client.query(
        `INSERT INTO elite_direct_offers (
           order_id, creator_user_id, creator_role, creation_source,
           target_freelancer_user_id, target_membership_id, target_cycle_id,
           tier_code_snapshot, elite_capability_snapshot, entitlement_quantity,
           status, duration_minutes_snapshot, offered_at, expires_at,
           actor_user_id, metadata_json
         ) VALUES (
           $1,$2,$3,$4,
           $5,$6,$7,
           $8,TRUE,1,
           'pending',$9,$10,$11,
           $12,$13::jsonb
         )
         RETURNING *`,
        [
          Number(order.id),
          Number(actorUserId),
          auth.creatorRole,
          auth.creationSource,
          targetId,
          Number(eligibility.membershipId),
          Number(eligibility.cycleId),
          String(eligibility.tierCode),
          durationMinutes,
          offeredAt,
          expiresAt,
          Number(actorUserId),
          JSON.stringify({
            idempotencyKey: idempotencyKey || null,
            wasOpenForPool: Boolean(order.is_open_for_pool),
          }),
        ],
      );
      offerRow = inserted.rows[0];
    } catch (err) {
      if (err && err.code === "23505") {
        throw createAppError("An active Elite Direct Offer already exists for this Order.", 409, {
          exposeToClient: true,
          publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_ACTIVE_OFFER_EXISTS,
        });
      }
      throw err;
    }

    const reserveOut = await entitlement.reserveEliteDirectOrderEntitlement({
      client,
      freelancerUserId: targetId,
      referenceType: "elite_direct_offer",
      referenceId: String(offerRow.id),
      actorUserId,
      reason: "elite_offer_create_reserve",
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET reserve_event_id = $2, updated_at = NOW()
        WHERE id = $1`,
      [offerRow.id, reserveOut.event.id],
    );

    // Private while pending — not in public Freelancer pool
    await client.query(
      `UPDATE orders SET is_open_for_pool = FALSE, updated_at = NOW() WHERE id = $1`,
      [Number(order.id)],
    );

    const { rows: refreshed } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [
      offerRow.id,
    ]);
    offerRow = refreshed[0];

    return {
      offer: mapOffer(offerRow),
      created: true,
      idempotent: false,
      _notify: {
        kind: "created",
        targetId,
        actorUserId: Number(actorUserId),
        offerId: Number(offerRow.id),
        orderId: Number(order.id),
        expiresAt,
      },
    };
  }).then(async (out) => {
    if (out && out._notify && out._notify.kind === "created") {
      const n = out._notify;
      await afterCommitNotify(externalClient, (client) =>
        notificationService.createIfNotExists(
          {
            recipientUserId: n.targetId,
            recipientRole: "freelancer",
            actorUserId: n.actorUserId,
            type: "elite_direct_offer.created",
            title: "عرض Elite Direct جديد",
            message: "وصلك عرض Elite Direct خاص — راجع وقبول أو رفض قبل انتهاء المدة.",
            entityType: "elite_direct_offer",
            entityId: n.offerId,
            link: `/dashboard/freelancer/elite-offers/${encodeURIComponent(String(n.offerId))}`,
            priority: "high",
            metadata: {
              offerId: String(n.offerId),
              orderId: String(n.orderId),
              expiresAt: n.expiresAt,
            },
          },
          `elite_offer_created_${String(n.offerId)}`,
          client,
        ),
      );
    }
    if (out && out._notify) delete out._notify;
    return out;
  });
}

async function acceptEliteDirectOffer({
  offerId,
  freelancerUserId,
  client: externalClient = null,
} = {}) {
  return withTxn(externalClient, async (client) => {
    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    const offerMeta = await client.query(`SELECT order_id FROM elite_direct_offers WHERE id = $1`, [
      Number(offerId),
    ]);
    if (!offerMeta.rows[0]) {
      throw createAppError("Elite Direct Offer not found.", 404, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_FOUND,
      });
    }

    // Order-first lock, then offer
    const order = await lockOrder(client, offerMeta.rows[0].order_id);
    const offer = await lockOffer(client, offerId);

    if (Number(offer.target_freelancer_user_id) !== Number(freelancerUserId)) {
      throw createAppError("Not the targeted Freelancer for this Elite offer.", 403, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_TARGET,
      });
    }

    if (offer.status === "accepted") {
      return { offer: mapOffer(offer), idempotent: true };
    }
    if (offer.status !== "pending") {
      throw createAppError("Elite Direct Offer is not pending.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_PENDING,
      });
    }

    const { rows: expCheck } = await client.query(
      `SELECT NOW() >= expires_at AS expired FROM elite_direct_offers WHERE id = $1`,
      [offer.id],
    );
    if (expCheck[0]?.expired) {
      throw createAppError("Elite Direct Offer has expired.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_EXPIRED,
      });
    }

    assertRealOrderEligibleForElite(order);

    const priorityAuctionService = require("./marketplacePriorityAuctionService");
    await priorityAuctionService.assertNoActivePriorityAuctionBlockingAssignment(client, order.id);

    // Membership recheck at accept — fail closed (commit terminal state, then surface error)
    const eligibility = await loadEliteTargetEligibility(client, freelancerUserId);
    if (!eligibility.eligible) {
      const releaseOut = await entitlement.releaseEliteDirectOrderEntitlement({
        client,
        freelancerUserId,
        referenceType: "elite_direct_offer",
        referenceId: String(offer.id),
        reserveEventId: offer.reserve_event_id,
        actorUserId: freelancerUserId,
        reason: "elite_ineligible_at_accept_release",
      });
      await client.query(
        `UPDATE elite_direct_offers
            SET status = 'ineligible',
                reason_code = $2,
                cancelled_at = NOW(),
                release_event_id = COALESCE($3, release_event_id),
                actor_user_id = $4,
                updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [
          offer.id,
          ELITE_REASON_CODES.ELITE_INELIGIBLE_AT_ACCEPT,
          releaseOut.event?.id || null,
          Number(freelancerUserId),
        ],
      );
      const { rows } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [offer.id]);
      return {
        ineligibleAtAccept: true,
        offer: mapOffer(rows[0]),
        eligibilityReason: eligibility.reason,
      };
    }

    const consumeOut = await entitlement.consumeEliteDirectOrderEntitlement({
      client,
      freelancerUserId,
      referenceType: "elite_direct_offer",
      referenceId: String(offer.id),
      reserveEventId: offer.reserve_event_id,
      actorUserId: freelancerUserId,
      reason: "elite_offer_accept_consume",
    });

    const applyOut = await applyEliteAcceptanceToOrder(client, {
      order,
      freelancerUserId,
      offerId: offer.id,
      actorUserId: freelancerUserId,
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET status = 'accepted',
              reason_code = $2,
              accepted_at = NOW(),
              consume_event_id = $3,
              selected_bid_id = $4,
              assignment_reference = $5,
              actor_user_id = $6,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [
        offer.id,
        ELITE_REASON_CODES.ACCEPTED,
        consumeOut.event.id,
        applyOut.moneyBidId != null ? Number(applyOut.moneyBidId) : null,
        applyOut.assignmentReference,
        Number(freelancerUserId),
      ],
    );

    const { rows: updated } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [
      offer.id,
    ]);

    return {
      offer: mapOffer(updated[0]),
      idempotent: false,
      paymentMode: applyOut.mode,
      workTokenCost: ELITE_DIRECT_ORDER_WORK_TOKEN_COST,
      _notify: {
        kind: "accepted",
        creatorUserId: Number(offer.creator_user_id),
        creatorRole: offer.creator_role,
        freelancerUserId: Number(freelancerUserId),
        offerId: Number(offer.id),
        orderId: Number(order.id),
        mode: applyOut.mode,
      },
    };
  }).then(async (out) => {
    if (out && out.ineligibleAtAccept) {
      const err = createAppError("Freelancer became Elite-ineligible before accept.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_INELIGIBLE_AT_ACCEPT,
      });
      err.offer = out.offer;
      err.eligibilityReason = out.eligibilityReason;
      throw err;
    }
    if (out && out._notify && out._notify.kind === "accepted") {
      const n = out._notify;
      await afterCommitNotify(externalClient, (client) =>
        notificationService.createIfNotExists(
          {
            recipientUserId: n.creatorUserId,
            recipientRole: n.creatorRole === "client" ? "client" : "admin",
            actorUserId: n.freelancerUserId,
            type: "elite_direct_offer.accepted",
            title: "تم قبول عرض Elite Direct",
            message:
              n.mode === "selected_pending_payment"
                ? "قبل المستقل العرض — بانتظار إتمام الدفع."
                : "قبل المستقل العرض وتم الإسناد.",
            entityType: "elite_direct_offer",
            entityId: n.offerId,
            link:
              n.creatorRole === "client"
                ? `/dashboard/client/orders/${encodeURIComponent(String(n.orderId))}`
                : `/dashboard/admin/orders/${encodeURIComponent(String(n.orderId))}`,
            priority: "high",
            metadata: { offerId: String(n.offerId), orderId: String(n.orderId), mode: n.mode },
          },
          `elite_offer_accepted_${String(n.offerId)}`,
          client,
        ),
      );
    }
    if (out && out._notify) delete out._notify;
    return out;
  });
}

async function declineEliteDirectOffer({
  offerId,
  freelancerUserId,
  client: externalClient = null,
} = {}) {
  return withTxn(externalClient, async (client) => {
    const settings = await getMarketplaceEconomySettings(client);
    assertEngineActive(settings);

    const offerMeta = await client.query(`SELECT order_id FROM elite_direct_offers WHERE id = $1`, [
      Number(offerId),
    ]);
    if (!offerMeta.rows[0]) {
      throw createAppError("Elite Direct Offer not found.", 404, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_FOUND,
      });
    }
    await lockOrder(client, offerMeta.rows[0].order_id);
    const offer = await lockOffer(client, offerId);

    if (Number(offer.target_freelancer_user_id) !== Number(freelancerUserId)) {
      throw createAppError("Not the targeted Freelancer for this Elite offer.", 403, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_UNAUTHORIZED_TARGET,
      });
    }
    if (offer.status === "declined") {
      return { offer: mapOffer(offer), idempotent: true };
    }
    if (offer.status !== "pending") {
      throw createAppError("Elite Direct Offer is not pending.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_PENDING,
      });
    }

    const releaseOut = await entitlement.releaseEliteDirectOrderEntitlement({
      client,
      freelancerUserId,
      referenceType: "elite_direct_offer",
      referenceId: String(offer.id),
      reserveEventId: offer.reserve_event_id,
      actorUserId: freelancerUserId,
      reason: "elite_offer_decline_release",
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET status = 'declined',
              reason_code = $2,
              declined_at = NOW(),
              release_event_id = COALESCE($3, release_event_id),
              actor_user_id = $4,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [
        offer.id,
        ELITE_REASON_CODES.FREELANCER_DECLINED,
        releaseOut.event?.id || null,
        Number(freelancerUserId),
      ],
    );

    const { rows } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [offer.id]);

    return {
      offer: mapOffer(rows[0]),
      idempotent: false,
      _notify: {
        kind: "declined",
        creatorUserId: Number(offer.creator_user_id),
        creatorRole: offer.creator_role,
        freelancerUserId: Number(freelancerUserId),
        offerId: Number(offer.id),
        orderId: Number(offer.order_id),
      },
    };
  }).then(async (out) => {
    if (out && out._notify && out._notify.kind === "declined") {
      const n = out._notify;
      await afterCommitNotify(externalClient, (client) =>
        notificationService.createIfNotExists(
          {
            recipientUserId: n.creatorUserId,
            recipientRole: n.creatorRole === "client" ? "client" : "admin",
            actorUserId: n.freelancerUserId,
            type: "elite_direct_offer.declined",
            title: "تم رفض عرض Elite Direct",
            message: "رفض المستقل عرض Elite Direct. يمكنك إرسال عرض جديد لمستقل Elite آخر.",
            entityType: "elite_direct_offer",
            entityId: n.offerId,
            link:
              n.creatorRole === "client"
                ? `/dashboard/client/orders/${encodeURIComponent(String(n.orderId))}`
                : `/dashboard/admin/orders/${encodeURIComponent(String(n.orderId))}`,
            priority: "medium",
            metadata: { offerId: String(n.offerId), orderId: String(n.orderId) },
          },
          `elite_offer_declined_${String(n.offerId)}`,
          client,
        ),
      );
    }
    if (out && out._notify) delete out._notify;
    return out;
  });
}

async function cancelEliteDirectOffer({
  offerId,
  actorUserId,
  actorRole,
  reasonCode = ELITE_REASON_CODES.CREATOR_CANCELLED,
  client: externalClient = null,
} = {}) {
  return withTxn(externalClient, async (client) => {
    const settings = await getMarketplaceEconomySettings(client);
    // Cancel may run when engine off only for order-cancel reconciliation; require schema
    if (!(await eliteOffersSchemaReady(client))) {
      return { skipped: true, reason: "SCHEMA_MISSING" };
    }

    const offerMeta = await client.query(`SELECT order_id FROM elite_direct_offers WHERE id = $1`, [
      Number(offerId),
    ]);
    if (!offerMeta.rows[0]) {
      throw createAppError("Elite Direct Offer not found.", 404, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_FOUND,
      });
    }
    const order = await lockOrder(client, offerMeta.rows[0].order_id);
    const offer = await lockOffer(client, offerId);

    if (offer.status === "cancelled" && offer.reason_code === reasonCode) {
      return { offer: mapOffer(offer), idempotent: true };
    }
    if (offer.status !== "pending") {
      throw createAppError("Elite Direct Offer is not pending.", 409, {
        exposeToClient: true,
        publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_PENDING,
      });
    }

    // Creator or staff: engine must be on for manual cancel; order-cancel path may pass force
    if (reasonCode === ELITE_REASON_CODES.CREATOR_CANCELLED) {
      assertEngineActive(settings);
      assertCreatorAuthorized(order, { actorUserId, actorRole });
    }

    const releaseOut = await entitlement.releaseEliteDirectOrderEntitlement({
      client,
      freelancerUserId: offer.target_freelancer_user_id,
      referenceType: "elite_direct_offer",
      referenceId: String(offer.id),
      reserveEventId: offer.reserve_event_id,
      actorUserId,
      reason: "elite_offer_cancel_release",
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET status = 'cancelled',
              reason_code = $2,
              cancelled_at = NOW(),
              release_event_id = COALESCE($3, release_event_id),
              actor_user_id = $4,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [offer.id, reasonCode, releaseOut.event?.id || null, actorUserId != null ? Number(actorUserId) : null],
    );

    const { rows } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [offer.id]);
    return { offer: mapOffer(rows[0]), idempotent: false };
  });
}

/**
 * Cancel any PENDING Elite offer when underlying Order is cancelled (idempotent).
 * Safe when engine OFF / schema missing.
 */
async function cancelPendingEliteOffersForOrder({
  orderId,
  actorUserId = null,
  reasonCode = ELITE_REASON_CODES.ORDER_CANCELLED,
  client: externalClient = null,
} = {}) {
  return withTxn(externalClient, async (client) => {
    if (!(await eliteOffersSchemaReady(client))) {
      return { cancelled: false, skipped: true, reason: "SCHEMA_MISSING" };
    }
    await lockOrder(client, orderId);
    const pending = await getPendingOfferForOrder(client, orderId);
    if (!pending) {
      return { cancelled: false, skipped: true, reason: "NO_PENDING_OFFER" };
    }

    const releaseOut = await entitlement.releaseEliteDirectOrderEntitlement({
      client,
      freelancerUserId: pending.target_freelancer_user_id,
      referenceType: "elite_direct_offer",
      referenceId: String(pending.id),
      reserveEventId: pending.reserve_event_id,
      actorUserId,
      reason: "elite_offer_order_cancel_release",
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET status = 'cancelled',
              reason_code = $2,
              cancelled_at = NOW(),
              release_event_id = COALESCE($3, release_event_id),
              actor_user_id = $4,
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [
        pending.id,
        reasonCode,
        releaseOut.event?.id || null,
        actorUserId != null ? Number(actorUserId) : null,
      ],
    );
    return { cancelled: true, offerId: String(pending.id) };
  });
}

async function expireEliteDirectOffer({ offerId, client: externalClient = null } = {}) {
  return withTxn(externalClient, async (client) => {
    if (!(await eliteOffersSchemaReady(client))) {
      return { skipped: true, reason: "SCHEMA_MISSING" };
    }
    const offerMeta = await client.query(`SELECT order_id FROM elite_direct_offers WHERE id = $1`, [
      Number(offerId),
    ]);
    if (!offerMeta.rows[0]) return { skipped: true, reason: "NOT_FOUND" };

    await lockOrder(client, offerMeta.rows[0].order_id);
    const offer = await lockOffer(client, offerId);

    if (offer.status === "expired") {
      return { offer: mapOffer(offer), idempotent: true };
    }
    if (offer.status !== "pending") {
      return { skipped: true, reason: "NOT_PENDING", status: offer.status };
    }

    const { rows: due } = await client.query(
      `SELECT NOW() >= expires_at AS due FROM elite_direct_offers WHERE id = $1`,
      [offer.id],
    );
    if (!due[0]?.due) {
      return { skipped: true, reason: "NOT_YET_EXPIRED" };
    }

    const releaseOut = await entitlement.releaseEliteDirectOrderEntitlement({
      client,
      freelancerUserId: offer.target_freelancer_user_id,
      referenceType: "elite_direct_offer",
      referenceId: String(offer.id),
      reserveEventId: offer.reserve_event_id,
      actorUserId: null,
      reason: "elite_offer_expire_release",
    });

    await client.query(
      `UPDATE elite_direct_offers
          SET status = 'expired',
              reason_code = $2,
              expired_at = NOW(),
              release_event_id = COALESCE($3, release_event_id),
              updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [offer.id, ELITE_REASON_CODES.OFFER_EXPIRED, releaseOut.event?.id || null],
    );

    const { rows } = await client.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [offer.id]);

    return {
      offer: mapOffer(rows[0]),
      idempotent: false,
      _notify: {
        kind: "expired",
        creatorUserId: Number(offer.creator_user_id),
        creatorRole: offer.creator_role,
        offerId: Number(offer.id),
        orderId: Number(offer.order_id),
      },
    };
  }).then(async (out) => {
    if (out && out._notify && out._notify.kind === "expired") {
      const n = out._notify;
      await afterCommitNotify(externalClient, (client) =>
        notificationService.createIfNotExists(
          {
            recipientUserId: n.creatorUserId,
            recipientRole: n.creatorRole === "client" ? "client" : "admin",
            actorUserId: null,
            type: "elite_direct_offer.expired",
            title: "انتهت مدة عرض Elite Direct",
            message: "انتهت مدة العرض دون قبول. يمكنك إرسال عرض جديد لمستقل Elite آخر.",
            entityType: "elite_direct_offer",
            entityId: n.offerId,
            link:
              n.creatorRole === "client"
                ? `/dashboard/client/orders/${encodeURIComponent(String(n.orderId))}`
                : `/dashboard/admin/orders/${encodeURIComponent(String(n.orderId))}`,
            priority: "medium",
            metadata: { offerId: String(n.offerId), orderId: String(n.orderId) },
          },
          `elite_offer_expired_${String(n.offerId)}`,
          client,
        ),
      );
    }
    if (out && out._notify) delete out._notify;
    return out;
  });
}

async function listDueEliteOffersForExpiry({ limit = 50, client: db = pool } = {}) {
  if (!(await eliteOffersSchemaReady(db))) return [];
  const { rows } = await db.query(
    `SELECT id FROM elite_direct_offers
     WHERE status = 'pending' AND expires_at <= NOW()
     ORDER BY expires_at ASC
     LIMIT $1`,
    [Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return rows.map((r) => String(r.id));
}

async function expireDueEliteDirectOffers({ limit = 50 } = {}) {
  const ids = await listDueEliteOffersForExpiry({ limit });
  const results = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const out = await expireEliteDirectOffer({ offerId: id });
    results.push({ offerId: id, ...out });
  }
  return { processed: results.length, results };
}

async function getEliteDirectOfferById(offerId, { client: db = pool } = {}) {
  if (!(await eliteOffersSchemaReady(db))) return null;
  const { rows } = await db.query(`SELECT * FROM elite_direct_offers WHERE id = $1`, [Number(offerId)]);
  return mapOffer(rows[0]);
}

async function listEliteOffersForOrder(orderId, { client: db = pool } = {}) {
  if (!(await eliteOffersSchemaReady(db))) return [];
  const { rows } = await db.query(
    `SELECT * FROM elite_direct_offers WHERE order_id = $1 ORDER BY created_at DESC`,
    [Number(orderId)],
  );
  return rows.map(mapOffer);
}

async function listEliteOffersForTargetFreelancer(freelancerUserId, { client: db = pool, status = null } = {}) {
  if (!(await eliteOffersSchemaReady(db))) return [];
  if (status) {
    const { rows } = await db.query(
      `SELECT * FROM elite_direct_offers
       WHERE target_freelancer_user_id = $1 AND status = $2
       ORDER BY created_at DESC`,
      [Number(freelancerUserId), String(status)],
    );
    return rows.map(mapOffer);
  }
  const { rows } = await db.query(
    `SELECT * FROM elite_direct_offers
     WHERE target_freelancer_user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [Number(freelancerUserId)],
  );
  return rows.map(mapOffer);
}

/**
 * Privacy: only target, creator, or super-admin/staff may view.
 */
function assertCanViewOffer(offer, { userId, role }) {
  const uid = Number(userId);
  const r = String(role || "").toLowerCase();
  if (r === "super_admin" || r === "admin") return true;
  if (Number(offer.targetFreelancerUserId) === uid) return true;
  if (Number(offer.creatorUserId) === uid) return true;
  throw createAppError("Elite Direct Offer not found.", 404, {
    exposeToClient: true,
    publicCode: ELITE_DIRECT_ORDER_ERROR_CODES.ELITE_OFFER_NOT_FOUND,
  });
}

module.exports = {
  createEliteDirectOffer,
  acceptEliteDirectOffer,
  declineEliteDirectOffer,
  cancelEliteDirectOffer,
  cancelPendingEliteOffersForOrder,
  expireEliteDirectOffer,
  expireDueEliteDirectOffers,
  listDueEliteOffersForExpiry,
  getEliteDirectOfferById,
  listEliteOffersForOrder,
  listEliteOffersForTargetFreelancer,
  assertNoPendingEliteOfferBlockingAuction,
  assertCanViewOffer,
  mapOffer,
  eliteOffersSchemaReady,
  ELITE_DIRECT_ORDER_WORK_TOKEN_COST,
  FAKE_TRAINING_ELITE_DIRECT_ORDER_LINKAGE,
  ELITE_HISTORICAL_BACKFILL,
  ELITE_OFFER_TERMINAL_STATUSES,
};
