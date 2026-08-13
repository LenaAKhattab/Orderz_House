/**
 * Bid Credit packages catalog — Phase B1 pricing + Phase B6 validity_days.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const { BID_CREDIT_ERROR_CODES } = require("../constants/marketplaceBidCredits");
const { marketplaceBidCreditsSchemaReady } = require("../utils/marketplaceBidCreditsSchema");

function toMoney(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

function mapPackage(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    code: row.code,
    nameAr: row.name_ar,
    nameEn: row.name_en || null,
    descriptionAr: row.description_ar || null,
    descriptionEn: row.description_en || null,
    bidQuantity: Number(row.bid_quantity),
    priceJod: toMoney(row.price_jod),
    validityDays: row.validity_days != null ? Number(row.validity_days) : null,
    isActive: isTruthyFlag(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    createdByUserId: row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    updatedByUserId: row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertSchema(client = pool) {
  if (!(await marketplaceBidCreditsSchemaReady(client))) {
    throw createAppError("Bid Credits schema is not applied yet.", 503, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_CREDITS_SCHEMA_NOT_READY,
    });
  }
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function assertValidityDays(value, { required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw createAppError("validityDays is required for purchasable packages.", 400, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.BID_PACKAGE_INVALID_VALIDITY,
      });
    }
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 3650) {
    throw createAppError("validityDays must be an integer between 1 and 3650.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_PACKAGE_INVALID_VALIDITY,
    });
  }
  return n;
}

async function listBidCreditPackages({ activeOnly = false, purchasableOnly = false } = {}) {
  await assertSchema();
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_bid_credit_packages
      WHERE ($1::boolean = FALSE OR is_active = TRUE)
        AND (
          $2::boolean = FALSE
          OR (
            is_active = TRUE
            AND bid_quantity > 0
            AND price_jod > 0
            AND validity_days IS NOT NULL
            AND validity_days >= 1
          )
        )
      ORDER BY sort_order ASC, id ASC`,
    [activeOnly || purchasableOnly, purchasableOnly],
  );
  return rows.map(mapPackage);
}

async function getBidCreditPackageById(id) {
  await assertSchema();
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_bid_credit_packages WHERE id = $1`,
    [Number(id)],
  );
  return mapPackage(rows[0]);
}

async function createBidCreditPackage(payload, actorUserId = null) {
  await assertSchema();
  const code = normalizeCode(payload.code);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(code)) {
    throw createAppError("Invalid package code.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_PACKAGE,
    });
  }
  const qty = Number(payload.bidQuantity);
  if (!Number.isInteger(qty) || qty < 1) {
    throw createAppError("bidQuantity must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_AMOUNT,
    });
  }
  const price = toMoney(payload.priceJod);
  if (price == null || price < 0) {
    throw createAppError("priceJod must be a non-negative number.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_PACKAGE,
    });
  }
  const isActive = payload.isActive !== false;
  const validityDays = assertValidityDays(payload.validityDays, {
    required: isActive && price > 0,
  });
  if (isActive && price > 0 && (validityDays == null || validityDays < 1)) {
    throw createAppError("Active commercial packages require validityDays >= 1.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.BID_PACKAGE_INVALID_VALIDITY,
    });
  }
  if (isActive && !(price > 0)) {
    throw createAppError("Active commercial packages require priceJod > 0.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_PACKAGE,
    });
  }
  const nameAr = String(payload.nameAr || "").trim();
  if (!nameAr) {
    throw createAppError("nameAr is required.", 400, { exposeToClient: true });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO marketplace_bid_credit_packages (
         code, name_ar, name_en, description_ar, description_en,
         bid_quantity, price_jod, validity_days, is_active, sort_order,
         created_by_user_id, updated_by_user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::numeric,$8,$9,$10,$11,$11)
       RETURNING *`,
      [
        code,
        nameAr,
        payload.nameEn ? String(payload.nameEn).trim() : null,
        payload.descriptionAr ? String(payload.descriptionAr).trim() : null,
        payload.descriptionEn ? String(payload.descriptionEn).trim() : null,
        qty,
        price.toFixed(3),
        validityDays,
        isActive,
        Number(payload.sortOrder) || 0,
        actorUserId,
      ],
    );
    return mapPackage(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") {
      throw createAppError("Package code already exists.", 409, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.BID_PACKAGE_CODE_CONFLICT,
      });
    }
    throw err;
  }
}

async function updateBidCreditPackage(id, patch, actorUserId = null) {
  await assertSchema();
  const existing = await getBidCreditPackageById(id);
  if (!existing) {
    throw createAppError("Package not found.", 404, { exposeToClient: true });
  }

  const next = {
    nameAr: patch.nameAr !== undefined ? String(patch.nameAr).trim() : existing.nameAr,
    nameEn:
      patch.nameEn !== undefined
        ? patch.nameEn
          ? String(patch.nameEn).trim()
          : null
        : existing.nameEn,
    descriptionAr:
      patch.descriptionAr !== undefined
        ? patch.descriptionAr
          ? String(patch.descriptionAr).trim()
          : null
        : existing.descriptionAr,
    descriptionEn:
      patch.descriptionEn !== undefined
        ? patch.descriptionEn
          ? String(patch.descriptionEn).trim()
          : null
        : existing.descriptionEn,
    bidQuantity:
      patch.bidQuantity !== undefined ? Number(patch.bidQuantity) : existing.bidQuantity,
    priceJod: patch.priceJod !== undefined ? toMoney(patch.priceJod) : existing.priceJod,
    validityDays:
      patch.validityDays !== undefined
        ? assertValidityDays(patch.validityDays, { required: false })
        : existing.validityDays,
    isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
    sortOrder: patch.sortOrder !== undefined ? Number(patch.sortOrder) || 0 : existing.sortOrder,
  };

  if (!next.nameAr) {
    throw createAppError("nameAr is required.", 400, { exposeToClient: true });
  }
  if (!Number.isInteger(next.bidQuantity) || next.bidQuantity < 1) {
    throw createAppError("bidQuantity must be a positive integer.", 400, {
      exposeToClient: true,
      publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_CREDIT_AMOUNT,
    });
  }
  if (next.priceJod == null || next.priceJod < 0) {
    throw createAppError("priceJod must be a non-negative number.", 400, {
      exposeToClient: true,
    });
  }
  if (next.isActive) {
    if (!(next.priceJod > 0)) {
      throw createAppError("Active commercial packages require priceJod > 0.", 400, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.INVALID_BID_PACKAGE,
      });
    }
    if (next.validityDays == null || next.validityDays < 1) {
      throw createAppError("Active commercial packages require validityDays >= 1.", 400, {
        exposeToClient: true,
        publicCode: BID_CREDIT_ERROR_CODES.BID_PACKAGE_INVALID_VALIDITY,
      });
    }
  }

  const { rows } = await pool.query(
    `UPDATE marketplace_bid_credit_packages
        SET name_ar = $2,
            name_en = $3,
            description_ar = $4,
            description_en = $5,
            bid_quantity = $6,
            price_jod = $7::numeric,
            validity_days = $8,
            is_active = $9,
            sort_order = $10,
            updated_by_user_id = $11,
            updated_at = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      Number(id),
      next.nameAr,
      next.nameEn,
      next.descriptionAr,
      next.descriptionEn,
      next.bidQuantity,
      Number(next.priceJod).toFixed(3),
      next.validityDays,
      next.isActive,
      next.sortOrder,
      actorUserId,
    ],
  );
  return mapPackage(rows[0]);
}

module.exports = {
  listBidCreditPackages,
  getBidCreditPackageById,
  createBidCreditPackage,
  updateBidCreditPackage,
  mapPackage,
};
