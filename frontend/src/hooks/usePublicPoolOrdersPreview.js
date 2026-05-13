import { useEffect, useState } from "react";
import { listPoolOrdersRequest } from "../services/api";

/** Same query defaults as `OpenOrdersMarketplace` initial pool load (public `/orders`). */
const POOL_PREVIEW_PARAMS = Object.freeze({ page: 1, limit: 6, sort: "newest" });

/**
 * @returns {{ items: unknown[]; loading: boolean; error: boolean }}
 */
export default function usePublicPoolOrdersPreview() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await listPoolOrdersRequest(POOL_PREVIEW_PARAMS);
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
  }, []);

  return { items, loading, error };
}
