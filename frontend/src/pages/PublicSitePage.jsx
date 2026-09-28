import { Link } from "react-router-dom";
import usePublicSitePage from "../hooks/usePublicSitePage";
import { useTranslation } from "../i18n/LanguageProvider";
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
  const { t } = useTranslation();
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
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">
          {t("common.actions.backHome")}
        </Link>
      </main>
    );
  }

  const blocks = (page?.content || "").split(/\n\n+/);

  return (
    <main className="container page-content public-site-page">
      <section className="card legal-card public-site-page__card">
        <h1 className="public-site-page__title">{page?.title || t(`${ps}.fallbackTitle`)}</h1>
        <div className="public-site-page__content">
          {blocks.map((block, index) => renderContentBlock(block, index))}
        </div>
      </section>
    </main>
  );
}
