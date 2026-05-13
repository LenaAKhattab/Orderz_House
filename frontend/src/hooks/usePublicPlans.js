import { useEffect, useState } from "react";
import { listPublicPlansRequest } from "../services/api";

/**
 * Public catalog plans (same payload as `/plans` page).
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
