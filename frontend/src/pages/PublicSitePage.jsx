import { Link } from "react-router-dom";
import usePublicSitePage from "../hooks/usePublicSitePage";
import RichContent from "../components/content/RichContent";
import { useTranslation } from "../i18n/LanguageProvider";
import { pickLocalizedPlatformCopy } from "../lib/i18n/platformContentLocale";
import { isNewLocale, normalizeSystemContentSource, translateSystemContent } from "../i18n/systemContent.js";
import "../styles/publicSitePage.css";

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

  const contentEn = page?.contentEn || page?.content_en;
  const title = pickLocalizedPlatformCopy(page?.title, page?.titleEn || page?.title_en, locale);
  const content = pickLocalizedPlatformCopy(page?.content, contentEn, locale);
  // English never falls back to the Arabic body: a missing English version is announced instead.
  const missingEnglish = locale === "en" && !content;
  // German / Dutch / Romanian: require a translation-memory hit for the body. Legal/policy slugs must not
  // silently show English/Arabic obligations under a DE/NL/RO chrome — block the body until translated.
  const contentSource = normalizeSystemContentSource(contentEn) || normalizeSystemContentSource(page?.content);
  const missingTranslation =
    isNewLocale(locale) && Boolean(contentSource) && translateSystemContent(contentSource, locale) == null;
  const LEGAL_SLUGS = new Set(["privacy-policy", "terms-conditions", "guarantee"]);
  const blockUntranslatedBody = missingTranslation && LEGAL_SLUGS.has(String(slug || ""));
  const bodyText = isNewLocale(locale) && contentSource ? translateSystemContent(contentSource, locale) : content;
  const displayBody = blockUntranslatedBody ? null : bodyText ?? content;

  return (
    <main className="container page-content public-site-page">
      <section className="card legal-card public-site-page__card">
        <h1 className="public-site-page__title">
          {title || (locale === "en" ? t(`${ps}.englishUnavailable`) : t(`${ps}.fallbackTitle`))}
        </h1>
        <div className="public-site-page__content">
          {missingEnglish ? <p>{t(`${ps}.englishUnavailable`)}</p> : null}
          {missingTranslation ? <p>{t("platformPages.publicSite.translationUnavailable")}</p> : null}
          {displayBody ? <RichContent text={displayBody} /> : null}
        </div>
      </section>
    </main>
  );
}
