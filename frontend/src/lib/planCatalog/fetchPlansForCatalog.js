import {
  getPublicDefaultPlanCatalogRequest,
  listPublicMarketplaceMembershipPlansRequest,
  listPublicPlansRequest,
  listPublicSpecialPagePlansRequest,
} from "../../services/api";
import { mapMarketplaceMembershipPlansForPublicPlans } from "../marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans";
import {
  PLAN_CATALOG,
  catalogSourceForPlanCatalog,
  isPlanCatalog,
} from "../../constants/planCatalogs";

const LAST_DEFAULT_CATALOG_KEY = "oh_last_default_plan_catalog";

function extractItems(res) {
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function extractPlans(res) {
  if (Array.isArray(res?.data?.plans)) return res.data.plans;
  if (Array.isArray(res?.plans)) return res.plans;
  return [];
}

function tagCatalogSource(plans, catalog) {
  const source = catalogSourceForPlanCatalog(catalog);
  return (Array.isArray(plans) ? plans : []).map((plan) => ({
    ...plan,
    catalogSource: plan?.catalogSource || source,
  }));
}

function readLastDefaultCatalog() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const v = sessionStorage.getItem(LAST_DEFAULT_CATALOG_KEY);
    return isPlanCatalog(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLastDefaultCatalog(catalog) {
  try {
    if (typeof sessionStorage === "undefined") return;
    if (isPlanCatalog(catalog)) sessionStorage.setItem(LAST_DEFAULT_CATALOG_KEY, catalog);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Fetch the selected EXISTING catalog's public plans. Does not copy rows or merge schemas.
 * @param {string} catalog
 * @returns {Promise<{ plans: object[], activationFee: object|null, catalogSource: string|null }>}
 */
export async function fetchPlansForCatalog(catalog) {
  if (!isPlanCatalog(catalog)) {
    const err = new Error("INVALID_PLAN_CATALOG");
    err.code = "INVALID_PLAN_CATALOG";
    throw err;
  }

  if (catalog === PLAN_CATALOG.MARKETPLACE_PLANS) {
    const res = await listPublicMarketplaceMembershipPlansRequest();
    const specialOfferPackage =
      res?.data?.specialOfferPackage && typeof res.data.specialOfferPackage === "object"
        ? res.data.specialOfferPackage
        : null;
    return {
      plans: mapMarketplaceMembershipPlansForPublicPlans(extractItems(res)),
      activationFee: null,
      catalogSource: catalogSourceForPlanCatalog(catalog),
      specialOfferPackage,
    };
  }

  if (catalog === PLAN_CATALOG.PAGE_PLANS) {
    const res = await listPublicSpecialPagePlansRequest();
    return {
      plans: tagCatalogSource(extractPlans(res), catalog),
      activationFee: res?.data?.activationFee ?? null,
      catalogSource: catalogSourceForPlanCatalog(catalog),
      specialOfferPackage: null,
    };
  }

  if (catalog === PLAN_CATALOG.MAIN_PLANS) {
    const res = await listPublicPlansRequest();
    return {
      plans: tagCatalogSource(extractPlans(res), catalog),
      activationFee: res?.data?.activationFee ?? null,
      catalogSource: catalogSourceForPlanCatalog(catalog),
      specialOfferPackage: null,
    };
  }

  const err = new Error("INVALID_PLAN_CATALOG");
  err.code = "INVALID_PLAN_CATALOG";
  throw err;
}

/**
 * Read the canonical default catalog then fetch that catalog's existing API.
 * When a previous visit cached the last catalog id, the plans list is prefetched
 * in parallel with the setting request (waterfall depth 1). If the setting
 * differs, the matching catalog is fetched and the stale prefetch is discarded.
 *
 * On invalid/missing catalog: throw — callers must show an error, not a legacy fallback.
 */
export async function fetchResolvedDefaultCatalogPlans() {
  const lastCatalog = readLastDefaultCatalog();
  const settingPromise = getPublicDefaultPlanCatalogRequest();
  const prefetchPromise =
    lastCatalog != null
      ? fetchPlansForCatalog(lastCatalog).catch(() => null)
      : Promise.resolve(null);

  const [setting, prefetch] = await Promise.all([settingPromise, prefetchPromise]);
  const catalog = setting?.data?.catalog;
  if (!isPlanCatalog(catalog)) {
    const err = new Error("INVALID_DEFAULT_PLAN_CATALOG");
    err.code = "INVALID_DEFAULT_PLAN_CATALOG";
    throw err;
  }

  writeLastDefaultCatalog(catalog);

  if (catalog === lastCatalog && prefetch) {
    return { catalog, ...prefetch };
  }

  const result = await fetchPlansForCatalog(catalog);
  return { catalog, ...result };
}

export { readLastDefaultCatalog, writeLastDefaultCatalog, LAST_DEFAULT_CATALOG_KEY };
