/**
 * Legacy Admin assignable packages = live marketplace membership catalog
 * (STARTER / SILVER / PRO / ELITE), bridged to `plans` rows for existing
 * freelancer_subscriptions.plan_id FK semantics.
 *
 * Does NOT delete historical plans. Does NOT include training packages,
 * duration-named legacy products, or special_offer promo campaigns.
 */

const { pool } = require("../config/db");
const {
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES,
} = require("../constants/marketplaceMembershipPlans");
const { createPublicApiError } = require("../utils/publicApiError");

const BRIDGE_NAME_PREFIX = "marketplace_membership_";

const PUBLIC_TIER_DISPLAY = Object.freeze({
  starter: "STARTER",
  silver: "SILVER",
  pro: "PRO",
  elite: "ELITE",
});

const ACTIVE_TIER_SET = new Set(
  MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.map((c) => String(c).toLowerCase()),
);

function bridgePlanName(tierCode) {
  return `${BRIDGE_NAME_PREFIX}${String(tierCode).trim().toLowerCase()}`;
}

function displayCodeForTier(tierCode) {
  const code = String(tierCode || "")
    .trim()
    .toLowerCase();
  return PUBLIC_TIER_DISPLAY[code] || String(tierCode || "").toUpperCase();
}

function toFiniteNumber(value) {
  if (value === "" || value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ensure a hidden legacy `plans` bridge row exists for a marketplace tier so
 * assignLegacySubscription can keep writing freelancer_subscriptions.plan_id.
 * Additive only — never deletes historical plans.
 */
async function ensureLegacyBridgePlanForMarketplaceTier(marketplacePlan, client = pool) {
  const tierCode = String(marketplacePlan.tier_code || marketplacePlan.tierCode || "")
    .trim()
    .toLowerCase();
  if (!ACTIVE_TIER_SET.has(tierCode)) {
    throw createPublicApiError("باقة العضوية غير صالحة للإسناد.", 400, "INVALID_MARKETPLACE_TIER");
  }

  const name = bridgePlanName(tierCode);
  const title = displayCodeForTier(tierCode);
  const priceJod = toFiniteNumber(
    marketplacePlan.monthly_price_jod ?? marketplacePlan.monthlyPriceJod,
  );
  const durationDaysRaw = toFiniteNumber(
    marketplacePlan.cycle_duration_days ?? marketplacePlan.cycleDurationDays,
  );
  const durationDays =
    durationDaysRaw != null && durationDaysRaw > 0 && durationDaysRaw <= 3650
      ? Math.round(durationDaysRaw)
      : 30;
  const description =
    marketplacePlan.description_ar ||
    marketplacePlan.descriptionAr ||
    `Legacy admin bridge for marketplace membership ${title}`;

  const sortOrder =
    Number(marketplacePlan.sort_order ?? marketplacePlan.sortOrder) ||
    100 + (ACTIVE_TIER_SET.size || 0);

  const { rows } = await client.query(
    `INSERT INTO plans (
       name, title, title_en, description, description_en,
       duration_days, price_jod,
       requires_company_visit, self_subscribe_allowed,
       is_active, is_visible, sort_order,
       admin_notes, currency
     ) VALUES (
       $1, $2, $2, $3, $3,
       $4, $5,
       FALSE, FALSE,
       TRUE, FALSE, $6,
       $7, 'JOD'
     )
     ON CONFLICT (name) DO UPDATE SET
       title = EXCLUDED.title,
       title_en = EXCLUDED.title_en,
       description = COALESCE(EXCLUDED.description, plans.description),
       description_en = COALESCE(EXCLUDED.description_en, plans.description_en),
       duration_days = EXCLUDED.duration_days,
       price_jod = EXCLUDED.price_jod,
       is_active = TRUE,
       is_visible = FALSE,
       self_subscribe_allowed = FALSE,
       admin_notes = EXCLUDED.admin_notes,
       deleted_at = NULL,
       updated_at = NOW()
     RETURNING id, name, title, price_jod, duration_days, is_active, is_visible`,
    [
      name,
      title,
      description,
      durationDays,
      priceJod != null ? priceJod : 0,
      sortOrder,
      `Bridge for Legacy Admin assignment of marketplace membership tier=${tierCode}. Hidden from public plan catalogs.`,
    ],
  );

  return rows[0];
}

async function listLiveMarketplaceMembershipRows(client = pool) {
  const { rows } = await client.query(
    `SELECT *
       FROM marketplace_membership_plans
      WHERE is_active = TRUE
        AND (tier_code !~ '^special_offer(_v[0-9]+)?$')
        AND lower(tier_code) = ANY($1::text[])
      ORDER BY sort_order ASC, id ASC`,
    [MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.map((c) => String(c).toLowerCase())],
  );
  return rows;
}

/**
 * Canonical assignable package options for Legacy Freelancer Admin.
 * Same live family as public «عضوية سوق أوردرز هاوس».
 */
async function listAssignablePackagesForLegacyAdmin({ includeDiagnostic = false } = {}) {
  const marketRows = await listLiveMarketplaceMembershipRows();
  const packages = [];

  for (const row of marketRows) {
    const bridge = await ensureLegacyBridgePlanForMarketplaceTier(row);
    const tierCode = String(row.tier_code).toLowerCase();
    packages.push({
      id: String(bridge.id),
      planId: String(bridge.id),
      marketplacePlanId: String(row.id),
      tierCode,
      displayName: displayCodeForTier(tierCode),
      name: displayCodeForTier(tierCode),
      title: displayCodeForTier(tierCode),
      nameAr: row.name_ar || null,
      nameEn: row.name_en || null,
      monthlyPriceJod: toFiniteNumber(row.monthly_price_jod),
      isActive: true,
      isPublic: true,
      productFamily: "marketplace_membership",
    });
  }

  const order = new Map(
    MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES.map((c, i) => [String(c).toLowerCase(), i]),
  );
  packages.sort(
    (a, b) => (order.get(a.tierCode) ?? 99) - (order.get(b.tierCode) ?? 99),
  );

  const out = { packages, count: packages.length };
  if (includeDiagnostic) {
    out.diagnostic = await classifyExcludedLegacyPlanRecords();
    out.promoOffer = await describePromoOfferDecision();
  }
  return out;
}

async function describePromoOfferDecision(client = pool) {
  const { rows } = await client.query(
    `SELECT id, tier_code, name_ar, name_en, is_active
       FROM marketplace_membership_plans
      WHERE tier_code ~ '^special_offer(_v[0-9]+)?$'
      ORDER BY id ASC`,
  );
  return {
    included: false,
    reason:
      "special_offer is a promotional campaign catalog (باقة العرض), excluded from regular STARTER–ELITE public membership and from Legacy Admin duration-based assignment.",
    activeRows: rows.filter((r) => r.is_active).length,
    totalRows: rows.length,
  };
}

/**
 * Read-only classification of legacy `plans` rows that must NOT appear in
 * the new assignment selector. Used by tests / deploy diagnostics.
 */
async function classifyExcludedLegacyPlanRecords(client = pool) {
  const { rows } = await client.query(
    `SELECT id, name, title, is_active, is_visible, deleted_at, plan_page_id, duration_days
       FROM plans
      ORDER BY id ASC`,
  );

  const buckets = {
    training: [],
    duration: [],
    inactive: [],
    deprecated: [],
    duplicate: [],
    unrelated: [],
    bridge: [],
  };

  const durationTitleRe = /^(شهر واحد|سنة واحدة|سنتان|1 month|1 year|2 years)$/i;
  const durationNameRe = /_(1_month|1_year|2_year)$/i;
  const seenTitles = new Map();

  for (const row of rows) {
    const id = String(row.id);
    const name = String(row.name || "");
    const title = String(row.title || "").trim();
    const entry = { id, name, title };

    if (name.startsWith(BRIDGE_NAME_PREFIX)) {
      buckets.bridge.push(entry);
      continue;
    }
    if (row.deleted_at) {
      buckets.deprecated.push({ ...entry, reason: "deleted" });
      continue;
    }
    if (durationTitleRe.test(title) || durationNameRe.test(name)) {
      buckets.duration.push(entry);
      continue;
    }
    if (/train|تدريب/i.test(name) || /train|تدريب/i.test(title)) {
      buckets.training.push(entry);
      continue;
    }
    if (row.is_active === false) {
      buckets.inactive.push(entry);
      continue;
    }

    const titleKey = title.toLowerCase();
    if (seenTitles.has(titleKey)) {
      buckets.duplicate.push({
        ...entry,
        reason: `duplicate_title_of_${seenTitles.get(titleKey)}`,
      });
      continue;
    }
    seenTitles.set(titleKey, id);

    buckets.unrelated.push(entry);
  }

  return {
    counts: Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]),
    ),
    buckets,
  };
}

/**
 * Validate that a planId is an assignable live marketplace bridge plan.
 * Rejects duration/legacy/training/promo plans for NEW assignments.
 */
async function assertAssignableLegacyPackagePlanId(planId, client = pool) {
  const pid = Number(planId);
  if (!Number.isInteger(pid) || pid < 1) {
    throw createPublicApiError("الباقة غير صالحة.", 400, "VALIDATION_ERROR");
  }

  const { rows } = await client.query(
    `SELECT id, name, title, is_active, deleted_at
       FROM plans
      WHERE id = $1::bigint
      LIMIT 1`,
    [pid],
  );
  const plan = rows[0];
  if (!plan || plan.deleted_at) {
    throw createPublicApiError("الباقة غير موجودة.", 404, "PLAN_NOT_FOUND");
  }
  if (!plan.is_active) {
    throw createPublicApiError("الباقة غير نشطة.", 400, "PLAN_INACTIVE");
  }

  const name = String(plan.name || "");
  if (!name.startsWith(BRIDGE_NAME_PREFIX)) {
    throw createPublicApiError(
      "يُسمح فقط بإسناد باقات عضوية سوق أوردرز هاوس الحالية (STARTER / SILVER / PRO / ELITE).",
      400,
      "PLAN_NOT_ASSIGNABLE",
    );
  }

  const tierCode = name.slice(BRIDGE_NAME_PREFIX.length).toLowerCase();
  if (!ACTIVE_TIER_SET.has(tierCode) || /^special_offer(_v\d+)?$/.test(tierCode)) {
    throw createPublicApiError("باقة العضوية غير صالحة للإسناد.", 400, "INVALID_MARKETPLACE_TIER");
  }

  const { rows: marketRows } = await client.query(
    `SELECT id, tier_code, is_active
       FROM marketplace_membership_plans
      WHERE lower(tier_code) = $1
      LIMIT 1`,
    [tierCode],
  );
  const market = marketRows[0];
  if (!market || !market.is_active) {
    throw createPublicApiError("باقة العضوية غير متاحة حالياً.", 400, "MARKETPLACE_PLAN_INACTIVE");
  }

  return {
    planId: Number(plan.id),
    planName: plan.name,
    planTitle: plan.title,
    tierCode,
    marketplacePlanId: Number(market.id),
  };
}

module.exports = {
  BRIDGE_NAME_PREFIX,
  PUBLIC_TIER_DISPLAY,
  bridgePlanName,
  displayCodeForTier,
  ensureLegacyBridgePlanForMarketplaceTier,
  listAssignablePackagesForLegacyAdmin,
  classifyExcludedLegacyPlanRecords,
  describePromoOfferDecision,
  assertAssignableLegacyPackagePlanId,
};
