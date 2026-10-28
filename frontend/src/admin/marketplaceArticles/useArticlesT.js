import { useCallback } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/articlesResources";

/**
 * Namespaced translator for articles.*. The returned `t` is stable across renders (it only changes with the
 * base translator / locale) so it is safe in effect and useCallback dependencies — an unstable `t` re-ran
 * data-loading effects on every render (request loop on the freelancer article page).
 * @returns {{ locale: string, t: (key: string, values?: Record<string, string | number>) => string }}
 */
export function useArticlesT() {
  const { t: baseT, locale } = useTranslation();
  const t = useCallback((key, values) => baseT(`articles.${key}`, values), [baseT]);
  return { locale, t };
}
