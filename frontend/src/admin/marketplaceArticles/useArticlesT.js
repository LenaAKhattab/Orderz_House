import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/articlesResources";

/** @returns {{ locale: string, t: (key: string, values?: Record<string, string | number>) => string }} */
export function useArticlesT() {
  const { t, locale } = useTranslation();
  return {
    locale,
    t: (key, values) => t(`articles.${key}`, values),
  };
}
