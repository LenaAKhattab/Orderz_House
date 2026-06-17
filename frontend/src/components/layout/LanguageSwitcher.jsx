import { useTranslation } from "../../i18n/LanguageProvider";



export default function LanguageSwitcher({ className = "" }) {

  const { locale, switchLocale, isLanguageSwitching, t } = useTranslation();

  const targetLocale = locale === "ar" ? "en" : "ar";

  const label = locale === "ar" ? "English" : "العربية";



  return (

    <button

      type="button"

      className={[

        "inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-full border border-[rgba(56,82,180,0.2)] bg-white/90 px-3 py-1.5 text-[0.82rem] font-bold text-[#2f3b65] transition-colors hover:border-[rgba(56,82,180,0.35)] hover:bg-[rgba(56,82,180,0.04)] focus:outline-none focus:shadow-[0_0_0_3px_rgba(56,82,180,0.12)] sm:px-3.5 sm:text-[0.85rem]",

        className,

      ]

        .filter(Boolean)

        .join(" ")}

      onClick={() => void switchLocale(targetLocale)}

      disabled={isLanguageSwitching}

      aria-busy={isLanguageSwitching || undefined}

      aria-label={locale === "ar" ? t("common.language.switchAria") : t("common.language.switchToArAria")}

      lang={targetLocale}

    >

      {label}

    </button>

  );

}


