import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DEFAULT_LOCALE,
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  getLocaleDirection,
  resources,
} from "./resources";
import { getSelectableLocales, isI18nPreviewEnabled, isSelectableLocale, readStoredLocale } from "./localePreference";
import { getMissingTranslationLog } from "./resolveTranslation";
import { getMissingSystemContentLog } from "./systemContent";

// Internal QA preview only: expose runtime fallback logs to the untranslated-string detector (read-only).
if (typeof window !== "undefined" && isI18nPreviewEnabled()) {
  window.__OH_I18N__ = {
    missingKeys: () => getMissingTranslationLog(),
    missingSystemContent: () => getMissingSystemContentLog(),
  };
}
import { ensureLocaleLoaded, isLocaleBundleLoaded } from "./loadLocaleBundle";
import { createTranslator } from "./resolveTranslation";
import { waitForPaint } from "./waitForPaint";
import { setActiveLocale } from "./activeLocale";

const LOCALE_SWITCH_SAFETY_MS = 3000;

/** @type {import('react').Context<null | {
 *   locale: string;
 *   selectableLocales: string[];
 *   dir: 'rtl' | 'ltr';
 *   isRtl: boolean;
 *   isLanguageSwitching: boolean;
 *   localeSwitchingTo: string | null;
 *   setLocale: (next: string) => void;
 *   switchLocale: (next: string) => Promise<void>;
 *   t: (key: string, values?: Record<string, string | number>) => string;
 * }>} */
const LanguageContext = createContext(null);

function applyDocumentLocale(locale) {
  const dir = getLocaleDirection(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  document.documentElement.setAttribute("data-locale", locale);
}

function persistLocale(locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    localStorage.setItem(LEGACY_LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    const stored = readStoredLocale();
    // main.jsx loads a lazily-bundled locale before the first render; never render a locale that is not loaded.
    return isLocaleBundleLoaded(stored) ? stored : DEFAULT_LOCALE;
  });
  const [localeSwitchingTo, setLocaleSwitchingTo] = useState(null);
  const localeRef = useRef(locale);
  const switchGenRef = useRef(0);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const switchLocale = useCallback(async (next) => {
    const resolved = isSelectableLocale(next) ? next : DEFAULT_LOCALE;
    const previous = localeRef.current;
    if (resolved === previous) return;

    const gen = ++switchGenRef.current;
    setLocaleSwitchingTo(resolved);

    let safetyTimer;
    try {
      safetyTimer = window.setTimeout(() => {
        if (switchGenRef.current === gen) {
          setLocaleSwitchingTo(null);
        }
      }, LOCALE_SWITCH_SAFETY_MS);

      // Load the target bundle first: the UI switches in one step, never through a half-translated state.
      await ensureLocaleLoaded(resolved);
      if (switchGenRef.current !== gen) return;

      applyDocumentLocale(resolved);
      persistLocale(resolved);

      flushSync(() => {
        setLocaleState(resolved);
      });

      await waitForPaint();
    } catch (err) {
      console.error("[i18n] locale switch failed:", err);
      applyDocumentLocale(previous);
      persistLocale(previous);
      flushSync(() => {
        setLocaleState(previous);
      });
    } finally {
      if (safetyTimer != null) window.clearTimeout(safetyTimer);
      if (switchGenRef.current === gen) {
        setLocaleSwitchingTo(null);
      }
    }
  }, []);

  const setLocale = useCallback((next) => {
    void switchLocale(next);
  }, [switchLocale]);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const dir = getLocaleDirection(locale);
  const isRtl = dir === "rtl";
  const isLanguageSwitching = localeSwitchingTo !== null;

  const t = useMemo(() => {
    // Plain helpers (constants / utils) read the UI locale through activeLocale.js.
    setActiveLocale(locale);
    return createTranslator(locale, resources, DEFAULT_LOCALE);
  }, [locale]);

  const selectableLocales = useMemo(() => getSelectableLocales(), []);

  const value = useMemo(
    () => ({
      locale,
      selectableLocales,
      dir,
      isRtl,
      isLanguageSwitching,
      localeSwitchingTo,
      setLocale,
      switchLocale,
      t,
    }),
    [locale, selectableLocales, dir, isRtl, isLanguageSwitching, localeSwitchingTo, setLocale, switchLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useTranslation must be used within LanguageProvider");
  }
  return ctx;
}

/** Safe hook for components that may render outside provider during tests. */
export function useTranslationOptional() {
  return useContext(LanguageContext);
}

export { getTranslation } from "../lib/translation/getTranslation";
