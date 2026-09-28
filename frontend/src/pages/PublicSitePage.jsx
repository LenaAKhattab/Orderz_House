import { Link } from "react-router-dom";
import usePublicSitePage from "../hooks/usePublicSitePage";
import { useTranslation } from "../i18n/LanguageProvider";
import { pickLocalizedPlatformCopy } from "../lib/i18n/platformContentLocale";
import "../styles/publicSitePage.css";

function renderContentBlock(block, index) {
  const trimmed = block.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("## ")) {
    return <h2 key={index}>{trimmed.slice(3).trim()}</h2>;
  }

  return <p key={index}>{trimmed}</p>;
}

/**
 * @param {{ slug: string }} props
 */
export default function PublicSitePage({ slug }) {
  const { t, locale } = useTranslation();
  const ps = "home.publicSite";
  const { page, loading, unavailable, error } = usePublicSitePage(slug);

  if (loading) {
    return (
      <main className="container public-site-page__state" aria-busy="true">
        <p>{t(`${ps}.loading`)}</p>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="container public-site-page__state">
        <h1>{t(`${ps}.unavailableTitle`)}</h1>
        <p>{t(`${ps}.unavailableText`)}</p>
        <Link to="/" className="btn btn-primary">
          {t("common.actions.backHome")}
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container public-site-page__state">
        <h1>{t(`${ps}.loadFailedTitle`)}</h1>
        <p>{error === "LOAD_FAILED" ? t(`${ps}.loadFailedText`) : error}</p>
        <Link to="/" className="btn btn-primary">
          {t("common.actions.backHome")}
        </Link>
      </main>
    );
  }

  const title = pickLocalizedPlatformCopy(page?.title, page?.titleEn || page?.title_en, locale);
  const content = pickLocalizedPlatformCopy(page?.content, page?.contentEn || page?.content_en, locale);
  const blocks = content.split(/\n\n+/);
  const missingEnglish = locale === "en" && !content;

  return (
    <main className="container page-content public-site-page">
      <section className="card legal-card public-site-page__card">
        <h1 className="public-site-page__title">
          {title || (locale === "en" ? t(`${ps}.englishUnavailable`) : t(`${ps}.fallbackTitle`))}
        </h1>
        <div className="public-site-page__content">
          {missingEnglish ? <p>{t(`${ps}.englishUnavailable`)}</p> : null}
          {blocks.map((block, index) => renderContentBlock(block, index))}
        </div>
      </section>
    </main>
  );
}
