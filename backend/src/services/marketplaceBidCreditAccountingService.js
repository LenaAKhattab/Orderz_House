/**
 * Marketplace Bid Credits accounting primitives — Phase B1.
 * Expiring grants + immutable ledger. FEFO consume prepared for Phase B2.
 * Does NOT touch Work Token wallets.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  BID_CREDIT_ERROR_CODES,
  BID_CREDIT_LEDGER_EVENT_TYPES,
} = require("../constants/marketplaceBidCredits");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");

/** True when Phase B6 grant columns (amount_revoked / frozen status) exist. */
let grantReversalColumnsReadyCache = null;

async function grantReversalColumnsReady(db) {
  if (grantReversalColumnsReadyCache === true) return true;
  if (grantReversalColumnsReadyCache === false) return false;
  const { rows } = await db.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'marketplace_bid_credit_grants'
          AND column_name = 'amount_revoked'
     ) AS ok`,
  );
  grantReversalColumnsReadyCache = Boolean(rows[0]?.ok);
  return grantReversalColumnsReadyCache;
}

function clearGrantReversalColumnsCache() {
  grantReversalColumnsReadyCache = null;
}

function remainingExpr(hasRevoked) {
  return hasRevoked
    ? "(amount_granted - amount_consumed - amount_expired - COALESCE(amount_revoked, 0))"
    : "(amount_granted - amount_consumed - amount_expired)";
}

function grantRemaining(row) {
  if (!row) return 0;
  const revoked = row.amount_revoked != null ? Number(row.amount_revoked) : 0;
  return Math.max(
    0,
    (Number(row.amount_granted) || 0) -
      (Number(row.amount_consumed) || 0) -
      (Number(row.amount_expired) || 0) -
      revoked,
  );
}

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

function assertPositiveAmount(amount) {
  const n = Number(amount);
  if (!Number.isInteger(n) || n < 1) {
    throw createAppError("Bid Credit amount must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_AMOUNT,
    });
  }
  return n;
}

function assertIdempotencyKey(key) {
  const s = String(key || "").trim();
  if (s.length < 8 || s.length > 180) {
    throw createAppError("Invalid Bid Credit idempotency key.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_IDEMPOTENCY_KEY,
    });
  }
  return s;
}

function assertExpiresAt(expiresAt, grantedAt = new Date()) {
  const exp = new Date(expiresAt);
  const granted = new Date(grantedAt);
  if (Number.isNaN(exp.getTime()) || exp <= granted) {
    throw createAppError("Bid Credit expires_at must be after granted_at.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_EXPIRY,
    });
  }
  return exp;
}

function mapGrant(row) {
  if (!row) return null;
  const granted = Number(row.amount_granted) || 0;
  const consumed = Number(row.amount_consumed) || 0;
  const expired = Number(row.amount_expired) || 0;
  const revoked = row.amount_revoked != null ? Number(row.amount_revoked) : 0;
  const remaining = Math.max(0, granted - consumed - expired - revoked);
  const status = row.status;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    sourceType: row.source_type,
    amountGranted: granted,
    amountConsumed: consumed,
    amountExpired: expired,
    amountRevoked: revoked,
    // Spendable only when active; frozen/revoked/expired/exhausted report 0 available.
    amountAvailable: status === "active" ? remaining : 0,
    amountRemaining: remaining,
    status,
    grantedAt: row.granted_at || null,
    expiresAt: row.expires_at || null,
    frozenAt: row.frozen_at || null,
    freezeReason: row.freeze_reason || null,
    revokedAt: row.revoked_at || null,
    membershipId: row.membership_id != null ? String(row.membership_id) : null,
    cycleId: row.cycle_id != null ? String(row.cycle_id) : null,
    distributionMonthId:
      row.distribution_month_id != null ? String(row.distribution_month_id) : null,
    reason: row.reason || null,
    internalNote: row.internal_note || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapLedger(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    grantId: row.grant_id != null ? String(row.grant_id) : null,
    eventType: row.event_type,
    amount: Number(row.amount) || 0,
    direction: Number(row.direction),
    referenceType: row.reference_type || null,
    referenceId: row.reference_id || null,
    reason: row.reason || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    createdAt: row.created_at || null,
    metadata: row.metadata || {},
  };
}

async function assertSchemaReady(client) {
  const ready = await marketplaceBidCreditsSchemaReady(client);
  if (!ready) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
}

/**
 * Create an expiring grant + ledger credit (idempotent by idempotency_key).
 */
async function createBidCreditGrant({
  client: externalClient = null,
  freelancerUserId,
  sourceType,
  amount,
  expiresAt,
  eventType,
  idempotencyKey,
  membershipId = null,
  cycleId = null,
  distributionMonthId = null,
  reason = null,
  internalNote = null,
  actorUserId = null,
  referenceType = null,
  referenceId = null,
  metadata = {},
  grantedAt = new Date(),
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertSchemaReady(client);

    const fid = Number(freelancerUserId);
    if (!Number.isInteger(fid) || fid < 1) {
      throw createAppError("Invalid freelancer.", 400, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.INVALID_FREELANCER,
      });
    }
    const qty = assertPositiveAmount(amount);
    const key = assertIdempotencyKey(idempotencyKey);
    const exp = assertExpiresAt(expiresAt, grantedAt);
    const grantedInstant = new Date(grantedAt);

    if (!BID_CREDIT_LEDGER_EVENT_TYPES.includes(String(eventType))) {
      throw createAppError("Invalid Bid Credit ledger event.", 400, {
        exposeToClient: false,
      });
    }

    const existing = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    if (existing.rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return { grant: mapGrant(existing.rows[0]), idempotent: true, created: false };
    }

    const { rows: grantRows } = await client.query(
      `INSERT INTO marketplace_bid_credit_grants (
         freelancer_user_id, source_type,
         amount_granted, amount_consumed, amount_expired, status,
         granted_at, expires_at,
         membership_id, cycle_id, distribution_month_id,
         reason, internal_note, actor_user_id,
         idempotency_key, metadata
       ) VALUES (
         $1, $2,
         $3, 0, 0, 'active',
         $4, $5,
         $6, $7, $8,
         $9, $10, $11,
         $12, $13::jsonb
       )
       RETURNING *`,
      [
        fid,
        sourceType,
        qty,
        grantedInstant.toISOString(),
        exp.toISOString(),
        membershipId,
        cycleId,
        distributionMonthId,
        reason,
        internalNote,
        actorUserId,
        key,
        JSON.stringify(metadata || {}),
      ],
    );

    const grant = grantRows[0];
    const ledgerKey = `ledger:${key}`;
    await client.query(
      `INSERT INTO marketplace_bid_credit_ledger_entries (
         freelancer_user_id, grant_id, event_type, amount, direction,
         reference_type, reference_id, idempotency_key,
         reason, actor_user_id, metadata
       ) VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        fid,
        grant.id,
        eventType,
        qty,
        referenceType,
        referenceId != null ? String(referenceId) : null,
        ledgerKey,
        reason,
        actorUserId,
        JSON.stringify(metadata || {}),
      ],
    );

    if (ownTxn) await client.query("COMMIT");
    return { grant: mapGrant(grant), idempotent: false, created: true };
  } catch (err) {
    if (ownTxn) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    if (err && err.code === "23505") {
      const { rows } = await client.query(
        `SELECT * FROM marketplace_bid_credit_grants WHERE idempotency_key = $1 LIMIT 1`,
        [assertIdempotencyKey(idempotencyKey)],
      );
      if (rows[0]) {
        return { grant: mapGrant(rows[0]), idempotent: true, created: false };
      }
      throw createAppError("Bid Credit idempotency conflict.", 409, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.BID_CREDIT_IDEMPOTENCY_CONFLICT,
      });
    }
    throw err;
  } finally {
    if (release) client.release();
  }
}

/**
 * Expire due grants (status active, expires_at <= now, remaining > 0).
 * Idempotent per grant remaining amount via ledger key.
 */
async function expireDueBidCreditGrants({
  client: externalClient = null,
  freelancerUserId = null,
  now = new Date(),
  limit = 500,
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertSchemaReady(client);
    const instant = new Date(now).toISOString();
    const hasRevoked = await grantReversalColumnsReady(client);
    const rem = remainingExpr(hasRevoked);
    // Freeze does NOT extend expiry — frozen grants still expire by expires_at.
    const statusClause = hasRevoked
      ? `status IN ('active', 'frozen')`
      : `status = 'active'`;
    const params = [instant, Math.min(2000, Math.max(1, Number(limit) || 500))];
    let sql = `
      SELECT * FROM marketplace_bid_credit_grants
       WHERE ${statusClause}
         AND expires_at <= $1
         AND ${rem} > 0`;
    if (freelancerUserId != null) {
      params.push(Number(freelancerUserId));
      sql += ` AND freelancer_user_id = $3`;
    }
    sql += ` ORDER BY expires_at ASC, id ASC LIMIT $2 FOR UPDATE`;

    const { rows } = await client.query(sql, params);
    let expiredCount = 0;
    let expiredAmount = 0;
    for (const row of rows) {
      const remaining = grantRemaining(row);
      if (remaining <= 0) continue;
      const ledgerKey = `bid_expire:${row.id}:${remaining}`;
      const existing = await client.query(
        `SELECT id FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1`,
        [ledgerKey],
      );
      if (existing.rows[0]) continue;

      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET amount_expired = amount_expired + $2,
                status = 'expired',
                expired_at = COALESCE(expired_at, $3),
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, remaining, instant],
      );
      await client.query(
        `INSERT INTO marketplace_bid_credit_ledger_entries (
           freelancer_user_id, grant_id, event_type, amount, direction,
           reference_type, reference_id, idempotency_key, reason, metadata
         ) VALUES ($1, $2, 'BID_EXPIRED', $3, -1, 'bid_credit_grant', $4, $5, 'grant_expired', '{}'::jsonb)`,
        [row.freelancer_user_id, row.id, remaining, String(row.id), ledgerKey],
      );
      expiredCount += 1;
      expiredAmount += remaining;
    }
    if (ownTxn) await client.query("COMMIT");
    return { expiredCount, expiredAmount };
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
 * FEFO consume from soonest-expiring active grants.
 * Prepared for Phase B2 — not wired to order applications in B1.
 */
async function consumeBidCreditsFefo({
  client: externalClient = null,
  freelancerUserId,
  amount = 1,
  idempotencyKey,
  referenceType = null,
  referenceId = null,
  reason = null,
  actorUserId = null,
  metadata = {},
  now = new Date(),
  /** Default APPLICATION_BID_CONSUME (B2). Article uses ARTICLE_APPLICATION_BID_CONSUME. */
  eventType = "APPLICATION_BID_CONSUME",
} = {}) {
  const { client, release, ownTxn } = await resolveDbClient(externalClient);
  try {
    if (ownTxn) await client.query("BEGIN");
    await assertSchemaReady(client);
    const fid = Number(freelancerUserId);
    const qty = assertPositiveAmount(amount);
    const key = assertIdempotencyKey(idempotencyKey);
    const instant = new Date(now);
    const ledgerEvent = String(eventType || "APPLICATION_BID_CONSUME").trim();
    if (!BID_CREDIT_LEDGER_EVENT_TYPES.includes(ledgerEvent)) {
      throw createAppError("Invalid Bid Credit ledger event.", 400, {
        exposeToClient: false,
      });
    }

    const prior = await client.query(
      `SELECT * FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1 LIMIT 1`,
      [key],
    );
    if (prior.rows[0]) {
      if (ownTxn) await client.query("COMMIT");
      return { consumed: Number(prior.rows[0].amount), idempotent: true, entry: mapLedger(prior.rows[0]) };
    }

    // Expire first so FEFO sees current usable set
    await expireDueBidCreditGrants({
      client,
      freelancerUserId: fid,
      now: instant,
    });

    const hasRevoked = await grantReversalColumnsReady(client);
    const rem = remainingExpr(hasRevoked);
    const { rows: grants } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants
        WHERE freelancer_user_id = $1
          AND status = 'active'
          AND expires_at > $2
          AND ${rem} > 0
        ORDER BY expires_at ASC, id ASC
        FOR UPDATE`,
      [fid, instant.toISOString()],
    );

    let remaining = qty;
    const allocations = [];
    for (const g of grants) {
      if (remaining <= 0) break;
      const avail = grantRemaining(g);
      if (avail <= 0) continue;
      const take = Math.min(avail, remaining);
      const nextConsumed = Number(g.amount_consumed) + take;
      const revoked = g.amount_revoked != null ? Number(g.amount_revoked) : 0;
      const exhausted =
        nextConsumed + Number(g.amount_expired) + revoked >= Number(g.amount_granted);
      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET amount_consumed = $2,
                status = CASE WHEN $3 THEN 'exhausted' ELSE status END,
                exhausted_at = CASE WHEN $3 THEN COALESCE(exhausted_at, NOW()) ELSE exhausted_at END,
                updated_at = NOW()
          WHERE id = $1`,
        [g.id, nextConsumed, exhausted],
      );
      allocations.push({ grantId: g.id, amount: take });
      remaining -= take;
    }

    if (remaining > 0) {
      throw createAppError("Insufficient Bid Credits.", 409, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.INSUFFICIENT_BID_CREDITS,
      });
    }

    // One ledger row for the consume operation; metadata carries FEFO split.
    const { rows: ledgerRows } = await client.query(
      `INSERT INTO marketplace_bid_credit_ledger_entries (
         freelancer_user_id, grant_id, event_type, amount, direction,
         reference_type, reference_id, idempotency_key,
         reason, actor_user_id, metadata
       ) VALUES (
         $1, $2, $3, $4, -1,
         $5, $6, $7,
         $8, $9, $10::jsonb
       )
       RETURNING *`,
      [
        fid,
        allocations[0]?.grantId || null,
        ledgerEvent,
        qty,
        referenceType,
        referenceId != null ? String(referenceId) : null,
        key,
        reason,
        actorUserId,
        JSON.stringify({ ...(metadata || {}), fefoAllocations: allocations }),
      ],
    );

    if (ownTxn) await client.query("COMMIT");
    return {
      consumed: qty,
      idempotent: false,
      allocations,
      entry: mapLedger(ledgerRows[0]),
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

async function sumAvailableBidCredits({ client, freelancerUserId, now = new Date() }) {
  await expireDueBidCreditGrants({ client, freelancerUserId, now });
  const hasRevoked = await grantReversalColumnsReady(client);
  const rem = remainingExpr(hasRevoked);
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(${rem}), 0)::int AS available
       FROM marketplace_bid_credit_grants
      WHERE freelancer_user_id = $1
        AND status = 'active'
        AND expires_at > $2`,
    [Number(freelancerUserId), new Date(now).toISOString()],
  );
  return Number(rows[0]?.available) || 0;
}

/**
 * Freeze unused remainder of a single grant (status → frozen).
 * State-only — no ledger quantity change / no fake consumption.
 */
async function freezeBidCreditGrant({
  client,
  grantId,
  reason = "payment_dispute",
  now = new Date(),
} = {}) {
  if (!(await grantReversalColumnsReady(client))) {
    throw createAppError("Bid grant freeze schema is not applied yet.", 503);
  }
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
    [Number(grantId)],
  );
  const grant = rows[0];
  if (!grant) {
    return { frozen: false, reason: "grant_not_found" };
  }
  if (grant.status === "frozen") {
    return { frozen: false, reason: "already_frozen", grant: mapGrant(grant) };
  }
  if (grant.status !== "active") {
    return { frozen: false, reason: `status_${grant.status}`, grant: mapGrant(grant) };
  }
  if (grantRemaining(grant) <= 0) {
    return { frozen: false, reason: "nothing_to_freeze", grant: mapGrant(grant) };
  }
  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_grants
        SET status = 'frozen',
            frozen_at = COALESCE(frozen_at, $2),
            freeze_reason = COALESCE($3, freeze_reason),
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [grant.id, new Date(now).toISOString(), reason],
  );
  return { frozen: true, grant: mapGrant(updated[0]), unused: grantRemaining(updated[0]) };
}

/**
 * Unfreeze grant if still within original expires_at and has remaining.
 * Does NOT extend expiry. Does NOT create a new grant.
 */
async function unfreezeBidCreditGrant({
  client,
  grantId,
  now = new Date(),
} = {}) {
  if (!(await grantReversalColumnsReady(client))) {
    throw createAppError("Bid grant freeze schema is not applied yet.", 503);
  }
  const instant = new Date(now);
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
    [Number(grantId)],
  );
  const grant = rows[0];
  if (!grant) {
    return { unfrozen: false, reason: "grant_not_found" };
  }
  if (grant.status !== "frozen") {
    return { unfrozen: false, reason: `status_${grant.status}`, grant: mapGrant(grant) };
  }
  if (new Date(grant.expires_at) <= instant) {
    // Expire in place — do not resurrect.
    const remaining = grantRemaining(grant);
    if (remaining > 0) {
      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET amount_expired = amount_expired + $2,
                status = 'expired',
                expired_at = COALESCE(expired_at, $3),
                freeze_reason = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [grant.id, remaining, instant.toISOString()],
      );
    } else {
      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET status = 'expired',
                expired_at = COALESCE(expired_at, $2),
                freeze_reason = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [grant.id, instant.toISOString()],
      );
    }
    const again = await client.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id = $1`, [
      grant.id,
    ]);
    return { unfrozen: false, reason: "expired_during_freeze", grant: mapGrant(again.rows[0]) };
  }
  if (grantRemaining(grant) <= 0) {
    return { unfrozen: false, reason: "nothing_to_unfreeze", grant: mapGrant(grant) };
  }
  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_grants
        SET status = 'active',
            freeze_reason = NULL,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [grant.id],
  );
  return { unfrozen: true, grant: mapGrant(updated[0]), unused: grantRemaining(updated[0]) };
}

/**
 * Permanently revoke unused remainder of a grant (economic).
 * Ledger: BID_PACKAGE_PURCHASE_REVOKE (or caller-supplied event).
 * Never claws back amount_consumed. Never goes negative.
 */
async function revokeUnusedBidCreditGrantRemainder({
  client,
  grantId,
  idempotencyKey,
  eventType = "BID_PACKAGE_PURCHASE_REVOKE",
  reason = "package_purchase_reversal",
  referenceType = null,
  referenceId = null,
  actorUserId = null,
  metadata = {},
  now = new Date(),
} = {}) {
  if (!(await grantReversalColumnsReady(client))) {
    throw createAppError("Bid grant revoke schema is not applied yet.", 503);
  }
  const key = assertIdempotencyKey(idempotencyKey);
  const prior = await client.query(
    `SELECT * FROM marketplace_bid_credit_ledger_entries WHERE idempotency_key = $1 LIMIT 1`,
    [key],
  );
  if (prior.rows[0]) {
    const g = await client.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id = $1`, [
      Number(grantId),
    ]);
    return {
      revoked: Number(prior.rows[0].amount) || 0,
      idempotent: true,
      grant: mapGrant(g.rows[0]),
      entry: mapLedger(prior.rows[0]),
    };
  }

  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
    [Number(grantId)],
  );
  const grant = rows[0];
  if (!grant) {
    return { revoked: 0, reason: "grant_not_found", idempotent: false };
  }
  if (!["active", "frozen"].includes(grant.status) && grantRemaining(grant) <= 0) {
    return { revoked: 0, reason: `status_${grant.status}`, grant: mapGrant(grant), idempotent: false };
  }

  const unused = grantRemaining(grant);
  if (unused <= 0) {
    // Still mark revoked if active/frozen with zero remaining for audit consistency.
    if (grant.status === "active" || grant.status === "frozen") {
      await client.query(
        `UPDATE marketplace_bid_credit_grants
            SET status = CASE
                  WHEN amount_consumed >= amount_granted THEN 'exhausted'
                  ELSE 'revoked'
                END,
                revoked_at = COALESCE(revoked_at, $2),
                freeze_reason = NULL,
                updated_at = NOW()
          WHERE id = $1`,
        [grant.id, new Date(now).toISOString()],
      );
    }
    const again = await client.query(`SELECT * FROM marketplace_bid_credit_grants WHERE id = $1`, [
      grant.id,
    ]);
    return { revoked: 0, reason: "nothing_to_revoke", grant: mapGrant(again.rows[0]), idempotent: false };
  }

  const ledgerEvent = String(eventType || "BID_PACKAGE_PURCHASE_REVOKE").trim();
  if (!BID_CREDIT_LEDGER_EVENT_TYPES.includes(ledgerEvent)) {
    throw createAppError("Invalid Bid Credit ledger event.", 400);
  }

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_grants
        SET amount_revoked = amount_revoked + $2,
            status = 'revoked',
            revoked_at = COALESCE(revoked_at, $3),
            freeze_reason = NULL,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [grant.id, unused, new Date(now).toISOString()],
  );

  const { rows: ledgerRows } = await client.query(
    `INSERT INTO marketplace_bid_credit_ledger_entries (
       freelancer_user_id, grant_id, event_type, amount, direction,
       reference_type, reference_id, idempotency_key,
       reason, actor_user_id, metadata
     ) VALUES (
       $1, $2, $3, $4, -1,
       $5, $6, $7,
       $8, $9, $10::jsonb
     )
     RETURNING *`,
    [
      grant.freelancer_user_id,
      grant.id,
      ledgerEvent,
      unused,
      referenceType,
      referenceId != null ? String(referenceId) : null,
      key,
      reason,
      actorUserId,
      JSON.stringify({
        ...(metadata || {}),
        consumedAtRevoke: Number(grant.amount_consumed) || 0,
        unusedRevoked: unused,
      }),
    ],
  );

  return {
    revoked: unused,
    idempotent: false,
    grant: mapGrant(updated[0]),
    entry: mapLedger(ledgerRows[0]),
    consumedBefore: Number(grant.amount_consumed) || 0,
  };
}

async function listBidCreditGrantsForFreelancer({
  freelancerUserId,
  includeExhausted = true,
  limit = 50,
  client: externalClient = null,
} = {}) {
  const { client, release } = await resolveDbClient(externalClient);
  try {
    await assertSchemaReady(client);
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants
        WHERE freelancer_user_id = $1
          AND ($2::boolean OR status = 'active')
        ORDER BY expires_at ASC, id ASC
        LIMIT $3`,
      [Number(freelancerUserId), includeExhausted, Math.min(200, Math.max(1, Number(limit) || 50))],
    );
    return rows.map(mapGrant);
  } finally {
    if (release) client.release();
  }
}

async function listBidCreditLedgerForFreelancer({
  freelancerUserId,
  limit = 50,
  client: externalClient = null,
} = {}) {
  const { client, release } = await resolveDbClient(externalClient);
  try {
    await assertSchemaReady(client);
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_ledger_entries
        WHERE freelancer_user_id = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      [Number(freelancerUserId), Math.min(200, Math.max(1, Number(limit) || 50))],
    );
    return rows.map(mapLedger);
  } finally {
    if (release) client.release();
  }
}

module.exports = {
  createBidCreditGrant,
  expireDueBidCreditGrants,
  consumeBidCreditsFefo,
  sumAvailableBidCredits,
  freezeBidCreditGrant,
  unfreezeBidCreditGrant,
  revokeUnusedBidCreditGrantRemainder,
  grantRemaining,
  grantReversalColumnsReady,
  clearGrantReversalColumnsCache,
  listBidCreditGrantsForFreelancer,
  listBidCreditLedgerForFreelancer,
  mapGrant,
  mapLedger,
  assertPositiveAmount,
  assertIdempotencyKey,
};
