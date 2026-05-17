import { useEffect, useState } from "react";
import { listPublicPlansRequest } from "../services/api";
import { getOrderzhousePlansCatalog, mergeApiPlansWithCatalog } from "../constants/orderzhousePlansCatalog";

/**
 * Public catalog: hard-coded ORDERZHOUSE plans (ids 1, 2, 3), optional API overlay for checkout flags.
 * @returns {{ items: unknown[]; loading: boolean; error: boolean }}
 */
export default function usePublicPlans() {
  const [items, setItems] = useState(() => getOrderzhousePlansCatalog());
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
