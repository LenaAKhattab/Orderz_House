import { useEffect, useMemo, useRef, useState } from "react";
import { fetchResolvedDefaultCatalogPlans } from "../lib/planCatalog/fetchPlansForCatalog";
import {
  fetchDefaultCatalogPlansCached,
  getCachedDefaultCatalog,
  getCachedPublicActivationFee,
  getCachedPublicPlans,
} from "../services/freelancerSessionCache";
import { catalogSourceForPlanCatalog, isMarketplacePlanCatalog } from "../constants/planCatalogs";

const LOAD_ERROR_AR = "تعذر تحميل الباقات الافتراضية.";

/**
 * Loads Super Admin-selected default catalog + that catalog's existing public plans.
 * No silent fallback to another catalog when the setting or fetch fails.
 *
 * Performance:
 * - Initial skeleton only when cache is empty
 * - Background refresh keeps prior plans visible (no full skeleton flash)
 * - Stale responses ignored via generation token
 * - Does not force-refresh on every mount (uses session cache / in-flight dedupe)
 */
export function useDefaultCatalogPlans({
  enabled = true,
  useSessionCache = false,
  forceRefresh = false,
} = {}) {
  const cachedPlans = useSessionCache ? getCachedPublicPlans() : null;
  const cachedCatalog = useSessionCache ? getCachedDefaultCatalog() : null;
  const hasUsableCache = Boolean(
    enabled && useSessionCache && cachedCatalog && Array.isArray(cachedPlans),
  );

  const [catalog, setCatalog] = useState(() => (enabled ? cachedCatalog : null));
  const [plans, setPlans] = useState(() => (enabled && cachedPlans ? cachedPlans : []));
  const [activationFee, setActivationFee] = useState(() =>
    enabled && useSessionCache ? getCachedPublicActivationFee() : null,
  );
  /** True only for the first unresolved load (no usable cache). */
  const [loading, setLoading] = useState(() => Boolean(enabled) && !hasUsableCache);
  /** True while a background revalidation runs with existing data shown. */
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [catalogResolved, setCatalogResolved] = useState(() => hasUsableCache);

  const generationRef = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setCatalog(null);
      setPlans([]);
      setActivationFee(null);
      setLoading(false);
      setRefreshing(false);
      setError("");
      setCatalogResolved(false);
      return undefined;
    }

    const generation = ++generationRef.current;
    let cancelled = false;

    const cacheCatalog = useSessionCache ? getCachedDefaultCatalog() : null;
    const cachePlans = useSessionCache ? getCachedPublicPlans() : null;
    const haveCache = Boolean(cacheCatalog && Array.isArray(cachePlans));

    if (haveCache) {
      setCatalog(cacheCatalog);
      setPlans(cachePlans);
      setActivationFee(useSessionCache ? getCachedPublicActivationFee() : null);
      setCatalogResolved(true);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
      setRefreshing(false);
      setCatalogResolved(false);
    }
    setError("");

    const loader = useSessionCache ? fetchDefaultCatalogPlansCached : fetchResolvedDefaultCatalogPlans;

    void loader({ force: forceRefresh || !haveCache })
      .then((result) => {
        if (cancelled || generation !== generationRef.current) return;
        setCatalog(result.catalog);
        setPlans(Array.isArray(result.plans) ? result.plans : []);
        setActivationFee(result.activationFee ?? null);
        setCatalogResolved(true);
        setError("");
      })
      .catch((err) => {
        if (cancelled || generation !== generationRef.current) return;
        // Keep prior usable data on refresh failure; only hard-fail when unresolved.
        if (!haveCache) {
          setCatalog(null);
          setPlans([]);
          setActivationFee(null);
          setCatalogResolved(false);
        }
        setError(err?.response?.data?.message || err?.message || LOAD_ERROR_AR);
      })
      .finally(() => {
        if (cancelled || generation !== generationRef.current) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, useSessionCache, forceRefresh]);

  const catalogSource = catalogSourceForPlanCatalog(catalog);

  return useMemo(
    () => ({
      catalog,
      catalogSource,
      isMarketplaceCatalog: isMarketplacePlanCatalog(catalog),
      /** Catalog id known (cache or network). Do not assume legacy when false. */
      catalogResolved,
      plans,
      activationFee,
      /** Initial unresolved load only — use for full skeleton. */
      loading,
      refreshing,
      error,
    }),
    [catalog, catalogSource, catalogResolved, plans, activationFee, loading, refreshing, error],
  );
}
