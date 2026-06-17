import { useTranslation } from "../../../i18n/LanguageProvider";



export default function PlansMobileHero() {

  const { t } = useTranslation();



  return (

    <header className="pm-hero">

      <div className="pm-hero__top">

        <p className="pm-hero__label">{t("plans.mobileLabel")}</p>

        <h1 className="pm-hero__title">{t("plans.hero.title")}</h1>

      </div>

      <p className="pm-hero__lede">{t("plans.hero.subtitle")}</p>

    </header>

  );

}

