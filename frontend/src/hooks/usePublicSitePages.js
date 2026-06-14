import { useEffect, useState } from "react";
import { getPublicSitePagesRequest } from "../services/api";
import { getPublicSitePagePath } from "../constants/publicSitePages";

/**
 * Published site pages for footer / mobile nav.
 * On failure, returns empty list (callers hide the section).
 */
export function usePublicSitePages() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await getPublicSitePagesRequest({ signal: controller.signal });
        const list = Array.isArray(res?.data?.pages) ? res.data.pages : [];
        if (!cancelled) {
          setPages(
            list.map((page) => ({
              id: page.id,
              slug: page.slug,
              title: page.title,
              menuLabel: page.menuLabel,
              sortOrder: page.sortOrder,
              showInMobileMenu: page.showInMobileMenu,
              showInFooter: page.showInFooter,
              path: getPublicSitePagePath(page.slug),
            })),
          );
        }
      } catch (err) {
        if (cancelled || err?.code === "ERR_CANCELED") return;
        if (!cancelled) {
          setError(true);
          setPages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const mobileMenuPages = pages.filter((p) => p.showInMobileMenu !== false);
  const footerPages = pages.filter((p) => p.showInFooter !== false);

  return { pages, mobileMenuPages, footerPages, loading, error };
}
