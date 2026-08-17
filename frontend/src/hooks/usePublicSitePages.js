import { useEffect, useState } from "react";
import { getPublicSitePagesRequest } from "../services/publicChromeApi";
import { getPublicSitePagePath, isRemovedPublicSitePageSlug } from "../constants/publicSitePages";
import { fetchPublicCached, peekPublicCached } from "../lib/publicRequestCache";

const SITE_PAGES_KEY = "GET /public/site-pages";

function mapPages(res) {
  const list = Array.isArray(res?.data?.pages) ? res.data.pages : [];
  return list
    .filter((page) => page?.slug && !isRemovedPublicSitePageSlug(page.slug))
    .map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      menuLabel: page.menuLabel,
      sortOrder: page.sortOrder,
      showInMobileMenu: page.showInMobileMenu,
      showInFooter: page.showInFooter,
      path: getPublicSitePagePath(page.slug),
    }));
}

/**
 * Published site pages for footer / mobile nav / desktop More.
 * On failure, returns empty list (callers hide the section).
 * Navbar + Footer share one public TTL/in-flight cache — no auth data.
 */
export function usePublicSitePages() {
  const cached = peekPublicCached(SITE_PAGES_KEY);
  const [pages, setPages] = useState(() => (cached !== undefined ? mapPages(cached) : []));
  const [loading, setLoading] = useState(() => cached === undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (cached === undefined) {
        setLoading(true);
        setError(false);
      }
      try {
        const res = await fetchPublicCached(SITE_PAGES_KEY, () => getPublicSitePagesRequest());
        if (!cancelled) {
          setPages(mapPages(res));
          setError(false);
        }
      } catch {
        if (!cancelled && cached === undefined) {
          setError(true);
          setPages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const mobileMenuPages = pages.filter((p) => p.showInMobileMenu !== false);
  const footerPages = pages.filter((p) => p.showInFooter !== false);

  return { pages, mobileMenuPages, footerPages, loading, error };
}
