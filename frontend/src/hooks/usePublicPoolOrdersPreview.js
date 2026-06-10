import { useEffect, useMemo, useState } from "react";
import { listPoolOrdersRequest } from "../services/api";

/** Same query defaults as `OpenOrdersMarketplace` initial pool load (public `/orders`). */
const POOL_PREVIEW_PARAMS = Object.freeze({ page: 1, limit: 6, sort: "newest" });

/**
 * @param {{ limit?: number }} [options]
 * @returns {{ items: unknown[]; loading: boolean; error: boolean }}
 */
export default function usePublicPoolOrdersPreview(options = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const queryParams = useMemo(
    () => ({
      ...POOL_PREVIEW_PARAMS,
      ...(options.limit != null ? { limit: options.limit } : {}),
    }),
    [options.limit],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await listPoolOrdersRequest(queryParams);
        const list = Array.isArray(res?.data?.orders) ? res.data.orders : [];
        if (!cancelled) setItems(list);
      } catch {
        if (!cancelled) {
          setItems([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [queryParams]);

  return { items, loading, error };
}
