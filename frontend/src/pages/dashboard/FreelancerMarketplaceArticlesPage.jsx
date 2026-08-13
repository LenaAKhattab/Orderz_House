import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useTranslation } from "../../i18n/LanguageProvider";
import { listPublishedMarketplaceArticlesRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

export default function FreelancerMarketplaceArticlesPage() {
  const { locale, t } = useTranslation();
  const isEn = locale === "en";
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await listPublishedMarketplaceArticlesRequest({});
      setArticles(Array.isArray(res?.data?.articles) ? res.data.articles : []);
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Failed to load articles." : "تعذر تحميل المقالات."),
      );
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={t("dashboard.nav.freelancer.articles")}
        breadcrumbs={[
          { labelKey: "dashboard.breadcrumbs.home", href: "/dashboard/freelancer" },
          { label: t("dashboard.nav.freelancer.articles") },
        ]}
      />
      <DashboardSection>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && articles.length === 0 ? (
          <DashboardEmptyState
            title={isEn ? "No published articles" : "لا توجد مقالات منشورة"}
            description={
              isEn
                ? "Published articles you can apply to will appear here."
                : "ستظهر هنا المقالات المنشورة التي يمكنك التقدّم لها."
            }
          />
        ) : null}
        {!loading && !error && articles.length > 0 ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
            {articles.map((article) => (
              <li key={article.id}>
                <Link
                  to={`/dashboard/freelancer/articles/${article.id}`}
                  style={{
                    display: "block",
                    padding: "14px 16px",
                    border: "1px solid rgba(0,0,0,0.08)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <strong>{article.title}</strong>
                  <div style={{ marginTop: 6, opacity: 0.8, fontSize: "0.92rem" }}>
                    {isEn ? `Level ${article.articleLevel}` : `المستوى ${article.articleLevel}`}
                    {" · "}
                    {isEn ? `${article.requiredWordCount} words` : `${article.requiredWordCount} كلمة`}
                    {" · "}
                    {isEn
                      ? `${article.requiredReferencesCount ?? 0} refs`
                      : `${article.requiredReferencesCount ?? 0} مراجع`}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
