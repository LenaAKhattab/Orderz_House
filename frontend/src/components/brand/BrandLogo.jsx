import { useTranslation } from "../../i18n/LanguageProvider";
import { getBrandLogoSrc } from "../../lib/brand/brandLogoAssets";
import "./brand-logo.css";

const NAVBAR_IMG_CLASS =
  "block h-11 w-auto object-contain transition-all duration-700 [transition-timing-function:cubic-bezier(0.33,1,0.68,1)] lg:h-12";

/**
 * Localized Orderz House brand logo for public placements.
 *
 * - `hero` / `default` / `footer`: full wordmark (EN transparent asset vs AR fullLogp).
 * - `navbar`: compact icon only (`/logo.png`) in both locales — see brandLogoAssets.
 *
 * @param {{
 *   variant?: "navbar" | "hero" | "footer" | "default" | "auth";
 *   className?: string;
 *   imgClassName?: string;
 *   decorative?: boolean;
 *   loading?: "eager" | "lazy";
 *   fetchPriority?: "high" | "low" | "auto";
 * }} props
 */
export default function BrandLogo({
  variant = "default",
  className,
  imgClassName,
  decorative = false,
  loading,
  fetchPriority,
}) {
  const { t, locale } = useTranslation();
  const src = getBrandLogoSrc(locale, variant);
  const alt = decorative ? "" : t("home.hero.logoAlt");
  const isEnglishFull = locale === "en" && variant !== "navbar";

  if (variant === "hero") {
    const isEn = locale === "en";
    const heroLocaleClass = isEn ? "brand-logo--hero-en" : "brand-logo--hero-ar";
    const heroImgLocaleClass = isEn ? "brand-logo__img--hero-en" : "brand-logo__img--hero-ar";

    return (
      <div
        className={[
          "brand-logo brand-logo--hero home-hero__logo-frame",
          heroLocaleClass,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <img
          src={src}
          alt={alt}
          loading={loading ?? "eager"}
          fetchPriority={fetchPriority ?? "high"}
          decoding="async"
          className={[
            "brand-logo__img brand-logo__img--hero home-hero__logo",
            heroImgLocaleClass,
            imgClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
    );
  }

  if (variant === "navbar") {
    return (
      <img
        src={src}
        alt={alt}
        decoding="async"
        className={imgClassName || NAVBAR_IMG_CLASS}
      />
    );
  }

  if (variant === "auth") {
    const authImgClass = [
      "brand-logo__img max-h-full max-w-full object-contain",
      isEnglishFull ? "brand-logo__img--en brand-logo__img--auth-en" : "",
      imgClassName,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={["brand-logo brand-logo--auth", className].filter(Boolean).join(" ")}>
        <img src={src} alt={alt} decoding="async" className={authImgClass} loading={loading} />
      </div>
    );
  }

  // footer / default — full wordmark in a contained frame
  const imgClass = [
    "brand-logo__img max-h-full max-w-full object-contain",
    isEnglishFull ? "brand-logo__img--en" : "",
    imgClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={[
        "brand-logo",
        variant === "footer" ? "brand-logo--footer" : "brand-logo--default",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <img src={src} alt={alt} decoding="async" className={imgClass} loading={loading} />
    </div>
  );
}
