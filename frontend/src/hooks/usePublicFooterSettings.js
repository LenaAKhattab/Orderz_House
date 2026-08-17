import { useEffect, useState } from "react";
import {
  FOOTER_APP_DOWNLOAD_FALLBACKS,
  mergeFooterSettings,
} from "../constants/footerSettings";
import { getPublicFooterSettingsRequest } from "../services/publicChromeApi";

/**
 * Public footer settings (contact + working hours + app downloads).
 */
export function usePublicFooterSettings() {
  const [settings, setSettings] = useState(() => mergeFooterSettings(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const res = await getPublicFooterSettingsRequest();
        if (!cancelled) setSettings(mergeFooterSettings(res?.data?.settings || null));
      } catch {
        if (!cancelled) {
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
