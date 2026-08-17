import { useEffect, useState } from "react";
import { getPublicFaqRequest } from "../services/api";
import { HOME_FAQ_ITEMS } from "../constants/homeFaqItems";
import { resolveFaqLocaleKey } from "../lib/i18n/resolveFaqLocaleKey";
import { fetchPublicCached, peekPublicCached } from "../lib/publicRequestCache";

const FAQ_KEY = "GET /public/faq";

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

function itemsFromResponse(res) {
  const list = Array.isArray(res?.data?.items) ? res.data.items : [];
  return list.length ? list.map((item, index) => mapPublicFaqItem(item, index)) : fallbackItems();
}

/**
 * Public homepage FAQ (active items, ordered).
 * Desktop + mobile FAQ sections share one public TTL/in-flight cache.
 * @returns {{ items: PublicFaqItem[]; loading: boolean; error: boolean }}
 */
export function usePublicFaq() {
  const cached = peekPublicCached(FAQ_KEY);
  const [items, setItems] = useState(() => (cached !== undefined ? itemsFromResponse(cached) : []));
  const [loading, setLoading] = useState(() => cached === undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (cached === undefined) {
      setLoading(true);
      setError(false);
    }
    (async () => {
      try {
        const res = await fetchPublicCached(FAQ_KEY, () => getPublicFaqRequest());
        if (!cancelled) setItems(itemsFromResponse(res));
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
