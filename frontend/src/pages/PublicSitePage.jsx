import { Link } from "react-router-dom";
import usePublicSitePage from "../hooks/usePublicSitePage";
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
  const { page, loading, unavailable, error } = usePublicSitePage(slug);

  if (loading) {
    return (
      <main className="container public-site-page__state" aria-busy="true">
        <p>جاري تحميل الصفحة…</p>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="container public-site-page__state">
        <h1>الصفحة غير متاحة</h1>
        <p>قد تكون هذه الصفحة غير منشورة أو الرابط غير صحيح.</p>
        <Link to="/" className="btn btn-primary">
          العودة للرئيسية
        </Link>
      </main>
    );
  }

  if (error) {
    return (
      <main className="container public-site-page__state">
        <h1>تعذر تحميل الصفحة</h1>
        <p>{error}</p>
        <Link to="/" className="btn btn-primary">
          العودة للرئيسية
        </Link>
      </main>
    );
  }

  const blocks = (page?.content || "").split(/\n\n+/);

  return (
    <main className="container page-content public-site-page">
      <section className="card legal-card public-site-page__card">
        <h1 className="public-site-page__title">{page?.title}</h1>
        <div className="public-site-page__content">
          {blocks.map((block, index) => renderContentBlock(block, index))}
        </div>
      </section>
    </main>
  );
}
