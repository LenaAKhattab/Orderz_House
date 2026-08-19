import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useTranslation } from "../../i18n/LanguageProvider";
import { listPublishedMarketplaceArticlesRequest, getFreelancerBildazoAuthorLinkRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import { formatArticleBidCollectionLabel } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import FreelancerBildazoAuthorGateCard from "../../components/freelancer/FreelancerBildazoAuthorGateCard";

export default function FreelancerMarketplaceArticlesPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const [articles, setArticles] = useState([]);
  const [bildazoLink, setBildazoLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [res, linkRes] = await Promise.all([
        listPublishedMarketplaceArticlesRequest({}),
        getFreelancerBildazoAuthorLinkRequest().catch(() => null),
      ]);
      setArticles(Array.isArray(res?.data?.articles) ? res.data.articles : []);
      setBildazoLink(linkRes?.data || null);
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
      <DashboardSection>
        {!loading ? (
          <FreelancerBildazoAuthorGateCard
            link={bildazoLink}
            isEn={isEn}
            onUpdated={(next) => setBildazoLink(next)}
          />
        ) : null}
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
          <ul id="article-opportunities" className="m-0 grid list-none gap-3 p-0">
            {articles.map((article) => {
              const progress = formatArticleBidCollectionLabel(article.bidCollection, {
                isEn,
                articleStatus: article.status,
              });
              return (
                <li key={article.id}>
                  <Link
                    to={`/dashboard/freelancer/articles/${article.id}`}
                    className="dash-ui-surface--soft block min-w-0 overflow-hidden rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-4 text-[color:var(--dash-text,#172033)] no-underline shadow-[var(--dash-shadow-sm)]"
                  >
                    <strong className="block text-[0.98rem] font-extrabold">{article.title || "—"}</strong>
                    <div className="mt-2 flex flex-wrap gap-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
                      <span>
                        {isEn ? `Level ${article.articleLevel ?? "—"}` : `المستوى ${article.articleLevel ?? "—"}`}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {isEn
                          ? `${article.requiredWordCount ?? "—"} words`
                          : `${article.requiredWordCount ?? "—"} كلمة`}
                      </span>
                      {article.articleValueJod != null ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <JodMoneyDisplay amount={article.articleValueJod} compact />
                        </>
                      ) : null}
                    </div>
                    {progress ? (
                      <p className="mb-0 mt-2 rounded-lg bg-[color:var(--dash-info-bg,#eef1f6)] px-2.5 py-1.5 text-[0.8rem] font-bold text-[color:var(--dash-primary,#2f3b65)]">
                        {progress}
                      </p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
