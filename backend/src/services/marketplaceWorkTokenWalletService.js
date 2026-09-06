/**
 * Marketplace Work Token Wallet — Phase 4 accounting foundation (hardened).
 *
 * - Reservation identity: UNIQUE(wallet_id, reference_type, reference_id)
 * - Ledger operation idempotency: UNIQUE(wallet_id, idempotency_key)
 * - Business reference ≠ operation idempotency key
 * - Ownership enforced on every reservation resolution
 *
 * Accepts existing DB client for future Priority Auction atomicity.
 * No Stripe. No Order wiring. No auction. No Token grants automation.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  getMarketplaceEconomySettings,
  isWorkTokensEngineActive,
} = require("./marketplaceEconomySettingsService");
const {
  WORK_TOKEN_ERROR_CODES,
  DEFAULT_CREDIT_EVENT,
  DEFAULT_RESERVE_EVENT,
  DEFAULT_RELEASE_EVENT,
  DEFAULT_CONSUME_EVENT,
  RESERVE_EVENTS,
  RELEASE_EVENTS,
  CONSUME_RESERVED_EVENTS,
  isValidWorkTokenLedgerEvent,
} = require("../constants/marketplaceWorkTokens");
const {
  assertPositiveTokenAmount,
  deltasForBalanceEffect,
  applyDeltasToBalances,
  deriveBalancesFromLedger,
  reservationIncreaseDelta,
  mapPublicLedgerDirection,
  eventTypeBalanceEffectOrThrow,
} = require("../utils/marketplaceWorkTokenAccounting");

function mapWallet(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    availableTokens: Number(row.available_tokens),
    reservedTokens: Number(row.reserved_tokens),
    version: Number(row.version) || 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapReservation(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    freelancerUserId: String(row.freelancer_user_id),
    referenceType: row.reference_type,
    referenceId: String(row.reference_id),
    reservedTokens: Number(row.reserved_tokens),
    consumedTokens: Number(row.consumed_tokens),
    status: row.status,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    releasedAt: row.released_at || null,
    consumedAt: row.consumed_at || null,
  };
}

function mapLedger(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    freelancerUserId: String(row.freelancer_user_id),
    reservationId: row.reservation_id != null ? String(row.reservation_id) : null,
    eventType: row.event_type,
    amountTokens: Number(row.amount_tokens),
    balanceEffect: row.balance_effect,
    availableDelta: Number(row.available_delta),
    reservedDelta: Number(row.reserved_delta),
    availableAfter: Number(row.available_after),
    reservedAfter: Number(row.reserved_after),
    referenceType: row.reference_type,
    referenceId: String(row.reference_id),
    idempotencyKey: row.idempotency_key,
    relatedEntryId: row.related_entry_id != null ? String(row.related_entry_id) : null,
    reason: row.reason || null,
    metadata: row.metadata_json || null,
    actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
    createdAt: row.created_at || null,
    direction: mapPublicLedgerDirection(row.balance_effect),
  };
}

async function resolveDbClient(externalClient) {
  if (externalClient) {
    return { client: externalClient, release: false, ownTxn: false };
  }
  const client = await pool.connect();
  return { client, release: true, ownTxn: true };
}

function assertFreelancerUserId(freelancerUserId) {
  const id = Number(freelancerUserId);
  if (!Number.isInteger(id) || id < 1) {
    throw createAppError("freelancerUserId is required.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_FREELANCER,
    });
  }
  return id;
}

function assertReference(referenceType, referenceId) {
  const type = String(referenceType || "").trim();
  const id = String(referenceId || "").trim();
  if (!type || !id || type.length > 80 || id.length > 120) {
    throw createAppError("referenceType and referenceId are required.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_REFERENCE,
    });
  }
  return { referenceType: type, referenceId: id };
}

function assertIdempotencyKey(value, { required = false } = {}) {
  if (value == null || value === "") {
    if (required) {
      throw createAppError("idempotencyKey is required for this Work Token operation.", 400, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_IDEMPOTENCY_KEY,
      });
    }
    return null;
  }
  const key = String(value).trim();
  if (!key || key.length > 180) {
    throw createAppError("idempotencyKey must be a non-empty string up to 180 characters.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_IDEMPOTENCY_KEY,
    });
  }
  return key;
}

function defaultIdempotencyKey(prefix, eventType, referenceType, referenceId) {
  return `${prefix}:${eventType}:${referenceType}:${referenceId}`;
}

function assertReservationOwnership(reservation, wallet, freelancerUserId) {
  if (!reservation) return;
  if (
    Number(reservation.wallet_id) !== Number(wallet.id) ||
    Number(reservation.freelancer_user_id) !== Number(freelancerUserId)
  ) {
    throw createAppError("Work Token reservation ownership conflict.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_OWNERSHIP_CONFLICT,
    });
  }
}

/**
 * Read-only snapshot. Does NOT create a wallet row when absent.
 */
async function getWorkTokenWalletSnapshot(freelancerUserId, options = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT * FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1 LIMIT 1`,
    [id],
  );
  const settings = options.settings || (await getMarketplaceEconomySettings(db));
  const engineAvailable = isWorkTokensEngineActive(settings);

  if (!rows[0]) {
    return {
      exists: false,
      walletId: null,
      freelancerUserId: String(id),
      availableTokens: 0,
      reservedTokens: 0,
      engineAvailable,
      workTokensEnabled: engineAvailable,
    };
  }
  const wallet = mapWallet(rows[0]);
  return {
    exists: true,
    walletId: wallet.id,
    freelancerUserId: wallet.freelancerUserId,
    availableTokens: wallet.availableTokens,
    reservedTokens: wallet.reservedTokens,
    version: wallet.version,
    createdAt: wallet.createdAt,
    updatedAt: wallet.updatedAt,
    engineAvailable,
    workTokensEnabled: engineAvailable,
  };
}

async function getOrCreateWorkTokenWallet(freelancerUserId, options = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const { client, release, ownTxn } = await resolveDbClient(options.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    await client.query(
      `INSERT INTO freelancer_work_token_wallets (freelancer_user_id)
       VALUES ($1)
       ON CONFLICT (freelancer_user_id) DO NOTHING`,
      [id],
    );
    const { rows } = await client.query(
      `SELECT * FROM freelancer_work_token_wallets
       WHERE freelancer_user_id = $1
       FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw createAppError("Failed to create Work Token wallet.", 500);
    if (ownTxn) await client.query("COMMIT");
    return mapWallet(rows[0]);
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

async function lockWalletByFreelancer(client, freelancerUserId) {
  await client.query(
    `INSERT INTO freelancer_work_token_wallets (freelancer_user_id)
     VALUES ($1)
     ON CONFLICT (freelancer_user_id) DO NOTHING`,
    [freelancerUserId],
  );
  const { rows } = await client.query(
    `SELECT * FROM freelancer_work_token_wallets
     WHERE freelancer_user_id = $1
     FOR UPDATE`,
    [freelancerUserId],
  );
  if (!rows[0]) throw createAppError("Failed to lock Work Token wallet.", 500);
  return rows[0];
}

async function findReservationByWalletReference(
  client,
  walletId,
  referenceType,
  referenceId,
  forUpdate = false,
) {
  const sql = `SELECT * FROM work_token_reservations
               WHERE wallet_id = $1
                 AND reference_type = $2
                 AND reference_id = $3
               LIMIT 1${forUpdate ? " FOR UPDATE" : ""}`;
  const { rows } = await client.query(sql, [walletId, referenceType, referenceId]);
  return rows[0] || null;
}

async function findLedgerByIdempotencyKey(client, walletId, idempotencyKey) {
  const { rows } = await client.query(
    `SELECT * FROM work_token_ledger_entries
     WHERE wallet_id = $1 AND idempotency_key = $2
     LIMIT 1`,
    [walletId, idempotencyKey],
  );
  return rows[0] || null;
}

async function insertLedgerEntry(client, payload) {
  const { rows } = await client.query(
    `INSERT INTO work_token_ledger_entries (
       wallet_id, freelancer_user_id, reservation_id,
       event_type, amount_tokens, balance_effect,
       available_delta, reserved_delta, available_after, reserved_after,
       reference_type, reference_id, idempotency_key, related_entry_id,
       reason, metadata_json, actor_user_id
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13, $14,
       $15, $16::jsonb, $17
     )
     RETURNING *`,
    [
      payload.walletId,
      payload.freelancerUserId,
      payload.reservationId || null,
      payload.eventType,
      payload.amountTokens,
      payload.balanceEffect,
      payload.availableDelta,
      payload.reservedDelta,
      payload.availableAfter,
      payload.reservedAfter,
      payload.referenceType,
      payload.referenceId,
      payload.idempotencyKey,
      payload.relatedEntryId || null,
      payload.reason || null,
      payload.metadata ? JSON.stringify(payload.metadata) : null,
      payload.actorUserId || null,
    ],
  );
  return rows[0];
}

async function updateWalletBalances(client, walletId, available, reserved) {
  const { rows } = await client.query(
    `UPDATE freelancer_work_token_wallets
     SET available_tokens = $2,
         reserved_tokens = $3,
         version = version + 1,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [walletId, available, reserved],
  );
  return rows[0];
}

function idempotentReplayOrConflict(existingEntry, amountTokens) {
  if (Number(existingEntry.amount_tokens) !== Number(amountTokens)) {
    throw createAppError("Work Token operation idempotency conflict.", 409, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
    });
  }
  return true;
}

async function creditWorkTokens(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const amount = assertPositiveTokenAmount(input.amountTokens ?? input.amount, "amountTokens");
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || DEFAULT_CREDIT_EVENT).trim();
  if (
    eventType === "IDENTITY_VERIFICATION_BONUS" ||
    eventType === "PAYOUT_VERIFICATION_BONUS"
  ) {
    throw createAppError("This reward path is no longer available.", 410, {
      exposeToClient: true,
      publicCode: "WORK_TOKENS_DEPRECATED",
    });
  }
  if (!isValidWorkTokenLedgerEvent(eventType) || eventTypeBalanceEffectOrThrow(eventType) !== "credit_available") {
    throw createAppError("creditWorkTokens requires a credit event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey =
    assertIdempotencyKey(input.idempotencyKey) ||
    defaultIdempotencyKey("credit", eventType, referenceType, referenceId);

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);

    const existing = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    if (existing) {
      idempotentReplayOrConflict(existing, amount);
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, idempotent: true, wallet: mapWallet(wallet), entry: mapLedger(existing) };
    }

    const balanceEffect = "credit_available";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, amount);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );
    const updated = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    let entry;
    try {
      entry = await insertLedgerEntry(client, {
        walletId: wallet.id,
        freelancerUserId,
        eventType,
        amountTokens: amount,
        balanceEffect,
        availableDelta,
        reservedDelta,
        availableAfter: next.available,
        reservedAfter: next.reserved,
        referenceType,
        referenceId,
        idempotencyKey,
        reason: input.reason || null,
        metadata: input.metadata || null,
        actorUserId: input.actorUserId || null,
      });
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
        if (again) {
          idempotentReplayOrConflict(again, amount);
          const restored = await updateWalletBalances(
            client,
            wallet.id,
            Number(again.available_after),
            Number(again.reserved_after),
          );
          if (ownTxn) await client.query("COMMIT");
          return { ok: true, idempotent: true, wallet: mapWallet(restored), entry: mapLedger(again) };
        }
      }
      throw err;
    }

    if (ownTxn) await client.query("COMMIT");
    return { ok: true, idempotent: false, wallet: mapWallet(updated), entry: mapLedger(entry) };
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

async function reserveWorkTokens(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const amount = assertPositiveTokenAmount(input.amountTokens ?? input.amount, "amountTokens");
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || DEFAULT_RESERVE_EVENT).trim();
  if (!isValidWorkTokenLedgerEvent(eventType) || eventTypeBalanceEffectOrThrow(eventType) !== "reserve") {
    throw createAppError("reserveWorkTokens requires a reserve event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  if (eventType === "PRIORITY_BID_INCREASE_RESERVE") {
    throw createAppError("Use increaseWorkTokenReservation for reservation increases.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey =
    assertIdempotencyKey(input.idempotencyKey) ||
    defaultIdempotencyKey("reserve", eventType, referenceType, referenceId);

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);

    const existingEntry = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    const existingRes = await findReservationByWalletReference(
      client,
      wallet.id,
      referenceType,
      referenceId,
      true,
    );
    if (existingRes) assertReservationOwnership(existingRes, wallet, freelancerUserId);

    if (existingEntry) {
      idempotentReplayOrConflict(existingEntry, amount);
      if (existingRes && Number(existingRes.reserved_tokens) !== amount && existingRes.status === "active") {
        throw createAppError("Work Token reserve idempotency conflict.", 409, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
        });
      }
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: existingRes ? mapReservation(existingRes) : null,
        entry: mapLedger(existingEntry),
      };
    }

    if (existingRes) {
      if (existingRes.status !== "active") {
        throw createAppError("Work Token reservation already closed for this reference.", 409, {
          exposeToClient: true,
          publicCode:
            existingRes.status === "consumed"
              ? WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_CONSUMED
              : WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_RELEASED,
        });
      }
      if (Number(existingRes.reserved_tokens) !== amount) {
        throw createAppError("Work Token reserve idempotency conflict.", 409, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
        });
      }
      // Same amount + same business reservation already exists: treat as idempotent reserve.
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(existingRes),
        entry: null,
      };
    }

    if (Number(wallet.available_tokens) < amount) {
      throw createAppError("Insufficient Work Tokens available to reserve.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
      });
    }

    const balanceEffect = "reserve";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, amount);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );

    let reservationRow;
    try {
      const inserted = await client.query(
        `INSERT INTO work_token_reservations (
           wallet_id, freelancer_user_id, reference_type, reference_id,
           reserved_tokens, consumed_tokens, status
         ) VALUES ($1, $2, $3, $4, $5, 0, 'active')
         RETURNING *`,
        [wallet.id, freelancerUserId, referenceType, referenceId, amount],
      );
      reservationRow = inserted.rows[0];
    } catch (err) {
      if (err && err.code === "23505") {
        const again = await findReservationByWalletReference(
          client,
          wallet.id,
          referenceType,
          referenceId,
          true,
        );
        assertReservationOwnership(again, wallet, freelancerUserId);
        if (again && again.status === "active" && Number(again.reserved_tokens) === amount) {
          if (ownTxn) await client.query("COMMIT");
          return {
            ok: true,
            idempotent: true,
            wallet: mapWallet(wallet),
            reservation: mapReservation(again),
            entry: null,
          };
        }
        throw createAppError("Work Token reserve idempotency conflict.", 409, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
        });
      }
      throw err;
    }

    const updated = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    const entry = await insertLedgerEntry(client, {
      walletId: wallet.id,
      freelancerUserId,
      reservationId: reservationRow.id,
      eventType,
      amountTokens: amount,
      balanceEffect,
      availableDelta,
      reservedDelta,
      availableAfter: next.available,
      reservedAfter: next.reserved,
      referenceType,
      referenceId,
      idempotencyKey,
      reason: input.reason || null,
      metadata: input.metadata || null,
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      idempotent: false,
      wallet: mapWallet(updated),
      reservation: mapReservation(reservationRow),
      entry: mapLedger(entry),
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

async function increaseWorkTokenReservation(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const desiredTotal = assertPositiveTokenAmount(
    input.desiredTotal ?? input.desiredReservedTokens,
    "desiredTotal",
  );
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || "PRIORITY_BID_INCREASE_RESERVE").trim();
  if (eventTypeBalanceEffectOrThrow(eventType) !== "reserve") {
    throw createAppError("increaseWorkTokenReservation requires a reserve event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey, { required: true });

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);
    const reservation = await findReservationByWalletReference(
      client,
      wallet.id,
      referenceType,
      referenceId,
      true,
    );
    if (!reservation) {
      throw createAppError("Work Token reservation not found.", 404, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_FOUND,
      });
    }
    assertReservationOwnership(reservation, wallet, freelancerUserId);

    if (reservation.status !== "active") {
      throw createAppError("Work Token reservation is not active.", 409, {
        exposeToClient: true,
        publicCode:
          reservation.status === "consumed"
            ? WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_CONSUMED
            : WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_RELEASED,
      });
    }

    const existingEntry = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    if (existingEntry) {
      const current = Number(reservation.reserved_tokens);
      // Replay: already applied this operation key.
      if (Number(existingEntry.amount_tokens) < 1) {
        throw createAppError("Work Token increase idempotency conflict.", 409, {
          exposeToClient: true,
          publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_IDEMPOTENCY_CONFLICT,
        });
      }
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: mapLedger(existingEntry),
        delta: Number(existingEntry.amount_tokens),
      };
    }

    const current = Number(reservation.reserved_tokens);
    const delta = reservationIncreaseDelta(current, desiredTotal);
    if (delta === 0) {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: null,
        delta: 0,
      };
    }

    if (Number(wallet.available_tokens) < delta) {
      throw createAppError("Insufficient Work Tokens available to increase reservation.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
      });
    }

    const balanceEffect = "reserve";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, delta);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );

    const { rows: resRows } = await client.query(
      `UPDATE work_token_reservations
       SET reserved_tokens = $2,
           updated_at = NOW()
       WHERE id = $1 AND status = 'active' AND wallet_id = $3
       RETURNING *`,
      [reservation.id, desiredTotal, wallet.id],
    );
    const updatedRes = resRows[0];
    if (!updatedRes) {
      throw createAppError("Work Token reservation is not active.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_ACTIVE,
      });
    }

    const updatedWallet = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    const entry = await insertLedgerEntry(client, {
      walletId: wallet.id,
      freelancerUserId,
      reservationId: reservation.id,
      eventType,
      amountTokens: delta,
      balanceEffect,
      availableDelta,
      reservedDelta,
      availableAfter: next.available,
      reservedAfter: next.reserved,
      referenceType,
      referenceId,
      idempotencyKey,
      reason: input.reason || null,
      metadata: {
        ...(input.metadata || {}),
        previousReserved: current,
        desiredTotal,
      },
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      idempotent: false,
      wallet: mapWallet(updatedWallet),
      reservation: mapReservation(updatedRes),
      entry: mapLedger(entry),
      delta,
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

async function releaseWorkTokenReservation(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || DEFAULT_RELEASE_EVENT).trim();
  if (!RELEASE_EVENTS.includes(eventType) && eventTypeBalanceEffectOrThrow(eventType) !== "release") {
    throw createAppError("releaseWorkTokenReservation requires a release event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey =
    assertIdempotencyKey(input.idempotencyKey) ||
    defaultIdempotencyKey("release", eventType, referenceType, referenceId);

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);
    const reservation = await findReservationByWalletReference(
      client,
      wallet.id,
      referenceType,
      referenceId,
      true,
    );

    if (!reservation) {
      throw createAppError("Work Token reservation not found.", 404, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_FOUND,
      });
    }
    assertReservationOwnership(reservation, wallet, freelancerUserId);

    const existingEntry = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    if (existingEntry) {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: mapLedger(existingEntry),
      };
    }

    if (reservation.status === "released" || reservation.status === "cancelled") {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: null,
      };
    }

    if (reservation.status === "consumed") {
      throw createAppError("Work Token reservation already consumed.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_CONSUMED,
      });
    }

    const amount = Number(reservation.reserved_tokens);
    if (amount < 1) {
      throw createAppError("Active reservation has no tokens to release.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
      });
    }

    const balanceEffect = "release";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, amount);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );

    const { rows: resRows } = await client.query(
      `UPDATE work_token_reservations
       SET reserved_tokens = 0,
           status = 'released',
           released_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'active' AND wallet_id = $2
       RETURNING *`,
      [reservation.id, wallet.id],
    );
    if (!resRows[0]) {
      throw createAppError("Work Token reservation is not active.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_ACTIVE,
      });
    }

    const updatedWallet = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    const entry = await insertLedgerEntry(client, {
      walletId: wallet.id,
      freelancerUserId,
      reservationId: reservation.id,
      eventType,
      amountTokens: amount,
      balanceEffect,
      availableDelta,
      reservedDelta,
      availableAfter: next.available,
      reservedAfter: next.reserved,
      referenceType,
      referenceId,
      idempotencyKey,
      reason: input.reason || null,
      metadata: input.metadata || null,
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      idempotent: false,
      wallet: mapWallet(updatedWallet),
      reservation: mapReservation(resRows[0]),
      entry: mapLedger(entry),
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

async function consumeWorkTokenReservation(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || DEFAULT_CONSUME_EVENT).trim();
  if (
    !CONSUME_RESERVED_EVENTS.includes(eventType) &&
    eventTypeBalanceEffectOrThrow(eventType) !== "consume_reserved"
  ) {
    throw createAppError("consumeWorkTokenReservation requires a consume-reserved event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey =
    assertIdempotencyKey(input.idempotencyKey) ||
    defaultIdempotencyKey("consume", eventType, referenceType, referenceId);

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);
    const reservation = await findReservationByWalletReference(
      client,
      wallet.id,
      referenceType,
      referenceId,
      true,
    );

    if (!reservation) {
      throw createAppError("Work Token reservation not found.", 404, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_FOUND,
      });
    }
    assertReservationOwnership(reservation, wallet, freelancerUserId);

    const existingEntry = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    if (existingEntry) {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: mapLedger(existingEntry),
      };
    }

    if (reservation.status === "consumed") {
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(wallet),
        reservation: mapReservation(reservation),
        entry: null,
      };
    }

    if (reservation.status !== "active") {
      throw createAppError("Work Token reservation already released.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_ALREADY_RELEASED,
      });
    }

    const amount = Number(reservation.reserved_tokens);
    if (amount < 1) {
      throw createAppError("Active reservation has no tokens to consume.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_AMOUNT,
      });
    }

    const balanceEffect = "consume_reserved";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, amount);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );

    const { rows: resRows } = await client.query(
      `UPDATE work_token_reservations
       SET reserved_tokens = 0,
           consumed_tokens = $2,
           status = 'consumed',
           consumed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND status = 'active' AND wallet_id = $3
       RETURNING *`,
      [reservation.id, amount, wallet.id],
    );
    if (!resRows[0]) {
      throw createAppError("Work Token reservation is not active.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.WORK_TOKEN_RESERVATION_NOT_ACTIVE,
      });
    }

    const updatedWallet = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    const entry = await insertLedgerEntry(client, {
      walletId: wallet.id,
      freelancerUserId,
      reservationId: reservation.id,
      eventType,
      amountTokens: amount,
      balanceEffect,
      availableDelta,
      reservedDelta,
      availableAfter: next.available,
      reservedAfter: next.reserved,
      referenceType,
      referenceId,
      idempotencyKey,
      reason: input.reason || null,
      metadata: input.metadata || null,
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      idempotent: false,
      wallet: mapWallet(updatedWallet),
      reservation: mapReservation(resRows[0]),
      entry: mapLedger(entry),
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

async function consumeAvailableWorkTokens(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const amount = assertPositiveTokenAmount(input.amountTokens ?? input.amount, "amountTokens");
  const { referenceType, referenceId } = assertReference(input.referenceType, input.referenceId);
  const eventType = String(input.eventType || "TOKEN_CONSUME_AVAILABLE").trim();
  if (eventTypeBalanceEffectOrThrow(eventType) !== "consume_available") {
    throw createAppError("consumeAvailableWorkTokens requires consume_available event type.", 400, {
      exposeToClient: true,
      publicCode: WORK_TOKEN_ERROR_CODES.INVALID_WORK_TOKEN_EVENT,
    });
  }
  const idempotencyKey =
    assertIdempotencyKey(input.idempotencyKey) ||
    defaultIdempotencyKey("consume_available", eventType, referenceType, referenceId);

  const { client, release, ownTxn } = await resolveDbClient(input.client);
  try {
    if (ownTxn) await client.query("BEGIN");
    const wallet = await lockWalletByFreelancer(client, freelancerUserId);

    const existing = await findLedgerByIdempotencyKey(client, wallet.id, idempotencyKey);
    if (existing) {
      idempotentReplayOrConflict(existing, amount);
      if (ownTxn) await client.query("COMMIT");
      return { ok: true, idempotent: true, wallet: mapWallet(wallet), entry: mapLedger(existing) };
    }

    if (Number(wallet.available_tokens) < amount) {
      throw createAppError("Insufficient Work Tokens available.", 409, {
        exposeToClient: true,
        publicCode: WORK_TOKEN_ERROR_CODES.INSUFFICIENT_WORK_TOKENS,
      });
    }

    const balanceEffect = "consume_available";
    const { availableDelta, reservedDelta } = deltasForBalanceEffect(balanceEffect, amount);
    const next = applyDeltasToBalances(
      Number(wallet.available_tokens),
      Number(wallet.reserved_tokens),
      availableDelta,
      reservedDelta,
    );
    const updated = await updateWalletBalances(client, wallet.id, next.available, next.reserved);
    const entry = await insertLedgerEntry(client, {
      walletId: wallet.id,
      freelancerUserId,
      eventType,
      amountTokens: amount,
      balanceEffect,
      availableDelta,
      reservedDelta,
      availableAfter: next.available,
      reservedAfter: next.reserved,
      referenceType,
      referenceId,
      idempotencyKey,
      reason: input.reason || null,
      metadata: input.metadata || null,
      actorUserId: input.actorUserId || null,
    });

    if (ownTxn) await client.query("COMMIT");
    return { ok: true, idempotent: false, wallet: mapWallet(updated), entry: mapLedger(entry) };
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

async function verifyWorkTokenWalletIntegrity(freelancerUserId, options = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const db = options.client || pool;
  const { rows: walletRows } = await db.query(
    `SELECT * FROM freelancer_work_token_wallets WHERE freelancer_user_id = $1 LIMIT 1`,
    [id],
  );
  if (!walletRows[0]) {
    return {
      ok: true,
      exists: false,
      availableTokens: 0,
      reservedTokens: 0,
      ledgerDerived: { available: 0, reserved: 0 },
      activeReservationsSum: 0,
    };
  }
  const wallet = walletRows[0];
  const { rows: ledgerRows } = await db.query(
    `SELECT available_delta, reserved_delta
     FROM work_token_ledger_entries
     WHERE wallet_id = $1
     ORDER BY id ASC`,
    [wallet.id],
  );
  const derived = deriveBalancesFromLedger(ledgerRows);
  const { rows: resSum } = await db.query(
    `SELECT COALESCE(SUM(reserved_tokens), 0)::bigint AS total
     FROM work_token_reservations
     WHERE wallet_id = $1 AND status = 'active'`,
    [wallet.id],
  );
  const activeSum = Number(resSum[0].total);
  const availableOk = derived.ok && derived.available === Number(wallet.available_tokens);
  const reservedOk = derived.ok && derived.reserved === Number(wallet.reserved_tokens);
  const reservationOk = activeSum === Number(wallet.reserved_tokens);
  return {
    ok: availableOk && reservedOk && reservationOk,
    exists: true,
    walletId: String(wallet.id),
    availableTokens: Number(wallet.available_tokens),
    reservedTokens: Number(wallet.reserved_tokens),
    ledgerDerived: { available: derived.available, reserved: derived.reserved },
    activeReservationsSum: activeSum,
    mismatches: {
      available: !availableOk,
      reserved: !reservedOk,
      reservations: !reservationOk,
    },
  };
}

async function listWorkTokenLedgerForFreelancer(freelancerUserId, options = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT e.*
     FROM work_token_ledger_entries e
     WHERE e.freelancer_user_id = $1
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $2 OFFSET $3`,
    [id, limit, offset],
  );
  return rows.map(mapLedger);
}

async function getTotalConsumedTokens(freelancerUserId, options = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(amount_tokens), 0)::bigint AS total
     FROM work_token_ledger_entries
     WHERE freelancer_user_id = $1
       AND balance_effect IN ('consume_reserved', 'consume_available')`,
    [id],
  );
  return Number(rows[0].total);
}

async function listWorkTokenWalletsForAdmin(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const db = options.client || pool;
  const params = [];
  let where = "";
  if (options.freelancerUserId) {
    params.push(Number(options.freelancerUserId));
    where = `WHERE w.freelancer_user_id = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT w.*,
            u.email AS freelancer_email,
            concat_ws(' ', u.first_name, u.father_name, u.family_name) AS freelancer_name
     FROM freelancer_work_token_wallets w
     JOIN users u ON u.id = w.freelancer_user_id
     ${where}
     ORDER BY w.updated_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return rows.map((row) => ({
    ...mapWallet(row),
    freelancerEmail: row.freelancer_email || null,
    freelancerName: row.freelancer_name || null,
  }));
}

async function getWorkTokenWalletDetailForAdmin(walletId, options = {}) {
  const id = Number(walletId);
  if (!Number.isInteger(id) || id < 1) return null;
  const db = options.client || pool;
  const { rows } = await db.query(
    `SELECT w.*,
            u.email AS freelancer_email,
            concat_ws(' ', u.first_name, u.father_name, u.family_name) AS freelancer_name
     FROM freelancer_work_token_wallets w
     JOIN users u ON u.id = w.freelancer_user_id
     WHERE w.id = $1
     LIMIT 1`,
    [id],
  );
  if (!rows[0]) return null;
  const wallet = {
    ...mapWallet(rows[0]),
    freelancerEmail: rows[0].freelancer_email || null,
    freelancerName: rows[0].freelancer_name || null,
  };
  const ledger = await listWorkTokenLedgerForFreelancer(wallet.freelancerUserId, {
    client: db,
    limit: options.ledgerLimit || 100,
    offset: 0,
  });
  const { rows: reservations } = await db.query(
    `SELECT * FROM work_token_reservations
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [id],
  );
  const integrity = await verifyWorkTokenWalletIntegrity(wallet.freelancerUserId, { client: db });
  return {
    wallet,
    reservations: reservations.map(mapReservation),
    ledger,
    integrity,
  };
}

module.exports = {
  getWorkTokenWalletSnapshot,
  getOrCreateWorkTokenWallet,
  creditWorkTokens,
  reserveWorkTokens,
  increaseWorkTokenReservation,
  releaseWorkTokenReservation,
  consumeWorkTokenReservation,
  consumeAvailableWorkTokens,
  verifyWorkTokenWalletIntegrity,
  listWorkTokenLedgerForFreelancer,
  getTotalConsumedTokens,
  listWorkTokenWalletsForAdmin,
  getWorkTokenWalletDetailForAdmin,
  mapWallet,
  mapReservation,
  mapLedger,
};
