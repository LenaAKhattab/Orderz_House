import { useEffect, useState } from "react";
import { getPublicWebsitePageRequest } from "../services/api";
import { HOW_IT_WORKS_PAGES } from "../constants/howItWorksPages";

/**
 * Loads visible How it works nav links (active pages only).
 */
export default function useHowItWorksNav() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          HOW_IT_WORKS_PAGES.map(async (page) => {
            try {
              const res = await getPublicWebsitePageRequest(page.slug, { signal: undefined });
              if (res?.data?.page) {
                return {
                  to: page.path,
                  labelKey: page.labelKey,
                };
              }
            } catch {
              // Hidden or unavailable — omit from nav.
            }
            return null;
          }),
        );
        if (!cancelled) {
          setItems(results.filter(Boolean));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading, showNav: items.length > 0 };
}
