import { useEffect, useState } from "react";
import { listPublicPlansRequest } from "../services/api";
import { getOrderzhousePlansCatalog, mergeApiPlansWithCatalog } from "../constants/orderzhousePlansCatalog";

/**
 * Public catalog from GET /api/plans (default plan page). Legacy catalog fallback only when API returns ids 1–3.
 * @returns {{ items: unknown[]; loading: boolean; error: boolean }}
 */
export default function usePublicPlans() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const data = await listPublicPlansRequest();
        const list = Array.isArray(data?.data?.plans) ? data.data.plans : [];
        if (!cancelled) setItems(mergeApiPlansWithCatalog(list));
      } catch {
        if (!cancelled) {
          setItems(getOrderzhousePlansCatalog());
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
