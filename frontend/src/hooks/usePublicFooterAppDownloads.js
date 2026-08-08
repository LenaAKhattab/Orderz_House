import { useEffect, useState } from "react";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  mergeFooterAppDownloads,
} from "../constants/footerAppDownloads";
import { getPublicFooterAppDownloadsRequest } from "../services/api";

/**
 * Public footer app-download settings (title + store URLs).
 * Falls back to production defaults if the CMS request fails.
 */
export function usePublicFooterAppDownloads() {
  const [settings, setSettings] = useState(() => mergeFooterAppDownloads(FOOTER_APP_DOWNLOAD_FALLBACKS));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await getPublicFooterAppDownloadsRequest();
        const next = mergeFooterAppDownloads(res?.data?.settings || null);
        if (!cancelled) setSettings(next);
      } catch {
        if (!cancelled) {
          setError(true);
          setSettings(mergeFooterAppDownloads(FOOTER_APP_DOWNLOAD_FALLBACKS));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, loading, error };
}
