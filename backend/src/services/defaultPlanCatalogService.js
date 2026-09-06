/**
 * Resolver for the Super Admin-selected default plan catalog.
 * Chooses which EXISTING catalog is user-facing. Does not merge schemas,
 * copy rows, or change checkout / membership activation logic.
 */

const { getSetting, setSetting } = require("./systemSettingsService");
const { createAppError } = require("../utils/AppError");
const { MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES } = require("../constants/marketplaceMembershipPlans");
const {
  PLAN_CATALOG,
  PLAN_CATALOG_VALUES,
  DEFAULT_PLAN_CATALOG_SETTING_KEY,
  DEFAULT_PLAN_CATALOG_INITIAL_VALUE,
  normalizePlanCatalog,
} = require("../constants/planCatalogs");

const EMPTY_CATALOG_MESSAGE = "لا يمكن تعيين هذا القسم كباقات افتراضية لأنه لا يحتوي على باقات مفعلة.";
const INVALID_CATALOG_MESSAGE = "قسم الباقات المحدد غير موجود.";
const INVALID_STORED_MESSAGE = "تعذر قراءة إعداد الباقات الافتراضية.";

function plansService() {
  return require("./plansService");
}

function planPagesService() {
  return require("./planPagesService");
}

function marketplaceMembershipPlansService() {
  return require("./marketplaceMembershipPlansService");
}

function countMarketplacePublicPlans(items) {
  const allowed = new Set(MARKETPLACE_MEMBERSHIP_ACTIVE_TIER_CODES);
  return (Array.isArray(items) ? items : []).filter((plan) =>
    allowed.has(String(plan?.tierCode || "").trim().toLowerCase()),
  ).length;
}

/**
 * Count active user-visible plans in an existing catalog (what /plans would render).
 * @param {string} catalog
 * @returns {Promise<number>}
 */
async function countActiveUserVisiblePlans(catalog) {
  const normalized = normalizePlanCatalog(catalog);
  if (!normalized) return 0;

  if (normalized === PLAN_CATALOG.MAIN_PLANS) {
    const plans = await plansService().listPublicCatalogPlans();
    return Array.isArray(plans) ? plans.length : 0;
  }

  if (normalized === PLAN_CATALOG.PAGE_PLANS) {
    const plans = await planPagesService().listPublicSpecialPageCatalogPlans();
    return Array.isArray(plans) ? plans.length : 0;
  }

  const items = await marketplaceMembershipPlansService().listPublicMarketplaceMembershipPlans();
  return countMarketplacePublicPlans(items);
}

async function listCatalogSummaries() {
  const counts = await Promise.all(
    PLAN_CATALOG_VALUES.map(async (id) => ({
      id,
      activePlanCount: await countActiveUserVisiblePlans(id),
    })),
  );
  return counts;
}

/**
 * Resolve the canonical default catalog.
 * Unset setting → INITIAL_VALUE (marketplace_plans, current public /plans source).
 * Invalid stored value → error (no silent fallback to another catalog).
 * @returns {Promise<string>}
 */
async function resolveDefaultPlanCatalog() {
  const raw = await getSetting(DEFAULT_PLAN_CATALOG_SETTING_KEY);
  if (raw == null || String(raw).trim() === "") {
    return DEFAULT_PLAN_CATALOG_INITIAL_VALUE;
  }
  const catalog = normalizePlanCatalog(raw);
  if (!catalog) {
    throw createAppError(INVALID_STORED_MESSAGE, 503, {
      exposeToClient: true,
      publicCode: "INVALID_DEFAULT_PLAN_CATALOG",
    });
  }
  return catalog;
}

/**
 * Public/read-safe payload — catalog id only.
 */
async function getPublicDefaultPlanCatalog() {
  const catalog = await resolveDefaultPlanCatalog();
  return { catalog };
}

/**
 * Super Admin payload including per-catalog active counts.
 */
async function getAdminDefaultPlanCatalog() {
  const catalog = await resolveDefaultPlanCatalog();
  const catalogs = await listCatalogSummaries();
  return { catalog, catalogs };
}

/**
 * Persist a new default catalog after validation. Does not move or delete plan rows.
 * @param {string} catalog
 * @param {{ updatedByUserId?: number|null }} [opts]
 */
async function setDefaultPlanCatalog(catalog, opts = {}) {
  const normalized = normalizePlanCatalog(catalog);
  if (!normalized) {
    throw createAppError(INVALID_CATALOG_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: "INVALID_PLAN_CATALOG",
    });
  }

  const activePlanCount = await countActiveUserVisiblePlans(normalized);
  if (activePlanCount <= 0) {
    throw createAppError(EMPTY_CATALOG_MESSAGE, 400, {
      exposeToClient: true,
      publicCode: "EMPTY_PLAN_CATALOG",
    });
  }

  await setSetting(DEFAULT_PLAN_CATALOG_SETTING_KEY, normalized, {
    updatedByUserId: opts.updatedByUserId ?? null,
  });

  const catalogs = await listCatalogSummaries();
  return { catalog: normalized, catalogs };
}

module.exports = {
  EMPTY_CATALOG_MESSAGE,
  INVALID_CATALOG_MESSAGE,
  INVALID_STORED_MESSAGE,
  countActiveUserVisiblePlans,
  resolveDefaultPlanCatalog,
  getPublicDefaultPlanCatalog,
  getAdminDefaultPlanCatalog,
  setDefaultPlanCatalog,
};
