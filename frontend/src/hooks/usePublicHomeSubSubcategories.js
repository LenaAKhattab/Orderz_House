import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicSubSubcategoriesRequest } from "../services/api";

export const HOME_SUB_SUBCATEGORIES_PAGE_SIZE = 16;

const EMPTY_META = {
  page: 1,
  limit: HOME_SUB_SUBCATEGORIES_PAGE_SIZE,
  total: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

/**
 * Paginated public sub-subcategories for the homepage categories grid.
 */
export default function usePublicHomeSubSubcategories() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(EMPTY_META);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [error, setError] = useState(false);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const fetchGen = ++fetchGenRef.current;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await getPublicSubSubcategoriesRequest(
          { page, limit: HOME_SUB_SUBCATEGORIES_PAGE_SIZE },
          { signal: controller.signal },
        );
        if (fetchGen !== fetchGenRef.current) return;
        const data = res?.data || {};
        setItems(Array.isArray(data.items) ? data.items : []);
        setMeta({
          page: Number(data.page) || page,
          limit: Number(data.limit) || HOME_SUB_SUBCATEGORIES_PAGE_SIZE,
          total: Number(data.total) || 0,
          totalPages: Number(data.totalPages) || 1,
          hasNextPage: Boolean(data.hasNextPage),
          hasPrevPage: Boolean(data.hasPrevPage),
        });
      } catch (err) {
        if (controller.signal.aborted || err?.code === "ERR_CANCELED") return;
        if (fetchGen !== fetchGenRef.current) return;
        setError(true);
      } finally {
        if (fetchGen === fetchGenRef.current) {
          setLoading(false);
          setInitialLoad(false);
        }
      }
    }

    void load();
    return () => controller.abort();
  }, [page]);

  const goNext = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  const goPrev = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  return {
    items,
    page,
    meta,
    loading,
    initialLoad,
    error,
    hasNextPage: meta.hasNextPage,
    hasPrevPage: meta.hasPrevPage,
    goNext,
    goPrev,
  };
}
