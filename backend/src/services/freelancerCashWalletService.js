/**
 * Minimal JOD cash wallet + append-only ledger for managed-order credits.
 * Pattern mirrors Work Token wallet (lock → idempotency → ledger → balance).
 * Does not touch Stripe, financial_claims payouts, Bid Credits, or Work Tokens.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");

const EVENT_TYPES = Object.freeze({
  MANAGED_ORDER_CREDIT: "MANAGED_ORDER_CREDIT",
  ADMIN_ADJUSTMENT_CREDIT: "ADMIN_ADJUSTMENT_CREDIT",
  ADMIN_REVERSAL: "ADMIN_REVERSAL",
});

const PUBLIC_LABELS = Object.freeze({
  MANAGED_ORDER_CREDIT: "أرباح طلب مُدار",
  MANAGED_ORDER_CREDIT_ALT: "رصيد من طلب مُدار عبر Orderz",
  MANAGED_ORDER_CREDIT_NOTE: "تمت إضافة رصيد مقابل تنفيذ طلب مُدار",
});

function assertPositiveMinor(value, label = "amountMinor") {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw createAppError(`يجب أن يكون ${label} عدداً صحيحاً أكبر من صفر.`, 400, {
      exposeToClient: true,
      publicCode: "INVALID_AMOUNT_MINOR",
    });
  }
  return n;
}

function assertFreelancerUserId(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw createAppError("معرّف الفريلانسر غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_FREELANCER_ID",
    });
  }
  return n;
}

function assertIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (!key || key.length < 8 || key.length > 180) {
    throw createAppError("مفتاح التكرار غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_IDEMPOTENCY_KEY",
    });
  }
  return key;
}

function mapWallet(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    freelancerUserId: String(row.freelancer_user_id),
    availableMinor: Number(row.available_minor),
    currency: row.currency || "JOD",
    version: Number(row.version),
    updatedAt: row.updated_at,
  };
}

function mapLedger(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    freelancerUserId: String(row.freelancer_user_id),
    direction: Number(row.direction),
    amountMinor: Number(row.amount_minor),
    balanceAfterMinor: Number(row.balance_after_minor),
    currency: row.currency || "JOD",
    eventType: row.event_type,
    descriptionPublic: row.description_public,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  };
}

/** Freelancer-safe map — strips internal description and FAZAT references. */
function mapLedgerForFreelancer(row) {
  const base = mapLedger(row);
  if (!base) return null;
  return {
    id: base.id,
    direction: base.direction,
    amountMinor: base.amountMinor,
    balanceAfterMinor: base.balanceAfterMinor,
    currency: base.currency,
    description: base.descriptionPublic,
    createdAt: base.createdAt,
  };
}

async function ensureWalletLocked(client, freelancerUserId) {
  await client.query(
    `INSERT INTO freelancer_cash_wallets (freelancer_user_id)
     VALUES ($1)
     ON CONFLICT (freelancer_user_id) DO NOTHING`,
    [freelancerUserId],
  );
  const { rows } = await client.query(
    `SELECT * FROM freelancer_cash_wallets
      WHERE freelancer_user_id = $1
      FOR UPDATE`,
    [freelancerUserId],
  );
  if (!rows[0]) {
    throw createAppError("تعذر إنشاء محفظة الفريلانسر.", 500);
  }
  return rows[0];
}

async function findLedgerByIdempotency(client, idempotencyKey) {
  const { rows } = await client.query(
    `SELECT * FROM freelancer_cash_ledger_entries WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  );
  return rows[0] || null;
}

/**
 * Credit available JOD balance with ledger row. Idempotent on idempotencyKey.
 * @param {object} input
 * @param {import('pg').PoolClient} [input.client] — when provided, caller owns the transaction
 */
async function creditAvailableBalance(input) {
  const freelancerUserId = assertFreelancerUserId(input.freelancerUserId);
  const amountMinor = assertPositiveMinor(input.amountMinor);
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
  const currency = String(input.currency || "JOD").trim().toUpperCase() || "JOD";
  const eventType = String(input.eventType || EVENT_TYPES.MANAGED_ORDER_CREDIT).trim();
  const descriptionPublic = String(
    input.descriptionPublic || PUBLIC_LABELS.MANAGED_ORDER_CREDIT,
  ).trim();
  const descriptionInternal =
    input.descriptionInternal != null ? String(input.descriptionInternal).slice(0, 500) : null;
  const referenceType = String(input.referenceType || "fazat_settlement").trim();
  const referenceId = String(input.referenceId || "").trim();
  if (!referenceId) {
    throw createAppError("referenceId مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_REFERENCE",
    });
  }
  // Hard privacy: never allow FAZAT branding in freelancer-visible text.
  if (/fazat|faz3at/i.test(descriptionPublic)) {
    throw createAppError("نص المحفظة الظاهر للفريلانسر غير مسموح.", 400, {
      exposeToClient: true,
      publicCode: "FORBIDDEN_PUBLIC_DESCRIPTION",
    });
  }

  const ownTxn = !input.client;
  const client = input.client || (await pool.connect());
  try {
    if (ownTxn) await client.query("BEGIN");

    const existing = await findLedgerByIdempotency(client, idempotencyKey);
    if (existing) {
      if (Number(existing.amount_minor) !== amountMinor) {
        throw createAppError("تعارض مفتاح التكرار لمبلغ مختلف.", 409, {
          exposeToClient: true,
          publicCode: "CASH_LEDGER_IDEMPOTENCY_CONFLICT",
        });
      }
      if (ownTxn) await client.query("COMMIT");
      return {
        ok: true,
        idempotent: true,
        wallet: mapWallet(
          (
            await client.query(`SELECT * FROM freelancer_cash_wallets WHERE id = $1`, [
              existing.wallet_id,
            ])
          ).rows[0],
        ),
        entry: mapLedger(existing),
      };
    }

    const wallet = await ensureWalletLocked(client, freelancerUserId);
    const nextAvailable = Number(wallet.available_minor) + amountMinor;

    const { rows: entryRows } = await client.query(
      `INSERT INTO freelancer_cash_ledger_entries (
         wallet_id, freelancer_user_id, direction, amount_minor, balance_after_minor,
         currency, event_type, description_public, description_internal,
         reference_type, reference_id, idempotency_key, actor_user_id, metadata_json
       ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
       RETURNING *`,
      [
        wallet.id,
        freelancerUserId,
        amountMinor,
        nextAvailable,
        currency,
        eventType,
        descriptionPublic,
        descriptionInternal,
        referenceType,
        referenceId,
        idempotencyKey,
        input.actorUserId != null ? Number(input.actorUserId) : null,
        JSON.stringify(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
      ],
    );

    const { rows: walletRows } = await client.query(
      `UPDATE freelancer_cash_wallets
          SET available_minor = $2,
              currency = $3,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [wallet.id, nextAvailable, currency],
    );

    if (ownTxn) await client.query("COMMIT");
    return {
      ok: true,
      idempotent: false,
      wallet: mapWallet(walletRows[0]),
      entry: mapLedger(entryRows[0]),
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
      const replay = await findLedgerByIdempotency(input.client || pool, idempotencyKey);
      if (replay && Number(replay.amount_minor) === amountMinor) {
        return {
          ok: true,
          idempotent: true,
          wallet: null,
          entry: mapLedger(replay),
        };
      }
    }
    throw err;
  } finally {
    if (ownTxn) client.release();
  }
}

async function getWalletSnapshot(freelancerUserId) {
  const id = assertFreelancerUserId(freelancerUserId);
  const { rows } = await pool.query(
    `SELECT * FROM freelancer_cash_wallets WHERE freelancer_user_id = $1 LIMIT 1`,
    [id],
  );
  if (!rows[0]) {
    return {
      freelancerUserId: String(id),
      availableMinor: 0,
      currency: "JOD",
      exists: false,
    };
  }
  return { ...mapWallet(rows[0]), exists: true };
}

async function listLedgerForFreelancer(freelancerUserId, { limit = 50 } = {}) {
  const id = assertFreelancerUserId(freelancerUserId);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const { rows } = await pool.query(
    `SELECT * FROM freelancer_cash_ledger_entries
      WHERE freelancer_user_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2`,
    [id, lim],
  );
  return rows.map(mapLedgerForFreelancer);
}

module.exports = {
  EVENT_TYPES,
  PUBLIC_LABELS,
  creditAvailableBalance,
  getWalletSnapshot,
  listLedgerForFreelancer,
  mapLedger,
  mapLedgerForFreelancer,
  mapWallet,
};
