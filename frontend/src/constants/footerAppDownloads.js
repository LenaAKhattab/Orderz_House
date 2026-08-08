/** Safe public fallbacks for footer app-download block (used when CMS is unavailable). */
export const FOOTER_APP_DOWNLOAD_FALLBACKS = Object.freeze({
  titleAr: "تحميل التطبيق",
  titleEn: "Download the app",
  googlePlayUrl: "https://play.google.com/store/apps/details?id=com.orderzhouse.app",
  appStoreUrl: "https://apps.apple.com/ae/app/orderzhouse/id6762045683",
  visible: true,
  titleVisible: true,
  googlePlayVisible: true,
  appStoreVisible: true,
});

/**
 * @param {unknown} value
 * @param {string} fallback
 */
export function coalesceFooterAppText(value, fallback) {
  const s = String(value ?? "").trim();
  return s || fallback;
}

/**
 * Missing/null visibility → true (backward compatible). Explicit false stays false.
 * @param {unknown} value
 * @param {boolean} [fallback=true]
 */
export function coalesceFooterVisible(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

/**
 * @param {object|null|undefined} settings
 */
export function mergeFooterAppDownloads(settings) {
  return {
    titleAr: coalesceFooterAppText(settings?.titleAr, FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr),
    titleEn: coalesceFooterAppText(settings?.titleEn, FOOTER_APP_DOWNLOAD_FALLBACKS.titleEn),
    googlePlayUrl: coalesceFooterAppText(
      settings?.googlePlayUrl,
      FOOTER_APP_DOWNLOAD_FALLBACKS.googlePlayUrl,
    ),
    appStoreUrl: coalesceFooterAppText(
      settings?.appStoreUrl,
      FOOTER_APP_DOWNLOAD_FALLBACKS.appStoreUrl,
    ),
    visible: coalesceFooterVisible(settings?.visible, true),
    titleVisible: coalesceFooterVisible(settings?.titleVisible, true),
    googlePlayVisible: coalesceFooterVisible(settings?.googlePlayVisible, true),
    appStoreVisible: coalesceFooterVisible(settings?.appStoreVisible, true),
    updatedAt: settings?.updatedAt ?? null,
  };
}

/**
 * @param {{ titleAr: string, titleEn: string }} settings
 * @param {string} locale
 */
export function pickFooterAppDownloadTitle(settings, locale) {
  const isEn = String(locale || "").toLowerCase().startsWith("en");
  if (isEn) {
    return coalesceFooterAppText(settings?.titleEn, FOOTER_APP_DOWNLOAD_FALLBACKS.titleEn);
  }
  return coalesceFooterAppText(settings?.titleAr, FOOTER_APP_DOWNLOAD_FALLBACKS.titleAr);
}

/**
 * Whether the public app-download column should render (section + at least one store button).
 * @param {ReturnType<typeof mergeFooterAppDownloads>} appDownload
 */
export function shouldRenderFooterAppDownload(appDownload) {
  if (!coalesceFooterVisible(appDownload?.visible, true)) return false;
  const showStore =
    coalesceFooterVisible(appDownload?.appStoreVisible, true) ||
    coalesceFooterVisible(appDownload?.googlePlayVisible, true);
  return showStore;
}
