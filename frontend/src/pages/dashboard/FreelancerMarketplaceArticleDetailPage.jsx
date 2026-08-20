import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import DashboardPageHeader from "../../components/dashboard/DashboardPageHeader";
import DashboardShell from "../../components/dashboard/DashboardShell";
import DashboardSection from "../../components/dashboard/DashboardSection";
import DashboardLoadingState from "../../components/dashboard/DashboardLoadingState";
import DashboardErrorState from "../../components/dashboard/DashboardErrorState";
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
import { formatArticleBidCollectionLabel, isBidCollectionClosedForApply } from "../../admin/marketplaceArticles/marketplaceArticleFormUtils";
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

function eligibilityMessage(eligibility, isEn) {
  if (!eligibility) return null;
  if (eligibility.eligible) {
    return isEn
      ? "Your membership access level allows you to apply to this article."
      : "مستوى عضويتك يسمح بالتقدّم لهذا المقال.";
  }
  if (eligibility.reason === "ARTICLE_ACCESS_LEVEL_INSUFFICIENT") {
    return isEn
      ? `Your Article access level (${eligibility.membershipArticleAccessLevel}) is below this article’s level (${eligibility.articleLevel}).`
      : `مستوى وصولك للمقالات (${eligibility.membershipArticleAccessLevel}) أقل من مستوى هذا المقال (${eligibility.articleLevel}).`;
  }
  if (eligibility.reason === "ARTICLE_NO_USABLE_MEMBERSHIP") {
    return isEn
      ? "You need a usable Marketplace Membership to apply."
      : "تحتاج عضوية سوق فعالة للتقدّم.";
  }
  if (eligibility.reason === "INSUFFICIENT_BID_CREDITS") {
    return isEn
      ? "You need at least 1 Bid to apply."
      : "تحتاج عرضاً واحداً على الأقل للتقديم.";
  }
  if (eligibility.reason === "ARTICLE_BID_ECONOMY_DISABLED") {
    return isEn
      ? "Article applications are temporarily unavailable."
      : "تقديم المقالات غير متاح مؤقتاً.";
  }
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_THRESHOLD_REACHED") {
    return isEn
      ? "The required number of applicants has been reached."
      : "اكتمل العدد المطلوب لهذه المناقصة ولم يعد التقديم متاحًا.";
  }
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_MINIMUM_NOT_MET") {
    return isEn
      ? "This article did not reach the required number of applicants."
      : "لم يكتمل الحد الأدنى للمناقصات";
  }
  if (eligibility.reason === "BILDAZO_AUTHOR_LINK_REQUIRED") {
    return isEn
      ? "Create or link your Bildazo writer account before applying to articles."
      : "يرجى إنشاء أو ربط حساب الكاتب في Bildazo قبل التقديم على المقالات.";
  }
  const trialMsg = freelancerTrialApplyErrorMessage(
    { publicCode: eligibility.reason },
    { isEn },
  );
  if (trialMsg) return trialMsg;
  if (eligibility.reason === "ARTICLE_BID_COLLECTION_DEADLINE_PASSED") {
    return isEn
      ? "The application deadline has passed."
      : "انتهت مدة جمع المناقصات لهذا المقال.";
  }
  return isEn ? "This article is not open for applications." : "هذا المقال غير مفتوح للتقديم.";
}

export default function FreelancerMarketplaceArticleDetailPage() {
  const { id } = useParams();
  const { locale, t } = useTranslation();
  const isEn = locale === "en";
  const { push } = useToast();

  const [article, setArticle] = useState(null);
  const [application, setApplication] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [message, setMessage] = useState("");
  const [manuscriptTitle, setManuscriptTitle] = useState("");
  const [manuscriptContent, setManuscriptContent] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
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
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) || (isEn ? "Failed to load article." : "تعذر تحميل المقال."),
      );
      setArticle(null);
    } finally {
      setLoading(false);
    }
  }, [id, isEn]);

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
        message: isEn ? "Application submitted." : "تم تقديم الطلب.",
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          freelancerTrialApplyErrorMessage(err, { isEn }) ||
          getSafeApiErrorMessage(err) ||
          (isEn ? "Could not apply." : "تعذر تقديم الطلب."),
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
        message: isEn ? "Application withdrawn." : "تم سحب الطلب.",
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) || (isEn ? "Could not withdraw." : "تعذر سحب الطلب."),
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

  const handleSubmitManuscript = async () => {
    if (!application?.id || busy || busyRef.current) return;
    if (!termsAccepted) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await submitFreelancerFinalArticleManuscriptRequest(application.id, {
        title: manuscriptTitle,
        content: manuscriptContent,
        termsAccepted: true,
      });
      push({
        type: "success",
        message: isEn ? "Final article submitted." : "تم تسليم المقال النهائي.",
      });
      await refresh();
    } catch (err) {
      push({
        type: "error",
        message:
          getSafeApiErrorMessage(err) || (isEn ? "Could not submit article." : "تعذر تسليم المقال."),
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <DashboardShell>
      <DashboardPageHeader
        title={article?.title || t("dashboard.nav.freelancer.articles")}
        breadcrumbs={[
          { labelKey: "dashboard.breadcrumbs.home", href: "/dashboard/freelancer" },
          {
            label: t("dashboard.nav.freelancer.articles"),
            href: "/dashboard/freelancer/articles",
          },
          { label: article?.title || (isEn ? "Article" : "مقال") },
        ]}
      />
      <DashboardSection>
        <p className="mb-3">
          <Link
            to="/dashboard/freelancer/articles"
            className="font-bold text-[color:var(--dash-primary,#2f3b65)] no-underline"
          >
            {isEn ? "← Back" : "→ رجوع"}
          </Link>
        </p>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && article ? (
          <div className="grid max-w-[720px] gap-4">
            <div>
              <h2 className="mb-2 mt-0 text-lg font-extrabold text-[color:var(--dash-text,#172033)]">
                {article.title}
              </h2>
              <p className="m-0 whitespace-pre-wrap text-[color:var(--dash-text-secondary,#4b5563)]">
                {article.description || "—"}
              </p>
            </div>
            <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Total article value" : "إجمالي قيمة المقال"}
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
                    {isEn ? "Your net after split" : "صافي مستحقاتك بعد التوزيع"}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-freelancer-share">
                    <JodMoneyDisplay amount={article.freelancerShareJod} compact />
                  </dd>
                </div>
              ) : null}
              {article.reviewerShareJod != null ? (
                <div>
                  <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                    {isEn ? "Reviewer share" : "حصة التدقيق"}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-reviewer-share">
                    <JodMoneyDisplay amount={article.reviewerShareJod} compact />
                  </dd>
                </div>
              ) : null}
              {article.companyShareJod != null ? (
                <div>
                  <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                    {isEn ? "Platform share" : "حصة المنصة"}
                  </dt>
                  <dd className="mt-1 font-extrabold" data-testid="article-detail-company-share">
                    <JodMoneyDisplay amount={article.companyShareJod} compact />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Article level" : "مستوى المقال"}
                </dt>
                <dd className="mt-1 font-extrabold">{article.articleLevel ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Required words" : "عدد الكلمات"}
                </dt>
                <dd className="mt-1 font-extrabold">{article.requiredWordCount ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Required references" : "عدد المراجع"}
                </dt>
                <dd className="mt-1 font-extrabold">{article.requiredReferencesCount ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Applicants" : "المتقدمون"}
                </dt>
                <dd className="mt-1 font-extrabold">
                  {formatArticleBidCollectionLabel(article.bidCollection || eligibility?.bidCollection, {
                    isEn,
                    articleStatus: article.status,
                  }) || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Category" : "التصنيف"}
                </dt>
                <dd className="mt-1 font-extrabold">{article.category?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.8rem] font-bold text-[color:var(--dash-text-muted,#667085)]">
                  {isEn ? "Subcategory" : "الفرعي"}
                </dt>
                <dd className="mt-1 font-extrabold">{article.subcategory?.name || "—"}</dd>
              </div>
            </dl>

            <p className="m-0 text-[0.95rem]">{eligibilityMessage(eligibility, isEn)}</p>

            {shouldShowArticlePlanUpgradeCta(eligibility) ? (
              <PlanUpgradeRequiredCta
                requiredTierCode={requiredTierCodeForArticleLevel(eligibility?.articleLevel ?? article?.articleLevel)}
                currentTierCode={eligibility?.membershipTierCode || null}
                reason={eligibility?.reason}
                isEn={isEn}
              />
            ) : null}

            <p className="m-0 text-[0.95rem]">
              {isEn ? "Application cost: 1 Bid" : "تكلفة التقديم: عرض واحد"}
            </p>
            {eligibility?.availableBids != null ? (
              <p className="m-0 text-[0.95rem]">
                {isEn ? "Available Bids:" : "العروض المتاحة:"}{" "}
                <strong>{eligibility.availableBids}</strong>
              </p>
            ) : null}

            {application ? (
              <div>
                <p className="mb-2 mt-0">
                  {isEn ? "Your application status:" : "حالة طلبك:"}{" "}
                  <strong>
                    {application.status === "pending"
                      ? isEn
                        ? "Pending"
                        : "قيد المراجعة"
                      : application.status === "accepted" || application.status === "approved"
                        ? isEn
                          ? "Accepted"
                          : "مقبول"
                        : application.status === "withdrawn"
                          ? isEn
                            ? "Withdrawn"
                            : "مسحوب"
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
                      {isEn
                        ? "Editing your proposal does not cost another Bid. Withdrawal does not refund your Bid."
                        : "تعديل الرسالة لا يستهلك عرضاً إضافياً. سحب الطلب لا يسترد العرض."}
                    </p>
                    <Button type="button" variant="secondary" disabled={busy} onClick={handleWithdraw}>
                      {isEn ? "Withdraw" : "سحب الطلب"}
                    </Button>
                  </>
                ) : null}
                {manuscript ? (
                  <p className="mb-2 mt-0" data-testid="freelancer-final-article-status">
                    {manuscript.status === "submitted"
                      ? isEn
                        ? "Final article submitted for review."
                        : "تم تسليم المقال النهائي للمراجعة."
                      : manuscript.status === "revision_requested"
                        ? isEn
                          ? "Admin requested a revision."
                          : "طلبت الإدارة تعديلاً على المقال."
                        : manuscript.status === "approved"
                          ? isEn
                            ? "Final article approved."
                            : "تم اعتماد المقال النهائي."
                          : manuscript.status}
                  </p>
                ) : null}
                {manuscript?.reviewerNotes && manuscript.status === "revision_requested" ? (
                  <p className="mb-2 mt-0 text-[0.9rem]">{manuscript.reviewerNotes}</p>
                ) : null}
                {showManuscriptForm ? (
                  <div className="grid gap-2" data-testid="freelancer-final-article-form">
                    <label className="grid gap-1.5">
                      <span>{isEn ? "Final article title" : "عنوان المقال النهائي"}</span>
                      <input
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        value={manuscriptTitle}
                        onChange={(e) => setManuscriptTitle(e.target.value)}
                        maxLength={120}
                      />
                    </label>
                    <label className="grid gap-1.5">
                      <span>{isEn ? "Final article content" : "محتوى المقال النهائي"}</span>
                      <textarea
                        className="w-full rounded-[10px] border border-[color:var(--dash-border,#c9d0da)] p-2.5 font-inherit"
                        rows={10}
                        value={manuscriptContent}
                        onChange={(e) => setManuscriptContent(e.target.value)}
                        maxLength={200000}
                      />
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
                    <Button type="button" disabled={busy || !termsAccepted} onClick={handleSubmitManuscript}>
                      {isEn ? "Submit final article" : "تسليم المقال النهائي"}
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
                  <span>{isEn ? "Proposal message (optional)" : "رسالة العرض (اختياري)"}</span>
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
                  {isEn ? "Apply" : "تقدّم"}
                </Button>
                {eligibility?.canAffordBid === false ? (
                  <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">
                    {isEn ? "Insufficient Bids to apply." : "رصيد العروض غير كافٍ للتقديم."}
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
                  إكمال طلب ربط حساب الكاتب في Bildazo
                </Link>
              </p>
            ) : null}
            {!application && !eligibility?.eligible && eligibility?.reason === "INSUFFICIENT_BID_CREDITS" ? (
              <p className="m-0 text-[0.9rem] text-[color:var(--dash-danger,#c03535)]">
                {isEn ? "Insufficient Bids to apply." : "رصيد العروض غير كافٍ للتقديم."}
              </p>
            ) : null}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
