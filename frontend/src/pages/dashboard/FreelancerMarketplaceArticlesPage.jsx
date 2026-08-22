import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useTranslation } from "../../i18n/LanguageProvider";
import {
  listPublishedMarketplaceArticlesRequest,
  getFreelancerBildazoAuthorLinkRequest,
  getFreelancerActivationTrialRequest,
  activateFreelancerActivationTrialRequest,
  getFreelancerActivationEarnedBalanceRequest,
  getFreelancerActivationConversionRequest,
} from "../../services/api";
import FreelancerActivationTrialStatusBlock from "../../components/freelancer/FreelancerActivationTrialStatusBlock";
import FreelancerEarnedBalancePanel from "../../components/freelancer/FreelancerEarnedBalancePanel";
import FreelancerSilverConversionCard from "../../components/freelancer/FreelancerSilverConversionCard";
import { freelancerTrialActivateErrorMessage } from "../../constants/freelancerActivationTrial";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import { formatArticleBidCollectionLabel } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import FreelancerBildazoAuthorGateCard from "../../components/freelancer/FreelancerBildazoAuthorGateCard";
import FreelancerBildazoLinkedAccountWidget from "../../components/freelancer/FreelancerBildazoLinkedAccountWidget";
import { isBildazoAuthorLinked } from "../../constants/bildazoAuthorTerms";

export default function FreelancerMarketplaceArticlesPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const [articles, setArticles] = useState([]);
  const [bildazoLink, setBildazoLink] = useState(null);
  const [trialState, setTrialState] = useState(null);
  const [trialActivating, setTrialActivating] = useState(false);
  const [trialActivateError, setTrialActivateError] = useState("");
  const [earnedBalance, setEarnedBalance] = useState(null);
  const [conversion, setConversion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [res, linkRes, trialRes, earnedRes, conversionRes] = await Promise.all([
        listPublishedMarketplaceArticlesRequest({}),
        getFreelancerBildazoAuthorLinkRequest().catch(() => null),
        getFreelancerActivationTrialRequest().catch(() => null),
        getFreelancerActivationEarnedBalanceRequest().catch(() => null),
        getFreelancerActivationConversionRequest().catch(() => null),
      ]);
      setArticles(Array.isArray(res?.data?.articles) ? res.data.articles : []);
      setBildazoLink(linkRes?.data || null);
      setTrialState(trialRes?.data || null);
      setEarnedBalance(
        earnedRes?.data || {
          totalPendingJod: "0.000",
          totalAcceptedArticles: 0,
          totalPublishedArticles: 0,
          entries: [],
        },
      );
      setConversion(conversionRes?.data || null);
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

  const linked = isBildazoAuthorLinked(bildazoLink);

  return (
    <DashboardShell>
      <DashboardSection
        title={isEn ? "Article opportunities" : "فرص المقالات"}
        description={
          isEn
            ? "Mini Article opportunities you can apply to."
            : "فرص Mini Article المتاحة للتقديم."
        }
        actions={
          !loading && linked ? (
            <FreelancerBildazoLinkedAccountWidget
              link={bildazoLink}
              isEn={isEn}
              onUpdated={async (next) => {
                setBildazoLink(next);
                const me = await getFreelancerBildazoAuthorLinkRequest().catch(() => null);
                if (me?.data) setBildazoLink(me.data);
              }}
            />
          ) : null
        }
      >
        {!loading && !linked ? (
          <FreelancerBildazoAuthorGateCard
            link={bildazoLink}
            isEn={isEn}
            onUpdated={async (next) => {
              setBildazoLink(next);
              if (!isBildazoAuthorLinked(next)) return;
              const me = await getFreelancerBildazoAuthorLinkRequest().catch(() => null);
              if (me?.data) setBildazoLink(me.data);
            }}
          />
        ) : null}
        {!loading && trialState?.engineEnabled ? (
          <FreelancerActivationTrialStatusBlock
            state={trialState}
            isEn={isEn}
            activating={trialActivating}
            activateError={trialActivateError}
            onActivate={async () => {
              setTrialActivating(true);
              setTrialActivateError("");
              try {
                const out = await activateFreelancerActivationTrialRequest();
                setTrialState(out?.data?.state || out?.data || trialState);
              } catch (err) {
                setTrialActivateError(
                  freelancerTrialActivateErrorMessage(err, { isEn }) ||
                    getSafeApiErrorMessage(err) ||
                    (isEn
                      ? "Could not grant trial Bids. Try again."
                      : "تعذر منح عروض التجربة. حاول مرة أخرى."),
                );
              } finally {
                setTrialActivating(false);
              }
            }}
          />
        ) : null}
        {!loading && conversion?.shouldShowSilverCta ? (
          <FreelancerSilverConversionCard conversion={conversion} isEn={isEn} />
        ) : null}
        {!loading ? (
          <div id="earned-balance">
            <FreelancerEarnedBalancePanel balance={earnedBalance} isEn={isEn} conversion={conversion} />
          </div>
        ) : null}
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && articles.length === 0 ? (
          <DashboardEmptyState
            title={isEn ? "No article opportunities right now" : "لا توجد فرص مقالات متاحة حاليًا"}
            description={
              isEn
                ? "Mini Article opportunities will appear here when they are published."
                : "ستظهر هنا فرص Mini Article التي يمكنك التقديم لها عند نشرها."
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
                          <span data-testid="article-card-full-value">
                            {isEn ? "Article value: " : "قيمة المقال: "}
                            <JodMoneyDisplay amount={article.articleValueJod} compact />
                          </span>
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
