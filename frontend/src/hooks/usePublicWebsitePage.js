import { useEffect, useState } from "react";
import { getPublicWebsitePageRequest } from "../services/api";

export default function usePublicWebsitePage(slug) {
  const [page, setPage] = useState(null);
  const [blocks, setBlocks] = useState([]);
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
        const res = await getPublicWebsitePageRequest(slug, { signal: controller.signal });
        if (cancelled) return;
        setPage(res?.data?.page || null);
        setBlocks(Array.isArray(res?.data?.blocks) ? res.data.blocks : []);
      } catch (err) {
        if (cancelled || err?.code === "ERR_CANCELED") return;
        if (err?.response?.status === 404) {
          setUnavailable(true);
          setPage(null);
          setBlocks([]);
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

  return { page, blocks, loading, unavailable, error };
}
