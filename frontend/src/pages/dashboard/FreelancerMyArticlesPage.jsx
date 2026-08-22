import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardEmptyState from "../../components/dashboard/DashboardEmptyState";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import StatusBadge from "../../components/dashboard/StatusBadge";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getFreelancerMyArticlesRequest } from "../../services/api";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import FreelancerBildazoPublishSuccessBlock from "../../components/freelancer/FreelancerBildazoPublishSuccessBlock";
import {
  MY_ARTICLES_EMPTY_DESC_AR,
  MY_ARTICLES_EMPTY_TITLE_AR,
  MY_ARTICLES_PORTFOLIO_STATUSES,
  portfolioStatusLabel,
} from "../../constants/freelancerMyArticlesPortfolio";

function formatDate(value, isEn) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(isEn ? "en" : "ar-JO-u-nu-latn", {
      dateStyle: "medium",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function portfolioTone(status) {
  if (status === "published_on_bildazo") return "success";
  if (status === "rejected") return "danger";
  if (status === "revision_requested") return "warning";
  if (status === "accepted") return "success";
  if (status === "under_review") return "info";
  return "neutral";
}

export default function FreelancerMyArticlesPage() {
  const { locale } = useTranslation();
  const isEn = locale === "en";
  const [items, setItems] = useState([]);
  const [writerProfileUrl, setWriterProfileUrl] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getFreelancerMyArticlesRequest({
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setItems(Array.isArray(res?.data?.items) ? res.data.items : []);
      setWriterProfileUrl(res?.data?.writerProfileUrl || null);
    } catch (err) {
      setItems([]);
      setError(getSafeApiErrorMessage(err) || (isEn ? "Could not load your articles." : "تعذر تحميل مقالاتك."));
    } finally {
      setLoading(false);
    }
  }, [isEn, statusFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groupedCount = useMemo(() => items.length, [items]);

  return (
    <DashboardShell>
      <DashboardSection
        title={isEn ? "My articles" : "مقالاتي"}
        description={
          isEn
            ? "Your Mini Article work, review status, and Bildazo publishing."
            : "أعمالك من Mini Article وحالة التدقيق والنشر على Bildazo."
        }
      >
        <div className="mb-3 flex flex-wrap gap-2" data-testid="my-articles-filters">
          {MY_ARTICLES_PORTFOLIO_STATUSES.map((status) => (
            <button
              key={status.key}
              type="button"
              className={
                statusFilter === status.key
                  ? "oh-account-btn-primary"
                  : "oh-account-btn-ghost"
              }
              data-testid={`my-articles-filter-${status.key}`}
              onClick={() => setStatusFilter(status.key)}
            >
              {isEn ? status.key : status.labelAr}
            </button>
          ))}
        </div>

        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && groupedCount === 0 ? (
          <DashboardEmptyState
            title={isEn ? "No article work yet" : MY_ARTICLES_EMPTY_TITLE_AR}
            description={isEn ? "When you win an article, it will appear here with review and publish status." : MY_ARTICLES_EMPTY_DESC_AR}
            data-testid="my-articles-empty"
          />
        ) : null}

        {!loading && !error && groupedCount > 0 ? (
          <ul className="m-0 grid list-none gap-3 p-0" data-testid="my-articles-list">
            {items.map((item) => (
              <li
                key={item.applicationId}
                className="dash-ui-surface--soft rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-4"
                data-testid={`my-articles-card-${item.portfolioStatus}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-[0.98rem] font-extrabold text-[color:var(--dash-text,#172033)]">
                    {item.articleTitle || "—"}
                  </strong>
                  <StatusBadge tone={portfolioTone(item.portfolioStatus)}>
                    {portfolioStatusLabel(item.portfolioStatus, item.portfolioStatusLabelAr)}
                  </StatusBadge>
                </div>
                <div className="mt-2 grid gap-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
                  {item.assignedAt ? (
                    <span>
                      {isEn ? "Assigned" : "تاريخ التعيين"}: {formatDate(item.assignedAt, isEn)}
                    </span>
                  ) : null}
                  {item.submissionDate ? (
                    <span>
                      {isEn ? "Submitted" : "تاريخ التسليم"}: {formatDate(item.submissionDate, isEn)}
                    </span>
                  ) : null}
                  {item.articleGrossValueJod ? (
                    <span>
                      {isEn ? "Article value" : "قيمة المقال"}:{" "}
                      <JodMoneyDisplay amount={item.articleGrossValueJod} compact showDisclaimer={false} />
                    </span>
                  ) : null}
                  {item.freelancerNetEarningJod ? (
                    <span>
                      {isEn ? "Your net earning" : "صافي أجرك"}:{" "}
                      <JodMoneyDisplay amount={item.freelancerNetEarningJod} compact showDisclaimer={false} />
                    </span>
                  ) : null}
                </div>
                {item.portfolioStatus === "published_on_bildazo" ? (
                  <div className="mt-3">
                    <FreelancerBildazoPublishSuccessBlock
                      publish={item.bildazoPublish}
                      writerProfileUrl={item.writerProfileUrl || writerProfileUrl}
                      isEn={isEn}
                      testId={`my-articles-publish-${item.applicationId}`}
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(item.actions || []).map((action) =>
                    action.external ? (
                      <a
                        key={action.key}
                        className="oh-account-btn-ghost inline-flex no-underline"
                        href={action.href}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`my-articles-action-${action.key}`}
                      >
                        {action.labelAr}
                      </a>
                    ) : (
                      <Link
                        key={action.key}
                        className="oh-account-btn-ghost inline-flex no-underline"
                        to={action.href}
                        data-testid={`my-articles-action-${action.key}`}
                      >
                        {action.labelAr}
                      </Link>
                    ),
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
