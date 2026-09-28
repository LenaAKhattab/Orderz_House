import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
import { useArticlesT } from "../../admin/marketplaceArticles/useArticlesT";
import { useTranslation } from "../../i18n/LanguageProvider";
import { useToast } from "../../components/ui/toastContext";
import {
  getFreelancerArticleApplicationContextRequest,
  submitFreelancerArticleApplicationRequest,
  withdrawFreelancerArticleApplicationRequest,
  submitFreelancerFinalArticleManuscriptRequest,
} from "../../services/api";
import { freelancerTrialApplyErrorMessage } from "../../constants/freelancerActivationTrial";
import { JodMoneyDisplay } from "../../components/money/JodMoneyDisplay";
import {
  ARTICLE_WRITING_SOURCES,
  formatArticleBidCollectionLabel,
  isBidCollectionClosedForApply,
  validateFreelancerManuscriptForm,
  writingModeLabel,
} from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
import { shouldBlockArticleApply } from "../../constants/bildazoAuthorTerms";
import { freelancerBildazoPublishCopy } from "../../constants/bildazoArticlePublish";
import {
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR,
  MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN,
} from "../../constants/freelancerActivationEarnedBalance";
import PlanUpgradeRequiredCta from "../../components/freelancer/PlanUpgradeRequiredCta";
import {
  requiredTierCodeForArticleLevel,
  shouldShowArticlePlanUpgradeCta,
} from "../../constants/planUpgradeCta";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";

function eligibilityMessage(eligibility, t, locale) {
  if (!eligibility) return null;
  if (eligibility.eligible) {
    return t("freelancer.detail.eligibility.allowed");
  }
  if (eligibility.reason === "ARTICLE_ACCESS_LEVEL_INSUFFICIENT") {
    return t("freelancer.detail.eligibility.levelLow", {
      access: eligibility.membershipArticleAccessLevel,
      level: eligibility.articleLevel,
    });
  }
  if (eligibility.reason === "ARTICLE_NO_USABLE_MEMBERSHIP") {
    return t("freelancer.detail.eligibility.needMembership");
  }
  if (eligibility.reason === "INSUFFICIENT_BID_CREDITS") {
    return t("freelancer.detail.eligibility.needBid");
  }
  if (eligibility.reason === "ARTICLE_BID_ECONOMY_DISABLED") {
    return t("freelancer.detail.eligibility.temporarilyUnavailable");
  }
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_THRESHOLD_REACHED") {
    return t("freelancer.detail.eligibility.thresholdClosed");
  }
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET") {
    return t("freelancer.detail.eligibility.minNotMet");
  }
  if (eligibility.reason === "BILDAZO_AUTHOR_LINK_REQUIRED") {
    return t("freelancer.detail.eligibility.authorRequired");
  }
  const trialMsg = freelancerTrialApplyErrorMessage(
    { publicCode: eligibility.reason },
    { isEn: locale === "en" },
  );
  if (trialMsg) return trialMsg;
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_DEADLINE_PASSED") {
    return t("freelancer.detail.eligibility.collectionEnded");
  }
  return t("freelancer.detail.eligibility.notOpen");
}

export default function FreelancerMarketplaceArticleDetailPage() {
  const { id } = useParams();
  const { t: tDash } = useTranslation();
  const { locale, t } = useArticlesT();
  const isEn = locale === "en";
  const { push } = useToast();

  const [article, setArticle] = useState(null);
  const [application, setApplication] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [message, setMessage] = useState("");
  const [manuscriptTitle, setManuscriptTitle] = useState("");
  const [manuscriptContent, setManuscriptContent] = useState("");
  const [referencesText, setReferencesText] = useState("");
  const [writingSource, setWritingSource] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [manuscriptErrors, setManuscriptErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await getFreelancerArticleApplicationContextRequest(id);
      setArticle(res?.data?.article || null);
      setApplication(res?.data?.application || null);
      setEligibility(res?.data?.eligibility || null);
      if (res?.data?.application?.proposalMessage) {
        setMessage(res.data.application.proposalMessage);
      }
      if (res?.data?.application?.articleSubmission?.title) {
        setManuscriptTitle(res.data.application.articleSubmission.title);
      }
      if (res?.data?.application?.articleSubmission?.content) {
        setManuscriptContent(res.data.application.articleSubmission.content);
      }
      if (res?.data?.application?.articleSubmission?.referencesText != null) {
        setReferencesText(res.data.application.articleSubmission.referencesText || "");
      }
      if (res?.data?.application?.articleSubmission?.writingSource) {
        setWritingSource(res.data.application.articleSubmission.writingSource);
      }
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) || t("freelancer.detail.loadError"),
      );
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApply = async () => {
    if (busy || busyRef.current) return;
    const collection = article?.bidCollection || eligibility?.bidCollection;
    if (isBidCollectionClosedForApply(collection)) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await submitFreelancerArticleApplicationRequest(id, {
        proposalMessage: message || null,
      });
      setApplication(res?.data?.application || null);
      if (res?.data?.availableBidsAfter != null) {
        setEligibility((prev) =>
          prev ? { ...prev, availableBids: res.data.availableBidsAfter, canAffordBid: true } : prev,
        );
      }
      push({
        type: "success",
        message: t("freelancer.detail.applySuccess"),
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          freelancerTrialApplyErrorMessage(err, { isEn }) ||
          getSafeApiErrorMessage(err) ||
          t("freelancer.detail.applyError"),
      });
      await refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!application?.id || busy || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await withdrawFreelancerArticleApplicationRequest(application.id);
      push({
        type: "success",
        message: t("freelancer.detail.withdrawSuccess"),
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) || t("freelancer.detail.withdrawError"),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const canSubmitManuscript = ["selected", "assigned", "writing", "submitted", "under_review", "revision_requested"].includes(
    String(application?.status || ""),
  );
  const manuscript = application?.articleSubmission || null;
  const showManuscriptForm =
    canSubmitManuscript && (!manuscript || manuscript.canResubmit || manuscript.status === "revision_requested");

  const displayTitle = application?.titleSnapshot || article?.title || "";
  const displayDescription = application?.descriptionSnapshot || article?.description || "";
  const displayCategoryName =
    application?.bildazoCategoryNameSnapshot ||
    article?.bildazoCategoryName ||
    article?.category?.name ||
    "";
  const displayWritingMode = application?.writingModeSnapshot || article?.writingMode || "";
  const displayRequiredWords =
    application?.requiredWordCountSnapshot ?? article?.requiredWordCount ?? null;
  const displayRequiredRefs =
    application?.requiredReferencesCountSnapshot ?? article?.requiredReferencesCount ?? 0;

  const handleSubmitManuscript = async () => {
    if (!application?.id || busy || busyRef.current) return;
    const nextErrors = validateFreelancerManuscriptForm(
      {
        title: manuscriptTitle,
        content: manuscriptContent,
        referencesText,
        writingSource,
        termsAccepted,
      },
      {
        requiredWordCount: displayRequiredWords,
        requiredReferencesCount: displayRequiredRefs,
        writingMode: displayWritingMode,
      },
      locale,
    );
    setManuscriptErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await submitFreelancerFinalArticleManuscriptRequest(application.id, {
        title: manuscriptTitle,
        content: manuscriptContent,
        referencesText,
        writingSource,
        termsAccepted: true,
      });
      push({
        type: "success",
        message: t("freelancer.detail.submitSuccess"),
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) || t("freelancer.detail.submitError"),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={article?.title || tDash("dashboard.nav.freelancer.articles")}
        breadcrumbs={[
          { labelKey: "dashboard.breadcrumbs.home", href: "/dashboard/freelancer" },
          {
            label: tDash("dashboard.nav.freelancer.articles"),
            href: "/dashboard/freelancer/articles",
          },
          { label: article?.title || t("freelancer.detail.article") },
        ]}
      />
      <DashboardSection>
        <p className="mb-3">
          <Link
            to="/dashboard/freelancer/articles"
            className="font-bold text-[color:var(--dash-primary,#2f3b65)] no-underline"
          >
            {t("freelancer.detail.back")}
          </Link>
        </p>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && article ? (
          <div className="grid max-w-[720px] gap-4">
            <div>
              <h2 className="mb-2 mt-0 text-lg font-extrabold text-[color:var(--dash-text,#172033)]">
                {displayTitle}
              </h2>
              <p className="m-0 whitespace-pre-wrap text-[color:var(--dash-text-secondary,#4b5563)]">
                {displayDescription || "—"}
              </p>
            </div>
            <dl
              className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3"
              data-testid="freelancer-article-requirements"
            >
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.totalValue")}
                </dt>
                <dd className="mt-1 font-extrabold" data-testid="article-detail-total-value">
                  {(article.totalArticleValueJod ?? article.articleValueJod) != null ? (
                    <JodMoneyDisplay
                      amount={article.totalArticleValueJod ?? article.articleValueJod}
                      compact
                    />
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              {article.freelancerShareJod != null ? (
                <div>
                  <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                    {t("freelancer.detail.netAfterSplit")}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-freelancer-share">
                    <JodMoneyDisplay amount={article.freelancerShareJod} compact />
                  </dd>
                </div>
              ) : null}
              {article.reviewerShareJod != null ? (
                <div>
                  <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                    {t("freelancer.detail.reviewerShare")}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-reviewer-share">
                    <JodMoneyDisplay amount={article.reviewerShareJod} compact />
                  </dd>
                </div>
              ) : null}
              {article.companyShareJod != null ? (
                <div>
                  <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                    {t("freelancer.detail.platformShare")}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-company-share">
                    <JodMoneyDisplay amount={article.companyShareJod} compact />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.articleLevel")}
                </dt>
                <dd className="mt-1 font-extrabold">{article.articleLevel ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.requiredWords")}
                </dt>
                <dd className="mt-1 font-extrabold" data-testid="article-detail-required-words">
                  {displayRequiredWords ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.requiredRefs")}
                </dt>
                <dd className="mt-1 font-extrabold" data-testid="article-detail-required-refs">
                  {displayRequiredRefs ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.writingMode")}
                </dt>
                <dd className="mt-1 font-extrabold" data-testid="article-detail-writing-mode">
                  {writingModeLabel(displayWritingMode, { locale })}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.applicants")}
                </dt>
                <dd className="mt-1 font-extrabold">
                  {formatArticleBidCollectionLabel(article.bidCollection || eligibility?.bidCollection, {
                    locale,
                    articleStatus: article.status,
                  }) || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.bildazoCategory")}
                </dt>
                <dd className="mt-1 font-extrabold" data-testid="article-detail-bildazo-category">
                  {displayCategoryName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.category")}
                </dt>
                <dd className="mt-1 font-extrabold">{article.category?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {t("freelancer.detail.subcategory")}
                </dt>
                <dd className="mt-1 font-extrabold">{article.subcategory?.name || "—"}</dd>
              </div>
            </dl>

            <p className="m-0 text-[0.95rem]">{eligibilityMessage(eligibility, t, locale)}</p>

            {shouldShowArticlePlanUpgradeCta(eligibility) ? (
              <PlanUpgradeRequiredCta
                requiredTierCode={requiredTierCodeForArticleLevel(eligibility?.articleLevel ?? article?.articleLevel)}
                currentTierCode={eligibility?.membershipTierCode || null}
                reason={eligibility?.reason}
                isEn={isEn}
              />
            ) : null}

            <p className="m-0 text-[0.95rem]">{t("freelancer.detail.applyCost")}</p>
            {eligibility?.availableBids != null ? (
              <p className="m-0 text-[0.95rem]">
                {t("freelancer.detail.availableBids")}{" "}
                <strong>{eligibility.availableBids}</strong>
              </p>
            ) : null}

            {application ? (
              <div>
                <p className="mb-2 mt-0">
                  {t("freelancer.detail.yourStatus")}{" "}
                  <strong>
                    {application.status === "pending"
                      ? t("freelancer.detail.pending")
                      : application.status === "accepted" || application.status === "approved"
                        ? t("freelancer.detail.accepted")
                        : application.status === "withdrawn"
                          ? t("freelancer.detail.withdrawn")
                          : application.status || "—"}
                  </strong>
                </p>
                {(() => {
                  const copy = freelancerBildazoPublishCopy(application.bildazoPublish, isEn);
                  if (!copy) return null;
                  return (
                    <div data-testid="freelancer-bildazo-publish-status">
                      <p className="mb-2 mt-0">{copy.text}</p>
                      {copy.url ? (
                        <p className="mb-2 mt-0">
                          <a href={copy.url} target="_blank" rel="noreferrer">
                            {copy.url}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  );
                })()}
                {application.status === "pending" ? (
                  <>
                    <p className="mb-2 mt-0 text-[0.9rem] text-[color:var(--dash-text-secondary,#4b5563)]">
                      {t("freelancer.detail.editMessageHint")}
                    </p>
                    <Button type="button" variant="secondary" disabled={busy} onClick={handleWithdraw}>
                      {t("freelancer.detail.withdraw")}
                    </Button>
                  </>
                ) : null}
                {manuscript ? (
                  <p className="mb-2 mt-0" data-testid="freelancer-final-article-status">
                    {manuscript.status === "submitted"
                      ? t("freelancer.detail.finalSubmitted")
                      : manuscript.status === "revision_requested"
                        ? t("freelancer.detail.revisionRequested")
                        : manuscript.status === "approved"
                          ? t("freelancer.detail.finalApproved")
                          : manuscript.status}
                  </p>
                ) : null}
                {manuscript?.reviewerNotes && manuscript.status === "revision_requested" ? (
                  <p className="mb-2 mt-0 text-[0.9rem]">{manuscript.reviewerNotes}</p>
                ) : null}
                {showManuscriptForm ? (
                  <div className="grid gap-2" data-testid="freelancer-final-article-form">
                    <label className="grid gap-1.5">
                      <span>{t("freelancer.detail.finalTitle")}</span>
                      <input
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        value={manuscriptTitle}
                        onChange={(e) => setManuscriptTitle(e.target.value)}
                        maxLength={120}
                      />
                      {manuscriptErrors.title ? (
                        <span className="text-[0.8rem] text-[color:var(--dash-danger,#c03535)]">
                          {manuscriptErrors.title}
                        </span>
                      ) : null}
                    </label>
                    <label className="grid gap-1.5">
                      <span>{t("freelancer.detail.finalContent")}</span>
                      <textarea
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        rows={10}
                        value={manuscriptContent}
                        onChange={(e) => setManuscriptContent(e.target.value)}
                        maxLength={200000}
                      />
                      {manuscriptErrors.content ? (
                        <span className="text-[0.8rem] text-[color:var(--dash-danger,#c03535)]">
                          {manuscriptErrors.content}
                        </span>
                      ) : null}
                    </label>
                    <label className="grid gap-1.5">
                      <span>{t("freelancer.detail.referencesLines")}</span>
                      <textarea
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        rows={4}
                        value={referencesText}
                        onChange={(e) => setReferencesText(e.target.value)}
                        maxLength={50000}
                        data-testid="manuscript-references"
                      />
                      {manuscriptErrors.referencesText ? (
                        <span className="text-[0.8rem] text-[color:var(--dash-danger,#c03535)]">
                          {manuscriptErrors.referencesText}
                        </span>
                      ) : null}
                    </label>
                    <label className="grid gap-1.5">
                      <span>{t("freelancer.detail.writingMethod")}</span>
                      <select
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        value={writingSource}
                        onChange={(e) => setWritingSource(e.target.value)}
                        data-testid="manuscript-writing-source"
                      >
                        <option value="">{t("common.select")}</option>
                        {ARTICLE_WRITING_SOURCES.map((src) => (
                          <option key={src} value={src}>
                            {t(`writingSources.${src}`)}
                          </option>
                        ))}
                      </select>
                      {manuscriptErrors.writingSource ? (
                        <span className="text-[0.8rem] text-[color:var(--dash-danger,#c03535)]">
                          {manuscriptErrors.writingSource}
                        </span>
                      ) : null}
                    </label>
                    <label className="flex items-start gap-2 text-[0.86rem] font-semibold" data-testid="manuscript-terms-checkbox">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                      />
                      <span>
                        {isEn ? MINI_ARTICLE_SUBMISSION_TERMS_COPY_EN : MINI_ARTICLE_SUBMISSION_TERMS_COPY_AR}
                      </span>
                    </label>
                    {manuscriptErrors.termsAccepted ? (
                      <span className="text-[0.8rem] text-[color:var(--dash-danger,#c03535)]">
                        {manuscriptErrors.termsAccepted}
                      </span>
                    ) : null}
                    <Button type="button" disabled={busy || !termsAccepted} onClick={handleSubmitManuscript}>
                      {t("freelancer.detail.submitFinal")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!application &&
            eligibility?.eligible &&
            !shouldBlockArticleApply(eligibility?.bildazoAuthorLink) &&
            !isBidCollectionClosedForApply(article.bidCollection || eligibility?.bidCollection) ? (
              <div className="grid gap-2">
                <label className="grid gap-1.5">
                  <span>{t("freelancer.detail.proposalOptional")}</span>
                  <textarea
                    className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={5000}
                  />
                </label>
                <Button
                  type="button"
                  disabled={
                    busy ||
                    eligibility?.canAffordBid === false ||
                    eligibility?.reason === "INSUFFICIENT_BID_CREDITS"
                  }
                  onClick={handleApply}
                >
                  {t("freelancer.detail.apply")}
                </Button>
                {eligibility?.canAffordBid === false ? (
                  <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">
                    {t("freelancer.detail.insufficientBids")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!application && eligibility?.reason === "BILDAZO_AUTHOR_LINK_REQUIRED" ? (
              <p className="m-0">
                <Link
                  to="/dashboard/freelancer/articles"
                  className="font-bold text-[color:var(--dash-primary,#2f3b65)]"
                >
                  {t("freelancer.detail.completeBildazoLink")}
                </Link>
              </p>
            ) : null}
            {!application && !eligibility?.eligible && eligibility?.reason === "INSUFFICIENT_BID_CREDITS" ? (
              <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">
                {t("freelancer.detail.insufficientBids")}
              </p>
            ) : null}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
