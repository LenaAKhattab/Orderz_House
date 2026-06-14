import { useEffect, useState } from "react";
import { getPublicSitePageBySlugRequest } from "../services/api";

export default function usePublicSitePage(slug) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setUnavailable(true);
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError("");
      setUnavailable(false);
      try {
        const res = await getPublicSitePageBySlugRequest(slug, { signal: controller.signal });
        if (cancelled) return;
        setPage(res?.data?.page || null);
      } catch (err) {
        if (cancelled || err?.code === "ERR_CANCELED") return;
        if (err?.response?.status === 404) {
          setUnavailable(true);
          setPage(null);
        } else {
          setError("تعذر تحميل الصفحة. حاول مجدداً.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [slug]);

  return { page, loading, unavailable, error };
}
