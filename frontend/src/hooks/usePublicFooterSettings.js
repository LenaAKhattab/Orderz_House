import { useEffect, useState } from "react";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  mergeFooterSettings,
} from "../constants/footerSettings";
import { getPublicFooterSettingsRequest } from "../services/publicChromeApi";
import { fetchPublicCached, peekPublicCached } from "../lib/publicRequestCache";

const FOOTER_SETTINGS_KEY = "GET /public/footer-settings";

function fromResponse(res) {
  return mergeFooterSettings(res?.data?.settings || null);
}

/**
 * Public footer settings (contact + working hours + app downloads).
 */
export function usePublicFooterSettings() {
  const cached = peekPublicCached(FOOTER_SETTINGS_KEY);
  const [settings, setSettings] = useState(() =>
    cached !== undefined ? fromResponse(cached) : mergeFooterSettings(null),
  );
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
        const res = await fetchPublicCached(FOOTER_SETTINGS_KEY, () => getPublicFooterSettingsRequest());
        if (!cancelled) setSettings(fromResponse(res));
      } catch {
        if (!cancelled && cached === undefined) {
          setError(true);
          setSettings(mergeFooterSettings(null));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    settings,
    contact: settings.contact,
    workingHours: settings.workingHours,
    contactCenter: settings.contactCenter,
    appDownload: settings.appDownload,
    loading,
    error,
    /** Convenience alias matching previous hook shape */
    fallbacks: FOOTER_APP_DOWNLOAD_FALLBACKS,
  };
}
