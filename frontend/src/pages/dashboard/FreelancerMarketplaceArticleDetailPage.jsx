import { useCallback, useEffect, useState } from "react";
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
} from "../../services/api";
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
          getSafeApiErrorMessage(err) || (isEn ? "Could not apply." : "تعذر تقديم الطلب."),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!application?.id) return;
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
        <p style={{ marginBottom: 12 }}>
          <Link to="/dashboard/freelancer/articles">{isEn ? "← Back" : "→ رجوع"}</Link>
        </p>
        {loading ? <DashboardLoadingState /> : null}
        {!loading && error ? <DashboardErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !error && article ? (
          <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
            <div>
              <h2 style={{ margin: "0 0 8px" }}>{article.title}</h2>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{article.description || "—"}</p>
            </div>
            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: 12,
                margin: 0,
              }}
            >
              <div>
                <dt style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  {isEn ? "Article level" : "مستوى المقال"}
                </dt>
                <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{article.articleLevel}</dd>
              </div>
              <div>
                <dt style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  {isEn ? "Required words" : "عدد الكلمات"}
                </dt>
                <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>{article.requiredWordCount}</dd>
              </div>
              <div>
                <dt style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  {isEn ? "Required references" : "عدد المراجع"}
                </dt>
                <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                  {article.requiredReferencesCount ?? 0}
                </dd>
              </div>
              <div>
                <dt style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  {isEn ? "Category" : "التصنيف"}
                </dt>
                <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                  {article.category?.name || "—"}
                </dd>
              </div>
              <div>
                <dt style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  {isEn ? "Subcategory" : "الفرعي"}
                </dt>
                <dd style={{ margin: "4px 0 0", fontWeight: 600 }}>
                  {article.subcategory?.name || "—"}
                </dd>
              </div>
            </dl>

            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              {eligibilityMessage(eligibility, isEn)}
            </p>

            <p style={{ margin: 0, fontSize: "0.95rem" }}>
              {isEn ? "Application cost: 1 Bid" : "تكلفة التقديم: عرض واحد"}
            </p>
            {eligibility?.availableBids != null ? (
              <p style={{ margin: 0, fontSize: "0.95rem" }}>
                {isEn ? "Available Bids:" : "العروض المتاحة:"}{" "}
                <strong>{eligibility.availableBids}</strong>
              </p>
            ) : null}

            {application ? (
              <div>
                <p style={{ margin: "0 0 8px" }}>
                  {isEn ? "Your application status:" : "حالة طلبك:"}{" "}
                  <strong>{application.status}</strong>
                </p>
                {application.status === "pending" ? (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: "0.9rem", opacity: 0.85 }}>
                      {isEn
                        ? "Editing your proposal does not cost another Bid. Withdrawal does not refund your Bid."
                        : "تعديل الرسالة لا يستهلك عرضاً إضافياً. سحب الطلب لا يسترد العرض."}
                    </p>
                    <Button type="button" variant="secondary" disabled={busy} onClick={handleWithdraw}>
                      {isEn ? "Withdraw" : "سحب الطلب"}
                    </Button>
                  </>
                ) : null}
              </div>
            ) : null}

            {!application && eligibility?.eligible ? (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>{isEn ? "Proposal message (optional)" : "رسالة العرض (اختياري)"}</span>
                  <textarea
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
                  <p style={{ margin: 0, color: "#b00020", fontSize: "0.9rem" }}>
                    {isEn
                      ? "Insufficient Bids to apply."
                      : "رصيد العروض غير كافٍ للتقديم."}
                  </p>
                ) : null}
              </div>
            ) : null}
            {!application && !eligibility?.eligible && eligibility?.reason === "INSUFFICIENT_BID_CREDITS" ? (
              <p style={{ margin: 0, color: "#b00020", fontSize: "0.9rem" }}>
                {isEn
                  ? "Insufficient Bids to apply."
                  : "رصيد العروض غير كافٍ للتقديم."}
              </p>
            ) : null}
          </div>
        ) : null}
      </DashboardSection>
    </DashboardShell>
  );
}
