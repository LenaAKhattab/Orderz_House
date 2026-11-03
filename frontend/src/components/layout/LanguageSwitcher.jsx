import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import { LOCALE_META } from "../../i18n/localePreference";

/**
 * Language selector: every selectable locale by its own name (endonym — never a flag, language ≠ country).
 * Accessible menu (button + role="menu" with menuitemradio items): Escape / outside click close, arrow keys,
 * Home / End, focus returns to the trigger. Positioned with logical properties, so it works in RTL and LTR.
 */
export default function LanguageSwitcher({ className = "" }) {
  const { locale, selectableLocales, switchLocale, isLanguageSwitching, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();
  const locales = Array.isArray(selectableLocales) && selectableLocales.length ? selectableLocales : ["ar", "en"];
  const currentName = LOCALE_META[locale]?.nativeName || locale;

  const close = useCallback((focusTrigger = false) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) close(false);
    };
    document.addEventListener("pointerdown", onDown);
    const idx = Math.max(0, locales.indexOf(locale));
    window.requestAnimationFrame(() => itemRefs.current[idx]?.focus());
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, close, locale, locales]);

  const choose = (next) => {
    close(true);
    if (next !== locale) void switchLocale(next);
  };

  const onMenuKeyDown = (e) => {
    const items = itemRefs.current.filter(Boolean);
    const i = items.indexOf(document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div ref={rootRef} className={["relative inline-flex shrink-0", className].filter(Boolean).join(" ")}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full border border-[rgba(56,82,180,0.2)] bg-white/90 px-3 py-1.5 text-[0.82rem] font-bold text-[#2f3b65] transition-colors hover:border-[rgba(56,82,180,0.35)] hover:bg-[rgba(56,82,180,0.04)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(56,82,180,0.12)] sm:text-[0.85rem]"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("common.language.changeAria", { language: currentName })}
        aria-busy={isLanguageSwitching || undefined}
        disabled={isLanguageSwitching}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Globe size={15} aria-hidden />
        <span lang={locale}>{currentName}</span>
        <ChevronDown size={14} aria-hidden className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={t("common.language.menuLabel")}
          className="absolute top-[calc(100%+6px)] z-[1000] min-w-[11rem] rounded-xl border border-[rgba(56,82,180,0.18)] bg-white p-1 shadow-[0_12px_32px_rgba(20,30,70,0.16)]"
          style={{ insetInlineEnd: 0 }}
          onKeyDown={onMenuKeyDown}
        >
          {locales.map((code, i) => {
            const active = code === locale;
            const meta = LOCALE_META[code];
            return (
              <li key={code} role="none">
                <button
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  lang={code}
                  dir={meta?.dir}
                  className={[
                    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-[0.9rem] text-[#24305a] hover:bg-[rgba(56,82,180,0.07)] focus:bg-[rgba(56,82,180,0.1)] focus:outline-none",
                    active ? "font-bold" : "font-medium",
                  ].join(" ")}
                  onClick={() => choose(code)}
                >
                  <span>{meta?.nativeName || code}</span>
                  {active ? <Check size={15} aria-hidden className="text-[#3852b4]" /> : <span aria-hidden className="inline-block w-[15px]" />}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
