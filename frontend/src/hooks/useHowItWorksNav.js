import { useEffect, useState } from "react";
import { probePublicWebsitePageForNav } from "../services/publicChromeApi";
import { HOW_IT_WORKS_PAGES } from "../constants/howItWorksPages";
import { fetchPublicCached, peekPublicCached } from "../lib/publicRequestCache";

function defaultItems() {
  return HOW_IT_WORKS_PAGES.map((page) => ({
    to: page.path,
    labelKey: page.labelKey,
  }));
}

function cacheKey(slug) {
  return `GET /public/pages/${slug}`;
}

function itemsFromCacheIfComplete() {
  const items = [];
  for (const page of HOW_IT_WORKS_PAGES) {
    const cached = peekPublicCached(cacheKey(page.slug));
    if (cached === undefined) return null;
    if (cached?.data?.page) {
      items.push({ to: page.path, labelKey: page.labelKey });
    }
  }
  return items;
}

async function probeHowItWorksPages() {
  const results = await Promise.all(
    HOW_IT_WORKS_PAGES.map(async (page) => {
      const res = await fetchPublicCached(cacheKey(page.slug), () =>
        probePublicWebsitePageForNav(page.slug),
      );
      if (res?.data?.page) {
        return { to: page.path, labelKey: page.labelKey };
      }
      return null;
    }),
  );
  return results.filter(Boolean);
}

/**
 * How-it-works nav links. Probes run only when `active` (dropdown or mobile drawer),
 * not on every public route including login. Results use the public TTL cache.
 */
export default function useHowItWorksNav({ active = false } = {}) {
  const cachedItems = itemsFromCacheIfComplete();
  const [items, setItems] = useState(() => cachedItems ?? defaultItems());
  const [loading, setLoading] = useState(() => cachedItems == null);

  useEffect(() => {
    if (active === true) {
      let cancelled = false;
      const complete = itemsFromCacheIfComplete();
      if (complete) {
        setItems(complete);
        setLoading(false);
        return undefined;
      }

      setLoading(true);
      void probeHowItWorksPages()
        .then((next) => {
          if (!cancelled) setItems(next);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [active]);

  return { items, loading, showNav: items.length > 0 };
}
