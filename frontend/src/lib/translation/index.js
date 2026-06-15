import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "../../i18n/LanguageProvider";
import { translateText } from "./translationClient";

/**
 * Translate dynamic Arabic CMS/DB copy when locale is English.
 * Returns source text for Arabic or while loading.
 * @param {string | null | undefined} sourceText
 */
export function useDynamicTranslation(sourceText) {
  const { locale } = useTranslation();
  const [translated, setTranslated] = useState(() =>
    locale === "en" ? null : String(sourceText || ""),
  );

  useEffect(() => {
    const raw = String(sourceText || "").trim();
    if (!raw || locale === "ar") {
      setTranslated(raw);
      return undefined;
    }

    let cancelled = false;
    setTranslated(null);
    translateText(raw, { sourceLang: "ar", targetLang: "en" }).then((result) => {
      if (!cancelled) setTranslated(result);
    });

    return () => {
      cancelled = true;
    };
  }, [sourceText, locale]);

  if (locale === "ar") return String(sourceText || "");
  if (translated === null) return String(sourceText || "");
  return translated;
}

/**
 * Imperative helper — prefer useTranslation().t for static keys.
 */
export { translateText, translateBatch, clearTranslationCache } from "./translationClient";
