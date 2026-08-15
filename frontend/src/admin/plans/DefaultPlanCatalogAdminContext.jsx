import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getAdminDefaultPlanCatalogRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { isPlanCatalog } from "../../constants/planCatalogs";

const DefaultPlanCatalogAdminContext = createContext(null);

/** Last successful admin default — avoids tab jump/wrong badge across catalog pages. */
let adminDefaultPlanCatalogCache = null;

function readCache() {
  const catalog = adminDefaultPlanCatalogCache?.catalog;
  if (!isPlanCatalog(catalog)) return null;
  return {
    catalog,
    catalogs: Array.isArray(adminDefaultPlanCatalogCache.catalogs)
      ? adminDefaultPlanCatalogCache.catalogs
      : [],
  };
}

function writeCache(catalog, catalogs) {
  if (!isPlanCatalog(catalog)) return;
  adminDefaultPlanCatalogCache = {
    catalog,
    catalogs: Array.isArray(catalogs) ? catalogs : [],
  };
}

export function DefaultPlanCatalogAdminProvider({ children, isEn = false }) {
  const cached = readCache();
  const [catalog, setCatalog] = useState(() => cached?.catalog ?? null);
  const [catalogs, setCatalogs] = useState(() => cached?.catalogs ?? []);
  const [ready, setReady] = useState(() => Boolean(cached?.catalog));
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState("");

  const applyPayload = useCallback((data) => {
    const next = isPlanCatalog(data?.catalog) ? data.catalog : null;
    const nextCatalogs = Array.isArray(data?.catalogs) ? data.catalogs : [];
    if (!next) {
      setReady(false);
      setCatalog(null);
      setCatalogs(nextCatalogs);
      return;
    }
    writeCache(next, nextCatalogs);
    setCatalog(next);
    setCatalogs(nextCatalogs);
    setReady(true);
    setError("");
  }, []);

  const reload = useCallback(async () => {
    const hasCache = Boolean(readCache());
    if (!hasCache) {
      setLoading(true);
      setReady(false);
      setCatalog(null);
    }
    setError("");
    try {
      const res = await getAdminDefaultPlanCatalogRequest();
      applyPayload(res?.data);
    } catch (err) {
      if (!readCache()) {
        setReady(false);
        setCatalog(null);
      }
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Could not load plan catalog data." : "تعذر تحميل بيانات الباقات"),
      );
    } finally {
      setLoading(false);
    }
  }, [applyPayload, isEn]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const value = useMemo(
    () => ({
      catalog: ready && isPlanCatalog(catalog) ? catalog : null,
      catalogs,
      loading,
      ready: ready && isPlanCatalog(catalog),
      error,
      reload,
      applyPayload,
    }),
    [applyPayload, catalog, catalogs, error, loading, ready, reload],
  );

  return (
    <DefaultPlanCatalogAdminContext.Provider value={value}>
      {children}
    </DefaultPlanCatalogAdminContext.Provider>
  );
}

export function useAdminDefaultPlanCatalog() {
  return useContext(DefaultPlanCatalogAdminContext);
}
