import { useEffect, useState } from "react";
import { getPublicFaqRequest } from "../services/api";
import { HOME_FAQ_ITEMS } from "../constants/homeFaqItems";
import { resolveFaqLocaleKey } from "../lib/i18n/resolveFaqLocaleKey";

/** @typedef {{ id: number | string, question: string, answer: string, localeKey?: string | null, question_en?: string, answer_en?: string }} PublicFaqItem */

function mapPublicFaqItem(item, index) {
  return {
    id: item.id,
    question: item.question,
    answer: item.answer,
    question_en: item.question_en,
    answer_en: item.answer_en,
    localeKey: resolveFaqLocaleKey(item, index),
  };
}

function fallbackItems() {
  return HOME_FAQ_ITEMS.map((item, index) =>
    mapPublicFaqItem(
      {
        id: item.id,
        question: item.q,
        answer: item.a,
        localeKey: item.id,
      },
      index,
    ),
  );
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
            setItems(list.map((item, index) => mapPublicFaqItem(item, index)));
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
