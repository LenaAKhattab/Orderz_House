/**
 * Phase E2 — Bid Credit reservation (FEFO slices).
 * Reserve ≠ consume. Protects Bids until final Article approval or release.
 */

const { createAppError } = require("../utils/AppError");
const { BID_CREDIT_ERROR_CODES } = require("../constants/marketplaceBidCredits");
const accounting = require("./marketplaceBidCreditAccountingService");
const dailySpend = require("./marketplaceMembershipDailyBidSpendService");

async function schemaReady(client) {
  const { rows } = await client.query(
    `SELECT to_regclass('public.marketplace_bid_credit_reservations') AS t,
            to_regclass('public.marketplace_bid_credit_reservation_slices') AS s`,
  );
  return Boolean(rows[0]?.t && rows[0]?.s);
}

function mapReservation(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    freelancerUserId: Number(row.freelancer_user_id),
    amount: Number(row.amount),
    status: row.status,
    purpose: row.purpose,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    articleId: row.article_id != null ? Number(row.article_id) : null,
    articleApplicationId:
      row.article_application_id != null ? Number(row.article_application_id) : null,
    dailySpendDate: row.daily_spend_date || null,
    dailySpendAmount: Number(row.daily_spend_amount) || 0,
    reservedAt: row.reserved_at,
    consumedAt: row.consumed_at,
    releasedAt: row.released_at,
    releaseReason: row.release_reason || null,
    idempotencyKey: row.idempotency_key,
  };
}

/**
 * FEFO reserve: lock grants, increment amount_reserved, store immutable slices.
 * Counts against E1 daily Bid participation cap (once).
 */
async function reserveBidCreditsFefo({
  client,
  freelancerUserId,
  amount = 1,
  idempotencyKey,
  referenceType,
  referenceId,
  articleId = null,
  articleApplicationId = null,
  purpose = "article_application",
  actorUserId = null,
  now = new Date(),
  applyDailyLimit = true,
} = {}) {
  if (!client) {
    throw createAppError("reserveBidCreditsFefo requires a transaction client.", 500);
  }
  if (!(await schemaReady(client))) {
    throw createAppError("Bid reservation schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }

  const fid = Number(freelancerUserId);
  const qty = Number(amount);
  if (!Number.isInteger(qty) || qty < 1) {
    throw createAppError("Reservation amount must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_AMOUNT,
    });
  }
  const key = String(idempotencyKey || "").trim();
  if (key.length < 8 || key.length > 180) {
    throw createAppError("Invalid reservation idempotency key.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_IDEMPOTENCY_KEY,
    });
  }

  const prior = await client.query(
    `SELECT * FROM marketplace_bid_credit_reservations WHERE idempotency_key = $1 LIMIT 1`,
    [key],
  );
  if (prior.rows[0]) {
    return { reservation: mapReservation(prior.rows[0]), idempotent: true, slices: [] };
  }

  const instant = new Date(now);
  await accounting.expireDueBidCreditGrants({
    client,
    freelancerUserId: fid,
    now: instant,
  });

  let dailyMeta = { gated: false };
  if (applyDailyLimit) {
    dailyMeta = await dailySpend.assertAndConsumeDailyBidSpend({
      client,
      freelancerUserId: fid,
      amount: qty,
      now: instant,
    });
  }

  const { rows: grants } = await client.query(
    `SELECT * FROM marketplace_bid_credit_grants
      WHERE freelancer_user_id = $1
        AND status = 'active'
        AND expires_at > $2
        AND (amount_granted - amount_consumed - amount_expired
             - COALESCE(amount_revoked, 0) - COALESCE(amount_reserved, 0)) > 0
      ORDER BY expires_at ASC, id ASC
      FOR UPDATE`,
    [fid, instant.toISOString()],
  );

  let remaining = qty;
  const slices = [];
  for (const g of grants) {
    if (remaining <= 0) break;
    const avail = accounting.grantRemaining(g, { includeReserved: true });
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_reserved = COALESCE(amount_reserved, 0) + $2,
              updated_at = NOW()
        WHERE id = $1`,
      [g.id, take],
    );
    slices.push({
      grantId: Number(g.id),
      amount: take,
      grantExpiresAt: g.expires_at,
      grantSourceType: g.source_type,
    });
    remaining -= take;
  }

  if (remaining > 0) {
    throw createAppError("Insufficient Bid Credits to reserve.", 409, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INSUFFICIENT_BID_CREDITS,
    });
  }

  const { rows: resRows } = await client.query(
    `INSERT INTO marketplace_bid_credit_reservations (
       freelancer_user_id, amount, status, purpose,
       reference_type, reference_id, article_id, article_application_id,
       daily_spend_date, daily_spend_amount, reserved_at, idempotency_key, metadata
     ) VALUES (
       $1,$2,'active',$3,
       $4,$5,$6,$7,
       $8::date,$9,$10,$11,$12::jsonb
     ) RETURNING *`,
    [
      fid,
      qty,
      purpose,
      String(referenceType),
      String(referenceId),
      articleId != null ? Number(articleId) : null,
      articleApplicationId != null ? Number(articleApplicationId) : null,
      dailyMeta.spendDate || null,
      dailyMeta.gated ? qty : 0,
      instant.toISOString(),
      key,
      JSON.stringify({ actorUserId, phase: "E2", daily: dailyMeta }),
    ],
  );
  const reservation = resRows[0];

  for (const s of slices) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `INSERT INTO marketplace_bid_credit_reservation_slices (
         reservation_id, grant_id, amount, grant_expires_at_snapshot, grant_source_type_snapshot
       ) VALUES ($1,$2,$3,$4,$5)`,
      [reservation.id, s.grantId, s.amount, s.grantExpiresAt, s.grantSourceType],
    );
  }

  await client.query(
    `INSERT INTO marketplace_bid_credit_ledger_entries (
       freelancer_user_id, grant_id, event_type, amount, direction,
       reference_type, reference_id, idempotency_key, reason, actor_user_id, metadata
     ) VALUES (
       $1,$2,'BID_RESERVE',$3,-1,
       $4,$5,$6,'article_bid_reserve',$7,$8::jsonb
     )`,
    [
      fid,
      slices[0]?.grantId || null,
      qty,
      String(referenceType),
      String(referenceId),
      `bid_reserve:${key}`,
      actorUserId,
      JSON.stringify({ fefoSlices: slices, reservationId: Number(reservation.id) }),
    ],
  );

  return {
    reservation: mapReservation(reservation),
    idempotent: false,
    slices,
    daily: dailyMeta,
  };
}

async function releaseBidCreditReservation({
  client,
  reservationId = null,
  idempotencyKey = null,
  reason = "released",
  now = new Date(),
  restoreDailyLimit = true,
} = {}) {
  if (!client) {
    throw createAppError("releaseBidCreditReservation requires a transaction client.", 500);
  }

  let row;
  if (reservationId != null) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_reservations WHERE id = $1 FOR UPDATE`,
      [Number(reservationId)],
    );
    row = rows[0];
  } else if (idempotencyKey) {
    const { rows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_reservations WHERE idempotency_key = $1 FOR UPDATE`,
      [String(idempotencyKey)],
    );
    row = rows[0];
  }
  if (!row) {
    throw createAppError("Bid reservation not found.", 404, {
      exposeToClient: true,
      publicCode: "BID_RESERVATION_NOT_FOUND",
    });
  }
  if (row.status === "released") {
    return { reservation: mapReservation(row), idempotent: true, released: false };
  }
  if (row.status === "consumed") {
    throw createAppError("Consumed Bid reservation cannot be released.", 409, {
      exposeToClient: true,
      publicCode: "BID_RESERVATION_ALREADY_CONSUMED",
    });
  }
  if (row.status !== "active") {
    throw createAppError("Bid reservation is not active.", 409, {
      exposeToClient: true,
      publicCode: "ARTICLE_RESERVATION_NOT_ACTIVE",
    });
  }

  const { rows: slices } = await client.query(
    `SELECT * FROM marketplace_bid_credit_reservation_slices WHERE reservation_id = $1 FOR UPDATE`,
    [row.id],
  );
  const instant = new Date(now).toISOString();
  for (const s of slices) {
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_reserved = GREATEST(0, COALESCE(amount_reserved, 0) - $2),
              updated_at = NOW()
        WHERE id = $1`,
      [s.grant_id, Number(s.amount)],
    );
    // If grant past expiry and no remaining reserved/spendable free, expire leftover on next tick.
  }

  const releaseKey = `bid_reserve_release:${row.idempotency_key}`;
  await client.query(
    `INSERT INTO marketplace_bid_credit_ledger_entries (
       freelancer_user_id, grant_id, event_type, amount, direction,
       reference_type, reference_id, idempotency_key, reason, metadata
     ) VALUES (
       $1,$2,'BID_RESERVE_RELEASE',$3,1,
       $4,$5,$6,$7,$8::jsonb
     )
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      row.freelancer_user_id,
      slices[0]?.grant_id || null,
      Number(row.amount),
      row.reference_type,
      row.reference_id,
      releaseKey,
      reason,
      JSON.stringify({ reservationId: Number(row.id), phase: "E2" }),
    ],
  );

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_reservations
        SET status = 'released',
            released_at = $2,
            release_reason = $3,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [row.id, instant, reason],
  );

  let dailyRestore = null;
  if (restoreDailyLimit && Number(row.daily_spend_amount) > 0 && row.daily_spend_date) {
    dailyRestore = await dailySpend.releaseDailyBidSpend({
      client,
      freelancerUserId: row.freelancer_user_id,
      amount: Number(row.daily_spend_amount),
      spendDate: row.daily_spend_date,
      now,
    });
  }

  // After release, allow expiry/pool return of formerly reserved Bids.
  await accounting.expireDueBidCreditGrants({
    client,
    freelancerUserId: row.freelancer_user_id,
    now,
  });

  return {
    reservation: mapReservation(updated[0]),
    idempotent: false,
    released: true,
    dailyRestore,
  };
}

/**
 * Convert active reservation → permanent consume using stored FEFO slices.
 * Does NOT re-run FEFO selection. Does NOT re-count daily limit.
 */
async function consumeBidCreditReservation({
  client,
  reservationId,
  now = new Date(),
  actorUserId = null,
} = {}) {
  if (!client) {
    throw createAppError("consumeBidCreditReservation requires a transaction client.", 500);
  }
  const { rows } = await client.query(
    `SELECT * FROM marketplace_bid_credit_reservations WHERE id = $1 FOR UPDATE`,
    [Number(reservationId)],
  );
  const row = rows[0];
  if (!row) {
    throw createAppError("Bid reservation not found.", 404, {
      exposeToClient: true,
      publicCode: "BID_RESERVATION_NOT_FOUND",
    });
  }
  if (row.status === "consumed") {
    return { reservation: mapReservation(row), idempotent: true, consumed: false };
  }
  if (row.status !== "active") {
    throw createAppError("Bid reservation is not active for consume.", 409, {
      exposeToClient: true,
      publicCode: "ARTICLE_RESERVATION_NOT_ACTIVE",
    });
  }

  const { rows: slices } = await client.query(
    `SELECT * FROM marketplace_bid_credit_reservation_slices WHERE reservation_id = $1 FOR UPDATE`,
    [row.id],
  );
  if (!slices.length) {
    throw createAppError("Reservation has no FEFO slices.", 500);
  }

  const instant = new Date(now).toISOString();
  for (const s of slices) {
    const take = Number(s.amount);
    // eslint-disable-next-line no-await-in-loop
    const { rows: gRows } = await client.query(
      `SELECT * FROM marketplace_bid_credit_grants WHERE id = $1 FOR UPDATE`,
      [s.grant_id],
    );
    const g = gRows[0];
    if (!g) {
      throw createAppError("Reserved grant missing.", 500);
    }
    const reserved = Number(g.amount_reserved) || 0;
    if (reserved < take) {
      throw createAppError("Reserved grant slice mismatch.", 409, {
        exposeToClient: false,
        publicCode: "BID_RESERVATION_SLICE_MISMATCH",
      });
    }
    const nextConsumed = Number(g.amount_consumed) + take;
    const nextReserved = reserved - take;
    const revoked = g.amount_revoked != null ? Number(g.amount_revoked) : 0;
    const exhausted =
      nextConsumed + Number(g.amount_expired) + revoked + nextReserved >= Number(g.amount_granted);
    // eslint-disable-next-line no-await-in-loop
    await client.query(
      `UPDATE marketplace_bid_credit_grants
          SET amount_reserved = $2,
              amount_consumed = $3,
              status = CASE WHEN $4 THEN 'exhausted' ELSE status END,
              exhausted_at = CASE WHEN $4 THEN COALESCE(exhausted_at, NOW()) ELSE exhausted_at END,
              updated_at = NOW()
        WHERE id = $1`,
      [g.id, nextReserved, nextConsumed, exhausted],
    );
  }

  const consumeKey = `bid_reserve_consume:${row.idempotency_key}`;
  await client.query(
    `INSERT INTO marketplace_bid_credit_ledger_entries (
       freelancer_user_id, grant_id, event_type, amount, direction,
       reference_type, reference_id, idempotency_key, reason, actor_user_id, metadata
     ) VALUES (
       $1,$2,'BID_RESERVE_CONSUME',$3,-1,
       $4,$5,$6,'article_final_approval_bid_consume',$7,$8::jsonb
     )
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      row.freelancer_user_id,
      slices[0].grant_id,
      Number(row.amount),
      row.reference_type,
      row.reference_id,
      consumeKey,
      actorUserId,
      JSON.stringify({ reservationId: Number(row.id), phase: "E2" }),
    ],
  );

  const { rows: updated } = await client.query(
    `UPDATE marketplace_bid_credit_reservations
        SET status = 'consumed',
            consumed_at = $2,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [row.id, instant],
  );

  return {
    reservation: mapReservation(updated[0]),
    idempotent: false,
    consumed: true,
    amount: Number(row.amount),
  };
}

module.exports = {
  schemaReady,
  mapReservation,
  reserveBidCreditsFefo,
  releaseBidCreditReservation,
  consumeBidCreditReservation,
};
