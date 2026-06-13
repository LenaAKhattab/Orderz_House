import { useEffect, useState } from "react";
import { getPublicFaqRequest } from "../services/api";
import { HOME_FAQ_ITEMS } from "../constants/homeFaqItems";

/** @typedef {{ id: number | string, question: string, answer: string }} PublicFaqItem */

function fallbackItems() {
  return HOME_FAQ_ITEMS.map((item) => ({
    id: item.id,
    question: item.q,
    answer: item.a,
  }));
}

/**
 * Public homepage FAQ (active items, ordered).
 * @returns {{ items: PublicFaqItem[]; loading: boolean; error: boolean }}
 */
export function usePublicFaq() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await getPublicFaqRequest();
        const list = Array.isArray(res?.data?.items) ? res.data.items : [];
        if (!cancelled) {
          if (list.length) {
            setItems(
              list.map((item) => ({
                id: item.id,
                question: item.question,
                answer: item.answer,
              })),
            );
          } else {
            setItems(fallbackItems());
          }
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setItems(fallbackItems());
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

export const FAQ_SCROLL_THRESHOLD = 7;
