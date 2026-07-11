import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  getLocaleDirection,
  isSupportedLocale,
  resources,
} from "./resources";
import { createTranslator } from "./resolveTranslation";
import { waitForPaint } from "./waitForPaint";

const LOCALE_SWITCH_SAFETY_MS = 3000;

/** @type {import('react').Context<null | {
 *   locale: string;
 *   dir: 'rtl' | 'ltr';
 *   isRtl: boolean;
 *   isLanguageSwitching: boolean;
 *   localeSwitchingTo: string | null;
 *   setLocale: (next: string) => void;
 *   switchLocale: (next: string) => Promise<void>;
 *   t: (key: string, values?: Record<string, string | number>) => string;
 * }>} */
const LanguageContext = createContext(null);

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isSupportedLocale(stored)) return stored;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

function applyDocumentLocale(locale) {
  const dir = getLocaleDirection(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  document.documentElement.setAttribute("data-locale", locale);
}

function persistLocale(locale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_LOCALE;
    return readStoredLocale();
  });
  const [localeSwitchingTo, setLocaleSwitchingTo] = useState(null);
  const localeRef = useRef(locale);
  const switchGenRef = useRef(0);

  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    const resolved = isSupportedLocale(next) ? next : DEFAULT_LOCALE;
    setLocaleState(resolved);
    persistLocale(resolved);
  }, []);

  const switchLocale = useCallback(async (next) => {
    const resolved = isSupportedLocale(next) ? next : DEFAULT_LOCALE;
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

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const dir = getLocaleDirection(locale);
  const isRtl = dir === "rtl";
  const isLanguageSwitching = localeSwitchingTo !== null;

  const t = useMemo(() => createTranslator(locale, resources, DEFAULT_LOCALE), [locale]);

  const value = useMemo(
    () => ({
      locale,
      dir,
      isRtl,
      isLanguageSwitching,
      localeSwitchingTo,
      setLocale,
      switchLocale,
      t,
    }),
    [locale, dir, isRtl, isLanguageSwitching, localeSwitchingTo, setLocale, switchLocale, t],
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
