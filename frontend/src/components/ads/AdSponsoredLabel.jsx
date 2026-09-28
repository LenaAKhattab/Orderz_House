import { useTranslation } from "../../i18n/LanguageProvider";

export default function AdSponsoredLabel({ className = "" }) {
  const { t } = useTranslation();
  return (
    <span className={`oh-ad-sponsored pointer-events-none ${className}`.trim()} aria-hidden="true">
      {t("home.promoAds.sponsored")}
    </span>
  );
}
