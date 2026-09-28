import { Link } from "react-router-dom";
import { HowItWorksPageShell } from "../components/howItWorks/HowItWorksBlockRenderer";
import usePublicWebsitePage from "../hooks/usePublicWebsitePage";
import { HOW_IT_WORKS_ROUTE_TO_SLUG } from "../constants/howItWorksPages";
import { useTranslation } from "../i18n/LanguageProvider";
import "../styles/howItWorksPage.css";

function HowItWorksUnavailable() {
  const { t, locale, dir } = useTranslation();
  const hiw = "home.hiw";
  return (
    <main className="hiw-page hiw-page--unavailable page-content" lang={locale === "en" ? "en" : "ar"} dir={dir || "rtl"}>
      <div className="hiw-page__inner hiw-page__inner--center">
        <div className="hiw-unavailable" aria-live="polite">
          <div className="hiw-unavailable__code" aria-hidden>
            404
          </div>
          <h1 className="hiw-unavailable__title">{t(`${hiw}.unavailableTitle`)}</h1>
          <p className="hiw-unavailable__text">{t(`${hiw}.unavailableText`)}</p>
          <Link to="/" className="btn btn-primary">
            {t("common.actions.backHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HowItWorksPage({ routeKey }) {
  const { t, locale, dir } = useTranslation();
  const lang = locale === "en" ? "en" : "ar";
  const direction = dir || (locale === "en" ? "ltr" : "rtl");
  const slug = HOW_IT_WORKS_ROUTE_TO_SLUG[routeKey];
  const { page, blocks, loading, unavailable, error } = usePublicWebsitePage(slug);

  if (loading) {
    return (
      <main className="hiw-page page-content" lang={lang} dir={direction}>
        <div className="hiw-page__inner">
          <p className="hiw-page__loading">{t("home.hiw.loading")}</p>
        </div>
      </main>
    );
  }

  if (unavailable) {
    return <HowItWorksUnavailable />;
  }

  if (error) {
    return (
      <main className="hiw-page page-content" lang={lang} dir={direction}>
        <div className="hiw-page__inner hiw-page__inner--center">
          <p className="hiw-page__error">{error === "LOAD_FAILED" ? t("home.hiw.loadFailed") : error}</p>
        </div>
      </main>
    );
  }

  return <HowItWorksPageShell page={page} blocks={blocks} />;
}

export function HowItWorksFreelancerPage() {
  return <HowItWorksPage routeKey="freelancer" />;
}

export function HowItWorksClientPage() {
  return <HowItWorksPage routeKey="client" />;
}
