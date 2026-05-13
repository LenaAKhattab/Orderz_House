import { useEffect, useState } from "react";
import { getCategoriesRequest } from "../services/api";

/**
 * Public homepage categories grid (same payload as legacy CategoriesSection fetch).
 * @returns {{ items: unknown[]; loading: boolean; error: boolean }}
 */
export default function usePublicHomeCategories() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await getCategoriesRequest();
        const list = Array.isArray(res?.data) ? res.data : [];
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
