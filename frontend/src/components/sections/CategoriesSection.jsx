import HomeFeaturedServicesGrid from "./HomeFeaturedServicesGrid";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./categories-section.css";

const CategoriesSection = () => {
  const { t, dir } = useTranslation();

  return (
    <section
      className="home-categories-section relative box-border my-8 w-full px-3 py-6 sm:my-10 sm:px-5 sm:py-8 md:my-12 md:px-8 md:py-10 lg:my-14 lg:px-9 lg:py-12 max-[560px]:px-2.5"
      aria-labelledby="home-categories-heading"
    >
      <div className="home-categories-stack relative z-10 mx-auto w-full" dir={dir}>
        <header className="home-categories-intro home-categories-intro--centered">
          <h2
            id="home-categories-heading"
            className="home-categories-intro__title m-0 text-center text-[clamp(1.45rem,2.8vw,2.15rem)] font-extrabold leading-tight tracking-tight"
          >
            <span className="text-gray-900">{t("home.categories.title")}</span>{" "}
            <span className="text-[#2f3b65]">{t("home.categories.titleAccent")}</span>
          </h2>
          <p className="home-categories-intro__subtitle m-0">
            {t("home.categories.subtitle")}
          </p>
        </header>

        <div className="home-categories-panel">
          <HomeFeaturedServicesGrid iconSize={54} />
        </div>
      </div>
    </section>
  );
};

export default CategoriesSection;
