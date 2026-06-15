import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocaleDirection } from "../../i18n/resources";
import { resolveLocaleSkeletonVariant } from "../../i18n/resolveLocaleSkeletonVariant";
import LocaleTransitionSkeleton from "../skeletons/LocaleTransitionSkeleton";
import "../skeletons/locale-transition.css";

const LOCALE_SWITCH_SAFETY_MS = 3000;

/**
 * Full-viewport skeleton overlay while EN ⇄ AR locale is switching.
 * Mounted inside BrowserRouter (see App.jsx).
 */
export default function LocaleTransitionOverlay() {
  const { isLanguageSwitching, localeSwitchingTo, t } = useTranslation();
  const { pathname } = useLocation();

  const targetLocale = localeSwitchingTo;
  const active = isLanguageSwitching && Boolean(targetLocale);
  const dir = targetLocale ? getLocaleDirection(targetLocale) : "rtl";
  const variant = resolveLocaleSkeletonVariant(pathname);

  useEffect(() => {
    const root = document.documentElement;
    if (active) {
      root.classList.add("oh-locale-switching");
      return () => root.classList.remove("oh-locale-switching");
    }
    root.classList.remove("oh-locale-switching");
    return undefined;
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = window.setTimeout(() => {
      // Safety valve — LanguageProvider clears switching; this avoids a stuck overlay if something throws.
      document.documentElement.classList.remove("oh-locale-switching");
    }, LOCALE_SWITCH_SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="locale-transition-overlay"
      dir={dir}
      lang={targetLocale}
      data-locale={targetLocale}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={t("common.language.switching")}
    >
      <LocaleTransitionSkeleton variant={variant} />
    </div>,
    document.body,
  );
}
