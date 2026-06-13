import { Link } from "react-router-dom";
import { HowItWorksPageShell } from "../components/howItWorks/HowItWorksBlockRenderer";
import usePublicWebsitePage from "../hooks/usePublicWebsitePage";
import { HOW_IT_WORKS_ROUTE_TO_SLUG } from "../constants/howItWorksPages";
import "../styles/howItWorksPage.css";

function HowItWorksUnavailable() {
  return (
    <main className="hiw-page hiw-page--unavailable page-content" lang="ar" dir="rtl">
      <div className="hiw-page__inner hiw-page__inner--center">
        <div className="hiw-unavailable" aria-live="polite">
          <div className="hiw-unavailable__code" aria-hidden>
            404
          </div>
          <h1 className="hiw-unavailable__title">الصفحة غير متاحة</h1>
          <p className="hiw-unavailable__text">
            يبدو أن هذه الصفحة مخفية حالياً أو أن الرابط غير صحيح.
          </p>
          <Link to="/" className="btn btn-primary">
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function HowItWorksPage({ routeKey }) {
  const slug = HOW_IT_WORKS_ROUTE_TO_SLUG[routeKey];
  const { page, blocks, loading, unavailable, error } = usePublicWebsitePage(slug);

  if (loading) {
    return (
      <main className="hiw-page page-content" lang="ar" dir="rtl">
        <div className="hiw-page__inner">
          <p className="hiw-page__loading">جاري التحميل…</p>
        </div>
      </main>
    );
  }

  if (unavailable) {
    return <HowItWorksUnavailable />;
  }

  if (error) {
    return (
      <main className="hiw-page page-content" lang="ar" dir="rtl">
        <div className="hiw-page__inner hiw-page__inner--center">
          <p className="hiw-page__error">{error}</p>
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
