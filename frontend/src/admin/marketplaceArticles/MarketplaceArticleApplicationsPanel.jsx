import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  listAdminArticleApplicationsRequest,
  rejectAdminArticleApplicationRequest,
  relistAdminMarketplaceArticleBidCollectionRequest,
  selectAdminArticleApplicationRequest,
} from "../../services/api";
import FairSelectionOverrideDialog from "./FairSelectionOverrideDialog";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  canSelectArticleApplicant,
  canRelistBidCollection,
  formatArticleBidCollectionLabel,
  ARTICLE_FAIR_RANKING_DISCLAIMER_AR,
  ARTICLE_FAIR_RANKING_PENDING_AR,
  isFairRankingEligible,
  isRecommendedArticleApplicant,
} from "./marketplaceArticleFormUtils";

export default function MarketplaceArticleApplicationsPanel({
  articleId,
  isEn = false,
  onToast,
  onRelisted,
}) {
  const [applications, setApplications] = useState([]);
  const [bidCollection, setBidCollection] = useState(null);
  const [fairRanking, setFairRanking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [relisting, setRelisting] = useState(false);
  const [overrideTargetId, setOverrideTargetId] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    setError("");
    try {
      const res = await listAdminArticleApplicationsRequest(articleId);
      setApplications(Array.isArray(res?.data?.applications) ? res.data.applications : []);
      setBidCollection(res?.data?.bidCollection || null);
      setFairRanking(res?.data?.fairRanking || null);
    } catch (err) {
      setError(
        getSafeApiErrorMessage(err) ||
          (isEn ? "Failed to load applications." : "تعذر تحميل الطلبات."),
      );
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [articleId, isEn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (applicationId, action, overrideReason) => {
    if (busyId) return;
    if (
      action === "select" &&
      overrideReason == null &&
      isFairRankingEligible(fairRanking) &&
      !isRecommendedArticleApplicant(applicationId, fairRanking)
    ) {
      setOverrideTargetId(applicationId);
      return;
    }
    setBusyId(applicationId);
    try {
      if (action === "select") {
        await selectAdminArticleApplicationRequest(
          applicationId,
          overrideReason ? { overrideReason } : {},
        );
        onToast?.({
          type: "success",
          message: isEn ? "Applicant selected." : "تم اختيار المتقدم.",
        });
      } else {
        await rejectAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: isEn ? "Application rejected." : "تم رفض الطلب.",
        });
      }
      await refresh();
    } catch (err) {
      onToast?.({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Action failed." : "فشل الإجراء."),
      });
    } finally {
      setBusyId(null);
    }
  };

  const relist = async () => {
    if (relisting) return;
    setRelisting(true);
    try {
      await relistAdminMarketplaceArticleBidCollectionRequest(articleId);
      onToast?.({
        type: "success",
        message: isEn ? "A new bid-collection round is open." : "تم فتح جولة مناقصات جديدة.",
      });
      await refresh();
      await onRelisted?.();
    } catch (err) {
      onToast?.({
        type: "error",
        message: getSafeApiErrorMessage(err) || (isEn ? "Relist failed." : "تعذر إعادة طرح المناقصة."),
      });
    } finally {
      setRelisting(false);
    }
  };

  if (!articleId) return null;

  return (
    <section style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
      <h4 style={{ margin: "0 0 8px" }}>
        {isEn ? "Applications" : "طلبات التقديم"}
        {!loading ? ` (${applications.length})` : ""}
      </h4>
      {formatArticleBidCollectionLabel(bidCollection, { isEn }) ? (
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
          {formatArticleBidCollectionLabel(bidCollection, { isEn })}
        </p>
      ) : null}
      {canRelistBidCollection(bidCollection) ? (
        <div data-testid="article-relist-bid-collection" style={{ margin: "0 0 12px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "0.92rem" }}>
            {isEn
              ? "A new round will open with the same article data. Previous applicants will not count toward the new round. The required bid count stays the same."
              : "سيتم فتح جولة جديدة بنفس بيانات المقال، ولن يتم احتساب المتقدمين السابقين ضمن الجولة الجديدة. سيبقى الحد الأدنى للمناقصات كما هو."}
          </p>
          <Button type="button" onClick={relist} disabled={relisting}>
            {isEn ? "Relist auction" : "إعادة طرح المناقصة"}
          </Button>
        </div>
      ) : null}

      <section
        style={{
          margin: "0 0 14px",
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <h5 style={{ margin: "0 0 8px" }}>
          {isEn ? "Fair distribution ranking" : "ترتيب التوزيع العادل"}
        </h5>
        {!isFairRankingEligible(fairRanking) ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            {fairRanking?.messageAr && !isEn
              ? fairRanking.messageAr
              : isEn
                ? fairRanking?.messageEn || "Fair ranking appears after the required applicant count is reached."
                : ARTICLE_FAIR_RANKING_PENDING_AR}
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 10px", fontSize: "0.92rem" }}>
              {isEn
                ? "This ranking is advisory and based on fair-distribution rules. Assignment still requires Super Admin confirmation."
                : ARTICLE_FAIR_RANKING_DISCLAIMER_AR}
            </p>
            <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 8 }}>
              {(fairRanking.candidates || []).map((c) => (
                <li key={c.applicationId}>
                  <strong>
                    #{c.rank} {c.freelancerName || c.freelancerUserId}
                    {String(c.applicationId) === String(fairRanking.recommendedApplicationId)
                      ? isEn
                        ? " (recommended)"
                        : " (المرشح الأول)"
                      : ""}
                  </strong>
                  <div style={{ fontSize: "0.88rem", opacity: 0.85 }}>
                    {isEn ? "Status" : "الحالة"}: {c.status}
                    {c.submittedAt ? ` · ${new Date(c.submittedAt).toLocaleString()}` : ""}
                    {c.rankingReason ? ` · ${isEn ? c.rankingReasonEn || c.rankingReason : c.rankingReason}` : ""}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      {loading ? <p style={{ opacity: 0.75 }}>{isEn ? "Loading…" : "جارٍ التحميل…"}</p> : null}
      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
      {!loading && !error && applications.length === 0 ? (
        <p style={{ opacity: 0.75, margin: 0 }}>
          {isEn ? "No applications yet." : "لا توجد طلبات بعد."}
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {applications.map((app) => (
          <li
            key={app.id}
            style={{
              padding: 10,
              border: "1px solid rgba(0,0,0,0.08)",
              display: "grid",
              gap: 6,
            }}
          >
            <div>
              <strong>
                {app.freelancerFirstName || ""} {app.freelancerFamilyName || ""}
              </strong>{" "}
              <span style={{ opacity: 0.75 }}>({app.freelancerAccountId || app.freelancerUserId})</span>
            </div>
            <div style={{ fontSize: "0.9rem" }}>
              {isEn ? "Status" : "الحالة"}: <strong>{app.status}</strong>
              {" · "}
              {isEn ? "Access snapshot" : "لقطة الوصول"}: {app.membershipArticleAccessLevelSnapshot}
              {" · "}
              {isEn ? "Article level" : "مستوى المقال"}: {app.articleLevelSnapshot}
            </div>
            {app.bidEconomics ? (
              <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                {isEn ? "Bid economics" : "اقتصاد العرض"}:{" "}
                {app.bidEconomics.chargeStatus === "charged"
                  ? isEn
                    ? "charged · 1 Bid"
                    : "مخصوم · عرض واحد"
                  : app.bidEconomics.chargeStatus}
                {app.bidEconomics.refundStatus === "refunded"
                  ? isEn
                    ? ` · refunded${app.bidEconomics.refundMode ? ` (${app.bidEconomics.refundMode})` : ""}`
                    : ` · مسترد${app.bidEconomics.refundMode ? ` (${app.bidEconomics.refundMode})` : ""}`
                  : ""}
              </div>
            ) : null}
            {app.proposalMessage ? (
              <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>{app.proposalMessage}</p>
            ) : null}
            {app.status === "pending" ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Button
                  type="button"
                  disabled={busyId === app.id || !canSelectArticleApplicant(bidCollection)}
                  onClick={() => act(app.id, "select")}
                >
                  {isEn ? "Select" : "اختيار"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === app.id}
                  onClick={() => act(app.id, "reject")}
                >
                  {isEn ? "Reject" : "رفض"}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <FairSelectionOverrideDialog
        open={Boolean(overrideTargetId)}
        isEn={isEn}
        submitting={Boolean(busyId)}
        onCancel={() => setOverrideTargetId(null)}
        onConfirm={async (reason) => {
          const id = overrideTargetId;
          setOverrideTargetId(null);
          await act(id, "select", reason);
        }}
      />
    </section>
  );
}
