/**
 * Marketplace Membership plans (باقات العمل) — Phase 1 catalog only.
 * Independent of the legacy plan catalog and subscription assignment tables.
 * Does not touch fake/training order systems.
 */

const { pool } = require("../config/db");
const { createAppError } = require("../utils/AppError");
const {
  assertValidMarketplaceSalePatch,
  attachSaleFieldsToMappedMarketplacePlan,
  resolveMarketplaceMembershipPayablePricing,
} = require("../utils/marketplaceMembershipSalePricing");
const { isValidMarketplaceTierCode } = require("../constants/marketplaceMembershipPlans");

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isTruthyFlag(value) {
  return value === true || value === "t" || value === 1 || value === "1";
}

function normalizeTierCode(value) {
  return String(value || "").trim().toLowerCase();
}

function mapMarketplaceMembershipPlan(row) {
  if (!row) return null;
  const unlimited = isTruthyFlag(row.unlimited_real_order_value);
  const mapped = {
    id: String(row.id),
    tierCode: row.tier_code,
    nameAr: row.name_ar,
    nameEn: row.name_en || null,
    slug: row.slug || null,
    descriptionAr: row.description_ar || null,
    descriptionEn: row.description_en || null,
    isActive: isTruthyFlag(row.is_active),
    sortOrder: Number(row.sort_order) || 0,
    monthlyPriceJod: toFiniteNumber(row.monthly_price_jod),
    stripeProductId: row.stripe_product_id || null,
    stripePriceId: row.stripe_price_id || null,
    stripePriceAmountMinor:
      row.stripe_price_amount_minor != null ? Number(row.stripe_price_amount_minor) : null,
    stripePriceCurrency: row.stripe_price_currency || "JOD",
    maxRealOrderValueJod: toFiniteNumber(row.max_real_order_value_jod),
    unlimitedRealOrderValue: unlimited,
    includedTokensPerCycle: Number(row.included_tokens_per_cycle) || 0,
    cashAllowed: isTruthyFlag(row.cash_allowed),
    minimumCashMonths: Number(row.minimum_cash_months) || 1,
    maximumPrepaidMonths: Number(row.maximum_prepaid_months) || 1,
    eliteDirectOrdersEnabled: isTruthyFlag(row.elite_direct_orders_enabled),
    saleEnabled: isTruthyFlag(row.sale_enabled),
    salePercentage: toFiniteNumber(row.sale_percentage),
    saleReason: row.sale_reason || null,
    saleReasonEn: row.sale_reason_en || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
  return attachSaleFieldsToMappedMarketplacePlan(mapped, row);
}

function mapPublicMarketplaceMembershipPlan(row) {
  const full = mapMarketplaceMembershipPlan(row);
  if (!full) return null;
  return {
    id: full.id,
    tierCode: full.tierCode,
    nameAr: full.nameAr,
    nameEn: full.nameEn,
    slug: full.slug,
    descriptionAr: full.descriptionAr,
    descriptionEn: full.descriptionEn,
    sortOrder: full.sortOrder,
    monthlyPriceJod: full.monthlyPriceJod,
    access: {
      maxRealOrderValueJod: full.unlimitedRealOrderValue ? null : full.maxRealOrderValueJod,
      unlimited: full.unlimitedRealOrderValue,
    },
    includedTokensPerCycle: full.includedTokensPerCycle,
    cash: {
      allowed: full.cashAllowed,
      minimumMonths: full.minimumCashMonths,
      maximumPrepaidMonths: full.maximumPrepaidMonths,
    },
    capabilities: {
      eliteDirectOrders: full.eliteDirectOrdersEnabled,
    },
    sale: full.sale,
  };
}

function assertRealOrderAccessConfig({ unlimitedRealOrderValue, maxRealOrderValueJod }) {
  const unlimited = Boolean(unlimitedRealOrderValue);
  const max = toFiniteNumber(maxRealOrderValueJod);
  if (unlimited) {
    if (max != null) {
      throw createAppError(
        "عند تفعيل الوصول غير المحدود يجب ترك حد قيمة الطلب الحقيقي فارغاً.",
        400,
        { exposeToClient: true, publicCode: "UNLIMITED_REQUIRES_NULL_MAX" },
      );
    }
    return { unlimitedRealOrderValue: true, maxRealOrderValueJod: null };
  }
  if (max == null || max <= 0) {
    throw createAppError("حد قيمة الطلب الحقيقي يجب أن يكون أكبر من صفر.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MAX_REAL_ORDER_VALUE",
    });
  }
  return { unlimitedRealOrderValue: false, maxRealOrderValueJod: max };
}

function assertCashMonthsConfig({ cashAllowed, minimumCashMonths, maximumPrepaidMonths }) {
  const allowed = Boolean(cashAllowed);
  const min = Number(minimumCashMonths);
  const max = Number(maximumPrepaidMonths);
  if (!Number.isInteger(min) || min < 1) {
    throw createAppError("الحد الأدنى لأشهر الدفع النقدي يجب أن يكون 1 أو أكثر.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MINIMUM_CASH_MONTHS",
    });
  }
  if (!Number.isInteger(max) || max < 1) {
    throw createAppError("الحد الأقصى لأشهر الدفع المسبق يجب أن يكون 1 أو أكثر.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MAXIMUM_PREPAID_MONTHS",
    });
  }
  if (max < min) {
    throw createAppError("الحد الأقصى لأشهر الدفع المسبق يجب أن يكون ≥ الحد الأدنى.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_CASH_MONTHS_ORDER",
    });
  }
  return { cashAllowed: allowed, minimumCashMonths: min, maximumPrepaidMonths: max };
}

function assertTokensPerCycle(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw createAppError("عدد وحدات العمل الشهرية يجب أن يكون عدداً صحيحاً ≥ 0.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_INCLUDED_TOKENS",
    });
  }
  return n;
}

async function listPublicMarketplaceMembershipPlans() {
  const { rows } = await pool.query(
    `SELECT *
     FROM marketplace_membership_plans
     WHERE is_active = TRUE
     ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapPublicMarketplaceMembershipPlan);
}

async function listAdminMarketplaceMembershipPlans({ includeInactive = true } = {}) {
  const { rows } = await pool.query(
    includeInactive
      ? `SELECT *
         FROM marketplace_membership_plans
         ORDER BY sort_order ASC, id ASC`
      : `SELECT *
         FROM marketplace_membership_plans
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, id ASC`,
  );
  return rows.map(mapMarketplaceMembershipPlan);
}

async function getMarketplaceMembershipPlanById(id, client) {
  const runner = client || pool;
  const { rows } = await runner.query(
    `SELECT * FROM marketplace_membership_plans WHERE id = $1::bigint LIMIT 1`,
    [Number(id)],
  );
  return mapMarketplaceMembershipPlan(rows[0] || null);
}

async function getMarketplaceMembershipPlanByTierCode(tierCode, client) {
  const runner = client || pool;
  const code = normalizeTierCode(tierCode);
  const { rows } = await runner.query(
    `SELECT * FROM marketplace_membership_plans WHERE tier_code = $1 LIMIT 1`,
    [code],
  );
  return mapMarketplaceMembershipPlan(rows[0] || null);
}

async function createMarketplaceMembershipPlan(payload) {
  const tierCode = normalizeTierCode(payload.tierCode);
  if (!isValidMarketplaceTierCode(tierCode)) {
    throw createAppError("رمز الباقة غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_TIER_CODE",
    });
  }

  const nameAr = String(payload.nameAr || "").trim();
  if (!nameAr) {
    throw createAppError("اسم الباقة بالعربية مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "NAME_AR_REQUIRED",
    });
  }

  const monthlyPriceJod = toFiniteNumber(payload.monthlyPriceJod);
  if (monthlyPriceJod == null || monthlyPriceJod < 0) {
    throw createAppError("السعر الشهري غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MONTHLY_PRICE",
    });
  }

  const access = assertRealOrderAccessConfig({
    unlimitedRealOrderValue: payload.unlimitedRealOrderValue,
    maxRealOrderValueJod: payload.maxRealOrderValueJod,
  });
  const cash = assertCashMonthsConfig({
    cashAllowed: payload.cashAllowed ?? false,
    minimumCashMonths: payload.minimumCashMonths ?? 1,
    maximumPrepaidMonths: payload.maximumPrepaidMonths ?? 1,
  });
  const includedTokensPerCycle = assertTokensPerCycle(payload.includedTokensPerCycle ?? 0);
  const sortOrder = Number.isInteger(Number(payload.sortOrder)) ? Number(payload.sortOrder) : 0;

  assertValidMarketplaceSalePatch(
    {
      saleEnabled: payload.saleEnabled,
      salePercentage: payload.salePercentage,
      saleReason: payload.saleReason,
      saleReasonEn: payload.saleReasonEn,
    },
    { monthlyPriceJod, saleEnabled: false },
  );

  const saleEnabled = Boolean(payload.saleEnabled);
  const salePercentage = saleEnabled ? toFiniteNumber(payload.salePercentage) : null;
  const saleReason = saleEnabled ? String(payload.saleReason || "").trim() || null : null;
  const saleReasonEn = saleEnabled ? String(payload.saleReasonEn || "").trim() || null : null;

  try {
    const { rows } = await pool.query(
      `INSERT INTO marketplace_membership_plans (
         tier_code, name_ar, name_en, slug,
         description_ar, description_en,
         is_active, sort_order,
         monthly_price_jod,
         max_real_order_value_jod, unlimited_real_order_value,
         included_tokens_per_cycle,
         cash_allowed, minimum_cash_months, maximum_prepaid_months,
         elite_direct_orders_enabled,
         sale_enabled, sale_percentage, sale_reason, sale_reason_en
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,
         $7,$8,
         $9,
         $10,$11,
         $12,
         $13,$14,$15,
         $16,
         $17,$18,$19,$20
       )
       RETURNING *`,
      [
        tierCode,
        nameAr,
        payload.nameEn != null ? String(payload.nameEn).trim() || null : null,
        payload.slug != null ? String(payload.slug).trim().toLowerCase() || null : null,
        payload.descriptionAr != null ? String(payload.descriptionAr).trim() || null : null,
        payload.descriptionEn != null ? String(payload.descriptionEn).trim() || null : null,
        payload.isActive !== false,
        sortOrder,
        monthlyPriceJod,
        access.maxRealOrderValueJod,
        access.unlimitedRealOrderValue,
        includedTokensPerCycle,
        cash.cashAllowed,
        cash.minimumCashMonths,
        cash.maximumPrepaidMonths,
        Boolean(payload.eliteDirectOrdersEnabled),
        saleEnabled,
        salePercentage,
        saleReason,
        saleReasonEn,
      ],
    );
    return mapMarketplaceMembershipPlan(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") {
      throw createAppError("رمز الباقة أو الرابط مستخدم مسبقاً.", 409, {
        exposeToClient: true,
        publicCode: "DUPLICATE_TIER_OR_SLUG",
      });
    }
    throw err;
  }
}

async function updateMarketplaceMembershipPlan(id, patch) {
  const existing = await getMarketplaceMembershipPlanById(id);
  if (!existing) {
    throw createAppError("الباقة غير موجودة.", 404, {
      exposeToClient: true,
      publicCode: "PLAN_NOT_FOUND",
    });
  }

  const next = {
    nameAr: patch.nameAr !== undefined ? String(patch.nameAr).trim() : existing.nameAr,
    nameEn:
      patch.nameEn !== undefined
        ? patch.nameEn == null
          ? null
          : String(patch.nameEn).trim() || null
        : existing.nameEn,
    slug:
      patch.slug !== undefined
        ? patch.slug == null
          ? null
          : String(patch.slug).trim().toLowerCase() || null
        : existing.slug,
    descriptionAr:
      patch.descriptionAr !== undefined
        ? patch.descriptionAr == null
          ? null
          : String(patch.descriptionAr).trim() || null
        : existing.descriptionAr,
    descriptionEn:
      patch.descriptionEn !== undefined
        ? patch.descriptionEn == null
          ? null
          : String(patch.descriptionEn).trim() || null
        : existing.descriptionEn,
    isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : existing.isActive,
    sortOrder:
      patch.sortOrder !== undefined
        ? Number.isInteger(Number(patch.sortOrder))
          ? Number(patch.sortOrder)
          : existing.sortOrder
        : existing.sortOrder,
    monthlyPriceJod:
      patch.monthlyPriceJod !== undefined
        ? toFiniteNumber(patch.monthlyPriceJod)
        : existing.monthlyPriceJod,
    unlimitedRealOrderValue:
      patch.unlimitedRealOrderValue !== undefined
        ? Boolean(patch.unlimitedRealOrderValue)
        : existing.unlimitedRealOrderValue,
    maxRealOrderValueJod:
      patch.maxRealOrderValueJod !== undefined
        ? patch.maxRealOrderValueJod
        : existing.maxRealOrderValueJod,
    includedTokensPerCycle:
      patch.includedTokensPerCycle !== undefined
        ? patch.includedTokensPerCycle
        : existing.includedTokensPerCycle,
    cashAllowed: patch.cashAllowed !== undefined ? Boolean(patch.cashAllowed) : existing.cashAllowed,
    minimumCashMonths:
      patch.minimumCashMonths !== undefined ? patch.minimumCashMonths : existing.minimumCashMonths,
    maximumPrepaidMonths:
      patch.maximumPrepaidMonths !== undefined
        ? patch.maximumPrepaidMonths
        : existing.maximumPrepaidMonths,
    eliteDirectOrdersEnabled:
      patch.eliteDirectOrdersEnabled !== undefined
        ? Boolean(patch.eliteDirectOrdersEnabled)
        : existing.eliteDirectOrdersEnabled,
    saleEnabled: patch.saleEnabled !== undefined ? Boolean(patch.saleEnabled) : existing.saleEnabled,
    salePercentage:
      patch.salePercentage !== undefined ? patch.salePercentage : existing.salePercentage,
    saleReason: patch.saleReason !== undefined ? patch.saleReason : existing.saleReason,
    saleReasonEn: patch.saleReasonEn !== undefined ? patch.saleReasonEn : existing.saleReasonEn,
  };

  if (!next.nameAr) {
    throw createAppError("اسم الباقة بالعربية مطلوب.", 400, {
      exposeToClient: true,
      publicCode: "NAME_AR_REQUIRED",
    });
  }
  if (next.monthlyPriceJod == null || next.monthlyPriceJod < 0) {
    throw createAppError("السعر الشهري غير صالح.", 400, {
      exposeToClient: true,
      publicCode: "INVALID_MONTHLY_PRICE",
    });
  }

  const access = assertRealOrderAccessConfig({
    unlimitedRealOrderValue: next.unlimitedRealOrderValue,
    maxRealOrderValueJod: next.unlimitedRealOrderValue ? null : next.maxRealOrderValueJod,
  });
  const cash = assertCashMonthsConfig({
    cashAllowed: next.cashAllowed,
    minimumCashMonths: next.minimumCashMonths,
    maximumPrepaidMonths: next.maximumPrepaidMonths,
  });
  const includedTokensPerCycle = assertTokensPerCycle(next.includedTokensPerCycle);

  assertValidMarketplaceSalePatch(
    {
      saleEnabled: next.saleEnabled,
      salePercentage: next.salePercentage,
      saleReason: next.saleReason,
      saleReasonEn: next.saleReasonEn,
    },
    {
      monthlyPriceJod: next.monthlyPriceJod,
      saleEnabled: next.saleEnabled,
      salePercentage: next.salePercentage,
      saleReason: next.saleReason,
      saleReasonEn: next.saleReasonEn,
    },
  );

  const saleEnabled = Boolean(next.saleEnabled);
  const salePercentage = saleEnabled ? toFiniteNumber(next.salePercentage) : null;
  const saleReason = saleEnabled ? String(next.saleReason || "").trim() || null : null;
  const saleReasonEn = saleEnabled ? String(next.saleReasonEn || "").trim() || null : null;

  try {
    const { rows } = await pool.query(
      `UPDATE marketplace_membership_plans SET
         name_ar = $2,
         name_en = $3,
         slug = $4,
         description_ar = $5,
         description_en = $6,
         is_active = $7,
         sort_order = $8,
         monthly_price_jod = $9,
         max_real_order_value_jod = $10,
         unlimited_real_order_value = $11,
         included_tokens_per_cycle = $12,
         cash_allowed = $13,
         minimum_cash_months = $14,
         maximum_prepaid_months = $15,
         elite_direct_orders_enabled = $16,
         sale_enabled = $17,
         sale_percentage = $18,
         sale_reason = $19,
         sale_reason_en = $20,
         updated_at = NOW()
       WHERE id = $1::bigint
       RETURNING *`,
      [
        Number(id),
        next.nameAr,
        next.nameEn,
        next.slug,
        next.descriptionAr,
        next.descriptionEn,
        next.isActive,
        next.sortOrder,
        next.monthlyPriceJod,
        access.maxRealOrderValueJod,
        access.unlimitedRealOrderValue,
        includedTokensPerCycle,
        cash.cashAllowed,
        cash.minimumCashMonths,
        cash.maximumPrepaidMonths,
        next.eliteDirectOrdersEnabled,
        saleEnabled,
        salePercentage,
        saleReason,
        saleReasonEn,
      ],
    );
    return mapMarketplaceMembershipPlan(rows[0]);
  } catch (err) {
    if (err && err.code === "23505") {
      throw createAppError("الرابط مستخدم مسبقاً.", 409, {
        exposeToClient: true,
        publicCode: "DUPLICATE_SLUG",
      });
    }
    throw err;
  }
}

/**
 * Soft-disable preferred. Hard delete only when unused (Phase 1: always unused).
 * Structured so future membership FKs can block deletion.
 */
async function deactivateMarketplaceMembershipPlan(id) {
  return updateMarketplaceMembershipPlan(id, { isActive: false });
}

async function activateMarketplaceMembershipPlan(id) {
  return updateMarketplaceMembershipPlan(id, { isActive: true });
}

async function deleteMarketplaceMembershipPlan(id) {
  // Future: reject if marketplace memberships reference this plan.
  const existing = await getMarketplaceMembershipPlanById(id);
  if (!existing) {
    throw createAppError("الباقة غير موجودة.", 404, {
      exposeToClient: true,
      publicCode: "PLAN_NOT_FOUND",
    });
  }
  await pool.query(`DELETE FROM marketplace_membership_plans WHERE id = $1::bigint`, [Number(id)]);
  return { id: String(id), deleted: true };
}

/**
 * @param {{ orderedIds: Array<string|number> }} input
 */
async function reorderMarketplaceMembershipPlans({ orderedIds }) {
  const ids = (orderedIds || []).map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) {
    throw createAppError("قائمة الترتيب فارغة.", 400, {
      exposeToClient: true,
      publicCode: "EMPTY_REORDER",
    });
  }
  if (new Set(ids).size !== ids.length) {
    throw createAppError("قائمة الترتيب تحتوي على تكرار.", 400, {
      exposeToClient: true,
      publicCode: "DUPLICATE_REORDER_IDS",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`SELECT id FROM marketplace_membership_plans FOR UPDATE`);
    const existingIds = new Set(rows.map((r) => Number(r.id)));
    for (const id of ids) {
      if (!existingIds.has(id)) {
        throw createAppError("معرّف باقة غير موجود في الترتيب.", 400, {
          exposeToClient: true,
          publicCode: "UNKNOWN_REORDER_ID",
        });
      }
    }
    for (let i = 0; i < ids.length; i += 1) {
      await client.query(
        `UPDATE marketplace_membership_plans
         SET sort_order = $2, updated_at = NOW()
         WHERE id = $1::bigint`,
        [ids[i], (i + 1) * 10],
      );
    }
    await client.query("COMMIT");
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

  return listAdminMarketplaceMembershipPlans({ includeInactive: true });
}

/**
 * Pure helper for future real-order eligibility (Phase 1: config only — not wired to orders).
 * Fake/training orders must never call this.
 */
function resolveRealOrderAccessFromPlan(plan) {
  if (!plan) return null;
  if (plan.unlimitedRealOrderValue || plan.access?.unlimited) {
    return { unlimited: true, maxRealOrderValueJod: null };
  }
  const max =
    plan.access?.maxRealOrderValueJod != null
      ? toFiniteNumber(plan.access.maxRealOrderValueJod)
      : toFiniteNumber(plan.maxRealOrderValueJod);
  if (max == null || max <= 0) return null;
  return { unlimited: false, maxRealOrderValueJod: max };
}

module.exports = {
  mapMarketplaceMembershipPlan,
  mapPublicMarketplaceMembershipPlan,
  listPublicMarketplaceMembershipPlans,
  listAdminMarketplaceMembershipPlans,
  getMarketplaceMembershipPlanById,
  getMarketplaceMembershipPlanByTierCode,
  createMarketplaceMembershipPlan,
  updateMarketplaceMembershipPlan,
  deactivateMarketplaceMembershipPlan,
  activateMarketplaceMembershipPlan,
  deleteMarketplaceMembershipPlan,
  reorderMarketplaceMembershipPlans,
  resolveRealOrderAccessFromPlan,
  assertRealOrderAccessConfig,
  assertCashMonthsConfig,
  assertTokensPerCycle,
  resolveMarketplaceMembershipPayablePricing,
};
