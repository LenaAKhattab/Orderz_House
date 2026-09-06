/**
 * Super Admin Bid Distribution Pool — Phase D1.
 *
 * Independent Bid source: admin_distribution_pool.
 * Reuses existing Bid Credit grants + FEFO + expiry.
 * Unused expired Bids return to the SAME pool (idempotent).
 * Does NOT touch Work Tokens. Does NOT enable Bid Credits engine.
 */

const crypto = require("crypto");
const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const accounting = require("./marketplaceBidCreditAccountingService");
const notificationEventsService = require("./notificationEventsService");
const notificationService = require("./notificationService");
const {
  marketplaceBidDistributionPoolsSchemaReady,
} = require("../utils/marketplaceBidDistributionPoolsSchema");
const { calculatePoolBidsFromBudget, calculateUnusedBidsToReturn } = require("../utils/marketplaceBidPoolMoney");
const { resolvePoolAllocationExpiresAt } = require("../utils/marketplaceBidPoolExpiration");
const {
  ADMIN_BID_POOL_GRANT_SOURCE,
  ADMIN_DISTRIBUTION_POOL_GRANT_EVENT,
  BID_POOL_DISTRIBUTION_MODES,
  BID_POOL_ERROR_CODES,
} = require("../constants/marketplaceBidDistributionPools");

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

async function assertPoolSchema(client) {
  if (!(await marketplaceBidDistributionPoolsSchemaReady(client))) {
    throw createAppError("Bid Distribution Pool schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.BID_POOL_SCHEMA_NOT_READY,
    });
  }
}

function mapPool(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    budgetJod: String(row.budget_jod),
    bidUnitPriceJod: String(row.bid_unit_price_jod),
    totalBids: Number(row.total_bids),
    availableBids: Number(row.available_bids),
    monetaryRemainderJod: String(row.monetary_remainder_jod),
    status: row.status,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBatch(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    poolId: Number(row.pool_id),
    distributionMode: row.distribution_mode,
    bidsPerFreelancer: Number(row.bids_per_freelancer),
    recipientCount: Number(row.recipient_count),
    totalAllocated: Number(row.total_allocated),
    expirationMode: row.expiration_mode,
    expirationValue: row.expiration_value != null ? Number(row.expiration_value) : null,
    expiresAt: row.expires_at,
    createdByUserId: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

function mapAllocation(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    poolId: Number(row.pool_id),
    batchId: Number(row.batch_id),
    freelancerUserId: Number(row.freelancer_user_id),
    bidCreditGrantId: Number(row.bid_credit_grant_id),
    allocatedBids: Number(row.allocated_bids),
    returnedBids: Number(row.returned_bids),
    expiresAt: row.expires_at,
    status: row.status,
    returnedAt: row.returned_at,
    createdAt: row.created_at,
  };
}

async function assertActiveFreelancer(client, freelancerUserId) {
  const { rows } = await client.query(
    `SELECT id, role, is_active, email, first_name FROM users WHERE id = $1`,
    [Number(freelancerUserId)],
  );
  const user = rows[0];
  if (!user || user.role !== "freelancer" || user.is_active !== true) {
    throw createAppError("Recipient must be an active Freelancer.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_FREELANCER,
    });
  }
  return user;
}

async function insertPoolEvent(client, {
  poolId,
  eventType,
  amountBids,
  batchId = null,
  allocationId = null,
  actorUserId = null,
  idempotencyKey,
  metadata = {},
}) {
  const key = String(idempotencyKey || "").trim().slice(0, 180);
  try {
    await client.query(
      `INSERT INTO marketplace_bid_distribution_pool_events (
         pool_id, event_type, amount_bids, batch_id, allocation_id,
         actor_user_id, idempotency_key, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        poolId,
        eventType,
        amountBids,
        batchId,
        allocationId,
        actorUserId,
        key,
        JSON.stringify(metadata || {}),
      ],
    );
    return { created: true };
  } catch (err) {
    if (err && err.code === "23505") {
      return { created: false, idempotent: true };
    }
    throw err;
  }
}

/**
 * Create a Bid Distribution Pool. totalBids is ALWAYS server-calculated.
 * Does not enable Bid Credits. Does not grant Bids.
 */
async function createBidDistributionPool({
  name,
  budgetJod,
  bidUnitPriceJod,
  actorUserId,
  client: externalClient = null,
} = {}) {
  const calc = calculatePoolBidsFromBudget({ budgetJod, bidUnitPriceJod });
  const label = String(name || "").trim();
  if (!label || label.length > 200) {
    throw createAppError("Pool name is required (max 200 characters).", 400, {
      exposeToClient: true,
    });
  }
  if (!actorUserId) {
    throw createAppError("actorUserId is required.", 400, { exposeToClient: false });
  }

  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertPoolSchema(client);

    const { rows } = await client.query(
      `INSERT INTO marketplace_bid_distribution_pools (
         name, budget_jod, bid_unit_price_jod, total_bids, available_bids,
         monetary_remainder_jod, status, created_by_user_id
       ) VALUES (
         $1, $2::numeric, $3::numeric, $4, $4,
         $5::numeric, 'active', $6
       )
       RETURNING *`,
      [
        label,
        calc.budgetJod,
        calc.bidUnitPriceJod,
        calc.totalBids,
        calc.monetaryRemainderJod,
        Number(actorUserId),
      ],
    );
    const poolRow = rows[0];
    await insertPoolEvent(client, {
      poolId: poolRow.id,
      eventType: "POOL_CREATED",
      amountBids: calc.totalBids,
      actorUserId: Number(actorUserId),
      idempotencyKey: `pool_created:${poolRow.id}`,
      metadata: {
        budgetJod: calc.budgetJod,
        bidUnitPriceJod: calc.bidUnitPriceJod,
        monetaryRemainderJod: calc.monetaryRemainderJod,
        totalSource: "SERVER_CALCULATION",
      },
    });
    if (ownTxn) await client.query("COMMIT");
    return {
      pool: mapPool(poolRow),
      calculation: {
        totalBids: calc.totalBids,
        monetaryRemainderJod: calc.monetaryRemainderJod,
        totalSource: "SERVER_CALCULATION",
      },
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
    if (release) client.release();
  }
}

async function getBidDistributionPoolById(poolId, { client: externalClient = null } = {}) {
  const { client, release } = await resolveDbClient(externalClient);
  try {
    await assertPoolSchema(client);
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_distribution_pools WHERE id = $1`,
      [Number(poolId)],
    );
    return mapPool(rows[0]);
  } finally {
    if (release) client.release();
  }
}

async function listBidDistributionPools({ limit = 50, offset = 0, status = null } = {}) {
  const client = await pool.connect();
  try {
    await assertPoolSchema(client);
    const params = [Math.min(200, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0)];
    let sql = `SELECT * FROM marketplace_bid_distribution_pools`;
    if (status) {
      params.push(String(status));
      sql += ` WHERE status = $3`;
    }
    sql += ` ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`;
    const { rows } = await client.query(sql, params);
    return rows.map(mapPool);
  } finally {
    client.release();
  }
}

async function selectRandomEligibleFreelancers(client, { recipientCount, excludeIds = [] }) {
  const n = Number(recipientCount);
  if (!Number.isInteger(n) || n < 1) {
    throw createAppError("recipientCount must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_RECIPIENTS,
    });
  }
  const exclude = [...new Set((excludeIds || []).map(Number).filter((x) => Number.isInteger(x) && x > 0))];
  const { rows } = await client.query(
    `SELECT id FROM users
      WHERE role = 'freelancer'
        AND is_active = TRUE
        AND NOT (id = ANY($1::bigint[]))
      ORDER BY random()
      LIMIT $2`,
    [exclude, n],
  );
  if (rows.length < n) {
    throw createAppError(
      `Not enough eligible active Freelancers (need ${n}, found ${rows.length}).`,
      409,
      {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.INVALID_RECIPIENTS,
      },
    );
  }
  return rows.map((r) => Number(r.id));
}

function normalizeManualRecipientIds(freelancerUserIds) {
  if (!Array.isArray(freelancerUserIds) || freelancerUserIds.length < 1) {
    throw createAppError("freelancerUserIds is required for manual distribution.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_RECIPIENTS,
    });
  }
  const ids = freelancerUserIds.map((x) => Number(x));
  if (ids.some((x) => !Number.isInteger(x) || x < 1)) {
    throw createAppError("All recipient IDs must be positive integers.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_RECIPIENTS,
    });
  }
  const unique = [...new Set(ids)];
  if (unique.length !== ids.length) {
    throw createAppError("Duplicate Freelancer in the same batch is not allowed.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.DUPLICATE_RECIPIENT,
    });
  }
  return unique;
}

/**
 * Atomic all-or-nothing distribution from a pool.
 * MANUAL: explicit freelancerUserIds
 * RANDOM: select recipientCount eligible Freelancers (foundation; no Production execution required)
 */
async function allocateBidDistributionBatch({
  poolId,
  distributionMode,
  bidsPerFreelancer,
  freelancerUserIds = null,
  recipientCount = null,
  expirationMode,
  expirationValue = null,
  expiresAt = null,
  actorUserId,
  idempotencyKey = null,
  reason = null,
  now = new Date(),
  client: externalClient = null,
} = {}) {
  const mode = String(distributionMode || "").trim();
  if (!BID_POOL_DISTRIBUTION_MODES.includes(mode)) {
    throw createAppError("distributionMode must be manual or random.", 400, {
      exposeToClient: true,
      publicCode: BID_POOL_ERROR_CODES.INVALID_DISTRIBUTION_MODE,
    });
  }
  const bpf = Number(bidsPerFreelancer);
  if (!Number.isInteger(bpf) || bpf < 1) {
    throw createAppError("bidsPerFreelancer must be a positive integer.", 400, {
      exposeToClient: true,
    });
  }
  if (!actorUserId) {
    throw createAppError("actorUserId is required.", 400, { exposeToClient: false });
  }

  const expiry = resolvePoolAllocationExpiresAt({
    expirationMode,
    expirationValue,
    expiresAt,
    now,
  });

  const key =
    String(idempotencyKey || "").trim() ||
    `bid_pool_alloc:${poolId}:${actorUserId}:${crypto.randomBytes(8).toString("hex")}`.slice(0, 180);

  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertPoolSchema(client);

    const existingBatch = await client.query(
      `SELECT * FROM marketplace_bid_distribution_batches WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    if (existingBatch.rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return {
        batch: mapBatch(existingBatch.rows[0]),
        idempotent: true,
        allocations: [],
      };
    }

    const { rows: poolRows } = await client.query(
      `SELECT * FROM marketplace_bid_distribution_pools WHERE id = $1 FOR UPDATE`,
      [Number(poolId)],
    );
    const poolRow = poolRows[0];
    if (!poolRow) {
      throw createAppError("Bid Distribution Pool not found.", 404, {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.POOL_NOT_FOUND,
      });
    }
    if (poolRow.status !== "active") {
      throw createAppError("Bid Distribution Pool is not active.", 409, {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.POOL_NOT_ACTIVE,
      });
    }

    let recipientIds;
    if (mode === "manual") {
      recipientIds = normalizeManualRecipientIds(freelancerUserIds);
    } else {
      const count =
        recipientCount != null
          ? Number(recipientCount)
          : Array.isArray(freelancerUserIds)
            ? freelancerUserIds.length
            : null;
      recipientIds = await selectRandomEligibleFreelancers(client, {
        recipientCount: count,
      });
    }

    for (const fid of recipientIds) {
      // eslint-disable-next-line no-await-in-loop
      await assertActiveFreelancer(client, fid);
    }

    const totalAllocated = bpf * recipientIds.length;
    const available = Number(poolRow.available_bids);
    if (available < totalAllocated) {
      throw createAppError(
        `Insufficient pool Bids (available ${available}, required ${totalAllocated}).`,
        409,
        {
          exposeToClient: true,
          publicCode: BID_POOL_ERROR_CODES.POOL_INSUFFICIENT_BIDS,
        },
      );
    }

    const { rows: batchRows } = await client.query(
      `INSERT INTO marketplace_bid_distribution_batches (
         pool_id, distribution_mode, bids_per_freelancer, recipient_count,
         total_allocated, expiration_mode, expiration_value, expires_at,
         created_by_user_id, idempotency_key
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        poolRow.id,
        mode,
        bpf,
        recipientIds.length,
        totalAllocated,
        expiry.expirationMode,
        expiry.expirationValue,
        expiry.expiresAt.toISOString(),
        Number(actorUserId),
        key,
      ],
    );
    const batch = batchRows[0];

    const allocations = [];
    const reasonText =
      String(reason || "").trim() ||
      `Admin Bid Pool allocation from pool ${poolRow.name}`;

    for (const fid of recipientIds) {
      const grantKey = `bid_pool_grant:batch:${batch.id}:freelancer:${fid}`.slice(0, 180);
      // eslint-disable-next-line no-await-in-loop
      const grantOut = await accounting.createBidCreditGrant({
        client,
        freelancerUserId: fid,
        sourceType: ADMIN_BID_POOL_GRANT_SOURCE,
        amount: bpf,
        expiresAt: expiry.expiresAt,
        eventType: ADMIN_DISTRIBUTION_POOL_GRANT_EVENT,
        idempotencyKey: grantKey,
        reason: reasonText,
        actorUserId: Number(actorUserId),
        referenceType: "bid_distribution_batch",
        referenceId: String(batch.id),
        metadata: {
          poolId: Number(poolRow.id),
          batchId: Number(batch.id),
          distributionMode: mode,
          independentOfMembershipPlan: true,
        },
        grantedAt: now,
      });

      // eslint-disable-next-line no-await-in-loop
      const { rows: allocRows } = await client.query(
        `INSERT INTO marketplace_bid_distribution_allocations (
           pool_id, batch_id, freelancer_user_id, bid_credit_grant_id,
           allocated_bids, returned_bids, expires_at, status
         ) VALUES ($1, $2, $3, $4, $5, 0, $6, 'active')
         RETURNING *`,
        [
          poolRow.id,
          batch.id,
          fid,
          grantOut.grant.id,
          bpf,
          expiry.expiresAt.toISOString(),
        ],
      );
      allocations.push(mapAllocation(allocRows[0]));
    }

    const { rows: updatedPool } = await client.query(
      `UPDATE marketplace_bid_distribution_pools
          SET available_bids = available_bids - $2,
              updated_at = NOW()
        WHERE id = $1
          AND available_bids >= $2
        RETURNING *`,
      [poolRow.id, totalAllocated],
    );
    if (!updatedPool[0]) {
      throw createAppError("Pool available Bids changed concurrently; allocation aborted.", 409, {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.POOL_INSUFFICIENT_BIDS,
      });
    }

    await insertPoolEvent(client, {
      poolId: poolRow.id,
      eventType: "ALLOCATED",
      amountBids: totalAllocated,
      batchId: batch.id,
      actorUserId: Number(actorUserId),
      idempotencyKey: `pool_allocated:batch:${batch.id}`,
      metadata: {
        recipientCount: recipientIds.length,
        bidsPerFreelancer: bpf,
        distributionMode: mode,
      },
    });

    if (ownTxn) await client.query("COMMIT");

    // Freelancer notices after commit — notify failure must not undo grants/pool debit.
    for (const alloc of allocations) {
      const until = new Date(alloc.expiresAt).toISOString().slice(0, 10);
      try {
        // eslint-disable-next-line no-await-in-loop
        await notificationService.createIfNotExists(
          {
            recipientUserId: alloc.freelancerUserId,
            recipientRole: "freelancer",
            actorUserId: Number(actorUserId),
            type: "bid_pool.allocated",
            title: "You received Bids",
            message: `You received ${alloc.allocatedBids} Bids valid until ${until}.`,
            entityType: "bid_distribution_allocation",
            entityId: alloc.id,
            link: "/dashboard/freelancer/plans",
            priority: "medium",
            metadata: {
              poolId: Number(poolRow.id),
              batchId: Number(batch.id),
              allocatedBids: alloc.allocatedBids,
              expiresAt: alloc.expiresAt,
            },
          },
          `bid_pool_alloc_notify:${alloc.id}`,
        );
      } catch (notifyErr) {
        // eslint-disable-next-line no-console
        console.error(
          "[bid-pool] Freelancer allocate notification failed after successful allocation:",
          notifyErr?.message || notifyErr,
        );
      }
    }

    return {
      batch: mapBatch(batch),
      pool: mapPool(updatedPool[0]),
      allocations,
      idempotent: false,
    };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (err && err.code === "23505") {
      const again = await pool.query(
        `SELECT * FROM marketplace_bid_distribution_batches WHERE idempotency_key = $1 LIMIT 1`,
        [key],
      );
      if (again.rows[0]) {
        return { batch: mapBatch(again.rows[0]), idempotent: true, allocations: [] };
      }
      throw createAppError("Duplicate recipient or conflict in distribution batch.", 409, {
        exposeToClient: true,
        publicCode: BID_POOL_ERROR_CODES.DUPLICATE_RECIPIENT,
      });
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Return unused Bids from one allocation to its source pool.
 * Safe after generic grant expiry — uses allocation/grant consume math, not amount_expired re-add.
 * Idempotent via allocation.status + unique pool event key.
 */
async function returnUnusedPoolBidsForAllocation({
  client: externalClient,
  allocationId = null,
  grantId = null,
  now = new Date(),
  notify = false,
} = {}) {
  if (!externalClient) {
    throw createAppError("returnUnusedPoolBidsForAllocation requires a transaction client.", 500);
  }
  const client = externalClient;
  await assertPoolSchema(client);

  let allocRow;
  if (allocationId != null) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_distribution_allocations WHERE id = $1 FOR UPDATE`,
      [Number(allocationId)],
    );
    allocRow = rows[0];
  } else if (grantId != null) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_distribution_allocations
        WHERE bid_credit_grant_id = $1 FOR UPDATE`,
      [Number(grantId)],
    );
    allocRow = rows[0];
  }
  if (!allocRow) {
    return { returned: 0, skipped: true, reason: "NO_ALLOCATION" };
  }
  if (allocRow.status === "returned") {
    return {
      returned: 0,
      skipped: true,
      reason: "ALREADY_RETURNED",
      allocation: mapAllocation(allocRow),
      poolId: Number(allocRow.pool_id),
      batchId: Number(allocRow.batch_id),
    };
  }

  const { rows: grantRows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
    [allocRow.bid_credit_grant_id],
  );
  let grant = grantRows[0];
  if (!grant) {
    return { returned: 0, skipped: true, reason: "GRANT_MISSING" };
  }

  const instant = new Date(now);
  const pastExpiry =
    new Date(grant.expires_at) <= instant || new Date(allocRow.expires_at) <= instant;
  const terminalStatus =
    grant.status === "expired" ||
    grant.status === "exhausted" ||
    grant.status === "revoked";

  if (!pastExpiry && !terminalStatus && accounting.grantRemaining(grant) > 0) {
    return { returned: 0, skipped: true, reason: "NOT_YET_EXPIRED" };
  }

  // Never credit the pool while Freelancer can still spend remaining Bids.
  // If past expiry with remainder, expire in this txn (FOR UPDATE held) before pool return.
  // Generic expireDueBidCreditGrants stays idempotent via ledger key bid_expire:{id}:{amt}.
  let remaining = accounting.grantRemaining(grant);
  if (pastExpiry && remaining > 0 && grant.status !== "revoked") {
    const ledgerKey = `bid_expire:${grant.id}:${remaining}`;
    const existing = await client.query(
      `SELECT id FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1`,
      [ledgerKey],
    );
    if (!existing.rows[0]) {
      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET amount_expired = amount_expired + $2,
                status = 'expired',
                expired_at = COALESCE(expired_at, $3),
                updated_at = NOW()
          WHERE id = $1`,
        [grant.id, remaining, instant.toISOString()],
      );
      await client.query(
        `INSERT INTO marketplace_bid_credit_ledger_entries (
           freelancer_user_id, grant_id, event_type, amount, direction,
           reference_type, reference_id, idempotency_key, reason, metadata
         ) VALUES ($1, $2, 'BID_EXPIRED', $3, -1, 'bid_credit_grant', $4, $5, 'grant_expired', '{}'::jsonb)`,
        [grant.freelancer_user_id, grant.id, remaining, String(grant.id), ledgerKey],
      );
    }
    const refreshed = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1`,
      [grant.id],
    );
    grant = refreshed.rows[0];
    remaining = accounting.grantRemaining(grant);
  }

  if (remaining > 0 && grant.status !== "exhausted" && grant.status !== "revoked") {
    return { returned: 0, skipped: true, reason: "GRANT_STILL_SPENDABLE" };
  }

  const reservedAmt = grant.amount_reserved != null ? Number(grant.amount_reserved) : 0;
  // E2: never return reserved Bids while still committed to an Article.
  // Non-reserved unused may return (preferred: pool=10 reserve=1 → return up to 9).
  const returnAmount = calculateUnusedBidsToReturn({
    allocatedBids: allocRow.allocated_bids,
    amountConsumed: grant.amount_consumed,
    amountRevoked: grant.amount_revoked != null ? grant.amount_revoked : 0,
    returnedBids: allocRow.returned_bids,
    amountReserved: reservedAmt,
  });

  if (returnAmount <= 0) {
    return {
      returned: 0,
      skipped: true,
      reason: reservedAmt > 0 ? "ONLY_RESERVED_REMAINS" : "NOTHING_TO_RETURN",
      reserved: reservedAmt,
    };
  }

  const { rows: poolRows } = await client.query(
    `SELECT * FROM marketplace_bid_distribution_pools WHERE id = $1 FOR UPDATE`,
    [allocRow.pool_id],
  );
  const poolRow = poolRows[0];
  if (!poolRow) {
    throw createAppError("Pool missing for allocation return.", 500);
  }

  if (returnAmount > 0) {
    const nextAvailable = Number(poolRow.available_bids) + returnAmount;
    if (nextAvailable > Number(poolRow.total_bids)) {
      throw createAppError("Pool return would exceed total_bids (invariant).", 500);
    }
    await client.query(
      `UPDATE marketplace_bid_distribution_pools
          SET available_bids = available_bids + $2,
              updated_at = NOW()
        WHERE id = $1`,
      [poolRow.id, returnAmount],
    );
  }

  const { rows: updatedAlloc } = await client.query(
    `UPDATE marketplace_bid_distribution_allocations
        SET returned_bids = returned_bids + $2,
            status = 'returned',
            returned_at = COALESCE(returned_at, $3)
      WHERE id = $1
      RETURNING *`,
    [allocRow.id, returnAmount, instant.toISOString()],
  );

  await insertPoolEvent(client, {
    poolId: poolRow.id,
    eventType: "RETURNED_UNUSED",
    amountBids: returnAmount,
    batchId: allocRow.batch_id,
    allocationId: allocRow.id,
    idempotencyKey: `pool_return_unused:allocation:${allocRow.id}`,
    metadata: {
      grantId: Number(grant.id),
      freelancerUserId: Number(allocRow.freelancer_user_id),
      allocatedBids: Number(allocRow.allocated_bids),
      consumedBids: Number(grant.amount_consumed) || 0,
      returnedBids: returnAmount,
    },
  });

  return {
    returned: returnAmount,
    skipped: false,
    allocation: mapAllocation(updatedAlloc[0]),
    poolId: Number(poolRow.id),
    poolName: poolRow.name,
    batchId: Number(allocRow.batch_id),
    notify,
  };
}

/**
 * After generic BID_EXPIRED on an admin_distribution_pool grant, return unused to pool.
 */
async function returnUnusedPoolBidsForExpiredGrant({
  client,
  grant,
  now = new Date(),
} = {}) {
  if (!grant || grant.source_type !== ADMIN_BID_POOL_GRANT_SOURCE) {
    return { returned: 0, skipped: true, reason: "NOT_POOL_GRANT" };
  }
  return returnUnusedPoolBidsForAllocation({
    client,
    grantId: grant.id,
    now,
    notify: false,
  });
}

/**
 * Reconcile active pool allocations that are past expiry / grant terminal.
 * Aggregates Super Admin notifications per pool in this pass.
 * Idempotent under concurrent ticks (row locks + unique return events).
 */
async function reconcileExpiredPoolAllocationReturns({
  client: externalClient = null,
  now = new Date(),
  limit = 200,
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    if (!(await marketplaceBidDistributionPoolsSchemaReady(client))) {
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, skipped: true, reason: "SCHEMA_NOT_READY", returnedTotal: 0 };
    }

    const instant = new Date(now).toISOString();
    const { rows } = await client.query(
      `SELECT a.id
         FROM marketplace_bid_distribution_allocations a
         JOIN marketplace_bid_credit_grants g ON g.id = a.bid_credit_grant_id
        WHERE a.status = 'active'
          AND (
            a.expires_at <= $1
            OR g.expires_at <= $1
            OR g.status IN ('expired', 'exhausted', 'revoked')
          )
        ORDER BY a.expires_at ASC, a.id ASC
        LIMIT $2
        FOR UPDATE OF a SKIP LOCKED`,
      [instant, Math.min(500, Math.max(1, Number(limit) || 200))],
    );

    const byPool = new Map();
    let returnedTotal = 0;
    let allocationCount = 0;

    for (const r of rows) {
      // eslint-disable-next-line no-await-in-loop
      const out = await returnUnusedPoolBidsForAllocation({
        client,
        allocationId: r.id,
        now,
        notify: false,
      });
      if (out.skipped && out.reason === "ALREADY_RETURNED") continue;
      if (out.skipped && out.reason === "NOT_YET_EXPIRED") continue;
      allocationCount += 1;
      returnedTotal += out.returned || 0;
      if (out.poolId != null) {
        const cur = byPool.get(out.poolId) || {
          poolId: out.poolId,
          poolName: out.poolName || `Pool #${out.poolId}`,
          returnedBids: 0,
          allocationCount: 0,
          batchIds: new Set(),
        };
        cur.returnedBids += out.returned || 0;
        cur.allocationCount += 1;
        if (out.batchId != null) cur.batchIds.add(out.batchId);
        if (out.poolName) cur.poolName = out.poolName;
        byPool.set(out.poolId, cur);
      }
    }

    // Commit economic returns BEFORE Admin notifications so a notify failure
    // cannot roll back pool inventory credits.
    if (ownTxn) await client.query("COMMIT");

    let poolsNotified = 0;
    for (const agg of byPool.values()) {
      if (agg.allocationCount < 1) continue;
      const dedupe = `bid_pool_return_agg:${agg.poolId}:${[...agg.batchIds].sort().join("-")}:${instant.slice(0, 13)}`;
      try {
        // eslint-disable-next-line no-await-in-loop
        await notificationEventsService.notifySuperAdmins({
          recipientRole: "super_admin",
          type: "bid_pool.returned_unused",
          title: "Unused Bids returned to pool",
          message: `${agg.returnedBids} unused Bids from ${agg.allocationCount} Freelancer allocations were returned to ${agg.poolName}.`,
          entityType: "bid_distribution_pool",
          entityId: agg.poolId,
          link: "/dashboard/super-admin/marketplace-economy",
          priority: "medium",
          dedupeKey: dedupe.slice(0, 160),
          metadata: {
            poolId: agg.poolId,
            poolName: agg.poolName,
            returnedBids: agg.returnedBids,
            allocationCount: agg.allocationCount,
            batchIds: [...agg.batchIds],
          },
        });
        poolsNotified += 1;
      } catch (notifyErr) {
        // eslint-disable-next-line no-console
        console.error(
          "[bid-pool] Admin return notification failed after successful pool return:",
          notifyErr?.message || notifyErr,
        );
      }
    }

    return {
      ok: true,
      processed: rows.length,
      allocationCount,
      returnedTotal,
      poolsNotified,
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
    if (release) client.release();
  }
}

/**
 * Pool accounting snapshot for invariant checks.
 * TOTAL = AVAILABLE + CURRENTLY_ALLOCATED_UNUSED + PERMANENTLY_CONSUMED
 */
async function getPoolAccountingSnapshot(poolId, { client: externalClient = null } = {}) {
  const { client, release } = await resolveDbClient(externalClient);
  try {
    await assertPoolSchema(client);
    const { rows: poolRows } = await client.query(
      `SELECT * FROM marketplace_bid_distribution_pools WHERE id = $1`,
      [Number(poolId)],
    );
    const p = poolRows[0];
    if (!p) return null;

    const { rows: agg } = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN a.status = 'active'
           THEN GREATEST(a.allocated_bids - COALESCE(g.amount_consumed, 0) - a.returned_bids, 0)
           ELSE 0 END), 0)::int AS currently_allocated_unused,
         COALESCE(SUM(COALESCE(g.amount_consumed, 0)), 0)::int AS permanently_consumed,
         COALESCE(SUM(a.returned_bids), 0)::int AS cumulative_returned
       FROM marketplace_bid_distribution_allocations a
       JOIN marketplace_bid_credit_grants g ON g.id = a.bid_credit_grant_id
      WHERE a.pool_id = $1`,
      [Number(poolId)],
    );
    const currentlyAllocatedUnused = Number(agg[0]?.currently_allocated_unused) || 0;
    const permanentlyConsumed = Number(agg[0]?.permanently_consumed) || 0;
    const cumulativeReturned = Number(agg[0]?.cumulative_returned) || 0;
    const available = Number(p.available_bids);
    const total = Number(p.total_bids);
    const reconstructed = available + currentlyAllocatedUnused + permanentlyConsumed;
    return {
      pool: mapPool(p),
      available,
      currentlyAllocatedUnused,
      permanentlyConsumed,
      cumulativeReturned,
      total,
      reconstructed,
      invariantOk: reconstructed === total,
    };
  } finally {
    if (release) client.release();
  }
}

module.exports = {
  createBidDistributionPool,
  getBidDistributionPoolById,
  listBidDistributionPools,
  allocateBidDistributionBatch,
  returnUnusedPoolBidsForAllocation,
  returnUnusedPoolBidsForExpiredGrant,
  reconcileExpiredPoolAllocationReturns,
  getPoolAccountingSnapshot,
  mapPool,
  mapBatch,
  mapAllocation,
  calculateUnusedBidsToReturn,
  ADMIN_BID_POOL_GRANT_SOURCE,
};
