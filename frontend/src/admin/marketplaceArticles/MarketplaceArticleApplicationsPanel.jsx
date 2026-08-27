import { useCallback, useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import {
  listAdminArticleApplicationsRequest,
  rejectAdminArticleApplicationRequest,
  relistAdminMarketplaceArticleBidCollectionRequest,
  selectAdminArticleApplicationRequest,
  finalizeAdminArticleApplicationRequest,
  retryAdminArticleBildazoPublishRequest,
  requestAdminArticleRevisionRequest,
  runAdminArticleAutoAssignmentRequest,
  getAdminArticleBildazoPublishPreviewRequest,
} from "../../services/api";
import FairSelectionOverrideDialog from "./FairSelectionOverrideDialog";
import { getSafeApiErrorMessage } from "../../utils/apiErrorMessage";
import {
  canSelectArticleApplicant,
  canRelistBidCollection,
  formatArticleBidCollectionLabel,
  ARTICLE_FAIR_RANKING_DISCLAIMER_AR,
  ARTICLE_FAIR_RANKING_PENDING_AR,
  BILDAZO_AUTHOR_NOT_LINKED_AR,
  ARTICLE_WRITING_SOURCE_LABELS_AR,
  isFairRankingEligible,
  isRecommendedArticleApplicant,
  writingModeLabelAr,
} from "./marketplaceArticleFormUtils";
import { adminBildazoPublishCopy } from "../../constants/bildazoArticlePublish";
import { activationAssignmentErrorMessage } from "../../constants/freelancerActivationCampaign";
import { formatManuscriptTermsAdmin } from "../../constants/freelancerActivationEarnedBalance";
import {
  activationFairBadges,
  findFairRankingCandidate,
  isActivationFairRankingApplied,
} from "../../constants/freelancerActivationFairDistribution";

function ActivationFairBadges({ activationFairness, isEn }) {
  const badges = activationFairBadges(activationFairness, { isEn });
  if (!badges.length) return null;
  return (
    <div data-testid="activation-fair-badges" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {badges.map((badge) => (
        <span
          key={badge.tag}
          data-testid="activation-fair-reason-tag"
          style={{
            fontSize: "0.78rem",
            padding: "2px 8px",
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(0,0,0,0.04)",
          }}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function BildazoPublishPreviewBlock({ applicationId, attachedPreview, isEn }) {
  const [preview, setPreview] = useState(attachedPreview || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (attachedPreview) {
      setPreview(attachedPreview);
      return;
    }
    if (!applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void getAdminArticleBildazoPublishPreviewRequest(applicationId)
      .then((res) => {
        if (cancelled) return;
        setPreview(res?.data || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getSafeApiErrorMessage(err) || (isEn ? "Preview unavailable." : "تعذر تحميل المعاينة."));
        setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, attachedPreview, isEn]);

  if (loading) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem" }}>
        {isEn ? "Loading publish preview…" : "جارٍ تحميل معاينة النشر…"}
      </p>
    );
  }
  if (error) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem", color: "#b00020" }}>{error}</p>
    );
  }
  if (!preview) return null;

  const meta = preview.meta || {};
  const payload = preview.payload || {};
  const authorLinked = meta.authorLinked === true;

  return (
    <div data-testid="admin-bildazo-publish-preview" style={{ fontSize: "0.88rem", display: "grid", gap: 6 }}>
      <strong>{isEn ? "Bildazo publish preview" : "معاينة حمولة نشر بلدازو"}</strong>
      {!authorLinked ? (
        <p data-testid="admin-bildazo-author-warning" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>
          {meta.authorBlockMessage || BILDAZO_AUTHOR_NOT_LINKED_AR}
        </p>
      ) : null}
      <div>
        {isEn ? "Words" : "الكلمات"}: {meta.wordCount ?? "—"} / {meta.requiredWords ?? "—"}
        {" · "}
        {isEn ? "References" : "المراجع"}: {meta.referencesCount ?? "—"} / {meta.requiredReferences ?? "—"}
      </div>
      <div>
        {isEn ? "Writing source" : "طريقة الكتابة"}:{" "}
        {ARTICLE_WRITING_SOURCE_LABELS_AR[payload.writingSource] || payload.writingSource || "—"}
        {" · "}
        {isEn ? "Mode" : "النمط"}: {writingModeLabelAr(meta.writingMode)}
      </div>
      <div>
        {isEn ? "Category" : "الصنف"}: {meta.categoryName || "—"}
        {meta.categorySlug ? ` · ${meta.categorySlug}` : ""}
        {payload.categoryId ? ` · id ${payload.categoryId}` : ""}
      </div>
      <pre
        data-testid="admin-bildazo-publish-payload"
        style={{
          margin: 0,
          padding: 8,
          overflow: "auto",
          maxHeight: 160,
          background: "rgba(0,0,0,0.04)",
          fontSize: "0.75rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

export default function MarketplaceArticleApplicationsPanel({
  articleId,
  isEn = false,
  onToast,
  onRelisted,
}) {
  const [applications, setApplications] = useState([]);
  const [bidCollection, setBidCollection] = useState(null);
  const [fairRanking, setFairRanking] = useState(null);
  const [autoAssignment, setAutoAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [relisting, setRelisting] = useState(false);
  const [autoAssignBusy, setAutoAssignBusy] = useState(false);
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
      setAutoAssignment(res?.data?.autoAssignment || null);
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
      } else if (action === "finalize") {
        await finalizeAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: isEn ? "Article approved." : "تم اعتماد المقال.",
        });
      } else if (action === "retry-publish") {
        await retryAdminArticleBildazoPublishRequest(applicationId);
        onToast?.({
          type: "success",
          message: isEn ? "Bildazo publish retried." : "تمت إعادة محاولة النشر على Bildazo.",
        });
      } else if (action === "request-revision") {
        await requestAdminArticleRevisionRequest(applicationId, {});
        onToast?.({
          type: "success",
          message: isEn ? "Revision requested." : "تم طلب التعديل.",
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
        message:
          activationAssignmentErrorMessage(err, { isEn }) ||
          getSafeApiErrorMessage(err) ||
          (isEn ? "Action failed." : "فشل الإجراء."),
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
        data-testid="activation-auto-assign-panel"
        style={{
          margin: "0 0 14px",
          padding: 12,
          border: "1px solid rgba(0,0,0,0.08)",
          background: "rgba(0,0,0,0.02)",
        }}
      >
        <h5 style={{ margin: "0 0 8px" }}>
          {isEn ? "Automatic assignment (A9.3)" : "الإسناد التلقائي (A9.3)"}
        </h5>
        <p data-testid="activation-auto-assign-status" style={{ margin: "0 0 8px" }}>
          {isEn ? "Status" : "الحالة"}:{" "}
          <strong>
            {autoAssignment?.autoAssignedBadge
              ? isEn
                ? "auto-assigned"
                : "تم الإسناد تلقائيًا"
              : autoAssignment?.readiness?.status ||
                autoAssignment?.run?.status ||
                (isEn ? "disabled / unknown" : "معطّل / غير معروف")}
          </strong>
        </p>
        {autoAssignment?.run?.skipReason || autoAssignment?.run?.errorCode ? (
          <p data-testid="activation-auto-assign-skip-reason" style={{ margin: "0 0 8px", fontSize: "0.9rem" }}>
            {isEn ? "Reason" : "السبب"}:{" "}
            {autoAssignment.run.skipReason || autoAssignment.run.errorCode}
          </p>
        ) : null}
        {autoAssignment?.autoAssignedBadge ? (
          <p data-testid="activation-auto-assigned-badge" style={{ margin: "0 0 8px", fontWeight: 700 }}>
            {isEn ? "Assigned automatically" : "تم الإسناد تلقائيًا"}
          </p>
        ) : null}
        {(autoAssignment?.candidates || []).length > 0 ? (
          <div data-testid="activation-auto-assign-fairness-summary" style={{ marginBottom: 8 }}>
            <p style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
              {isEn ? "Admin fairness summary (weights)" : "ملخص العدالة للمشرف (الأوزان)"}
            </p>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "0.85rem" }}>
              {autoAssignment.candidates.slice(0, 12).map((c) => (
                <li key={c.id || c.applicationId}>
                  #{c.candidateRank || "—"} app {c.applicationId} · weight {c.weight}
                  {c.selected ? (isEn ? " · selected" : " · مختار") : ""}
                  {Array.isArray(c.reasonTags) && c.reasonTags.length
                    ? ` · ${c.reasonTags.join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {autoAssignment?.readiness?.status === "ready" ||
        (!autoAssignment?.autoAssignedBadge &&
          autoAssignment?.readiness?.status === "waiting_for_bidders") ? (
          <Button
            type="button"
            data-testid="activation-auto-assign-run-btn"
            disabled={autoAssignBusy || autoAssignment?.autoAssignedBadge}
            onClick={async () => {
              setAutoAssignBusy(true);
              try {
                await runAdminArticleAutoAssignmentRequest(articleId);
                onToast?.({
                  type: "success",
                  message: isEn ? "Auto-assignment run finished." : "اكتمل تشغيل التوزيع التلقائي.",
                });
                await refresh();
              } catch (err) {
                onToast?.({
                  type: "error",
                  message:
                    getSafeApiErrorMessage(err) ||
                    (isEn ? "Auto-assignment failed." : "فشل التوزيع التلقائي."),
                });
              } finally {
                setAutoAssignBusy(false);
              }
            }}
          >
            {isEn ? "Run auto assignment now" : "تشغيل التوزيع التلقائي الآن"}
          </Button>
        ) : null}
      </section>

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
                  {isActivationFairRankingApplied(fairRanking) ? (
                    <ActivationFairBadges activationFairness={c.activationFairness} isEn={isEn} />
                  ) : null}
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
        {applications.map((app) => {
          const showPreview =
            Boolean(app.articleSubmission) ||
            ["selected", "assigned", "approved", "accepted"].includes(String(app.status || ""));
          const publishStatus = String(app.bildazoPublish?.status || "");
          return (
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
                {autoAssignment?.autoAssignedBadge &&
                String(app.id) === String(autoAssignment?.run?.selectedApplicationId) ? (
                  <span
                    data-testid="activation-auto-assigned-app-badge"
                    style={{ marginInlineStart: 8, fontWeight: 700, fontSize: "0.85rem" }}
                  >
                    {isEn ? "Auto-assigned" : "تم الإسناد تلقائيًا"}
                  </span>
                ) : null}
              </div>
              {isActivationFairRankingApplied(fairRanking) ? (
                <ActivationFairBadges
                  activationFairness={findFairRankingCandidate(app.id, fairRanking)?.activationFairness}
                  isEn={isEn}
                />
              ) : null}
              {isActivationFairRankingApplied(fairRanking) &&
              app.status === "pending" &&
              !isRecommendedArticleApplicant(app.id, fairRanking) ? (
                <div data-testid="activation-fair-override-note" style={{ fontSize: "0.82rem", opacity: 0.75 }}>
                  {isEn
                    ? "Selecting this applicant overrides the preferred activation candidate."
                    : "اختيار هذا المتقدم يتجاوز المرشح المفضل للتفعيل."}
                </div>
              ) : null}
              <div style={{ fontSize: "0.9rem" }}>
                {isEn ? "Status" : "الحالة"}: <strong>{app.status}</strong>
                {" · "}
                {isEn ? "Access snapshot" : "لقطة الوصول"}: {app.membershipArticleAccessLevelSnapshot}
                {" · "}
                {isEn ? "Article level" : "مستوى المقال"}: {app.articleLevelSnapshot}
              </div>
              {(app.bildazoCategoryIdSnapshot ||
                app.bildazoCategoryNameSnapshot ||
                app.writingModeSnapshot ||
                app.requiredWordCountSnapshot != null) && (
                <div data-testid="admin-application-bildazo-snapshots" style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                  {isEn ? "Bildazo category" : "صنف بلدازو"}: {app.bildazoCategoryNameSnapshot || "—"}
                  {app.bildazoCategorySlugSnapshot ? ` · ${app.bildazoCategorySlugSnapshot}` : ""}
                  {app.bildazoCategoryIdSnapshot ? ` · id ${app.bildazoCategoryIdSnapshot}` : ""}
                  {" · "}
                  {isEn ? "Writing mode" : "نمط الكتابة"}: {writingModeLabelAr(app.writingModeSnapshot)}
                  {" · "}
                  {isEn ? "Words/refs" : "كلمات/مراجع"}: {app.requiredWordCountSnapshot ?? "—"} /{" "}
                  {app.requiredReferencesCountSnapshot ?? 0}
                </div>
              )}
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
                <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
                  {isEn ? "Proposal:" : "رسالة العرض:"} {app.proposalMessage}
                </p>
              ) : null}
              {app.articleSubmission ? (
                <div data-testid="admin-final-article-status" style={{ fontSize: "0.9rem" }}>
                  <strong>{isEn ? "Final manuscript" : "المقال النهائي"}:</strong>{" "}
                  {app.articleSubmission.status}
                  {app.articleSubmission.title ? ` · ${app.articleSubmission.title}` : ""}
                  <div style={{ fontSize: "0.82rem", opacity: 0.9 }}>
                    {isEn ? "Words" : "الكلمات"}: {app.articleSubmission.wordCount ?? "—"}
                    {" · "}
                    {isEn ? "References" : "المراجع"}: {app.articleSubmission.referencesCount ?? "—"}
                    {" · "}
                    {isEn ? "Writing source" : "طريقة الكتابة"}:{" "}
                    {ARTICLE_WRITING_SOURCE_LABELS_AR[app.articleSubmission.writingSource] ||
                      app.articleSubmission.writingSource ||
                      "—"}
                  </div>
                  <div data-testid="admin-submission-terms" style={{ fontSize: "0.82rem", opacity: 0.85 }}>
                    {formatManuscriptTermsAdmin(app.articleSubmission, { isEn })}
                  </div>
                </div>
              ) : app.status === "selected" || app.status === "assigned" ? (
                <p data-testid="admin-final-article-missing" style={{ margin: 0, fontSize: "0.9rem" }}>
                  {isEn
                    ? "Waiting for the freelancer’s final article."
                    : "بانتظار تسليم المقال النهائي من المستقل."}
                </p>
              ) : null}
              {app.bildazoPublish ? (
                <div data-testid="admin-bildazo-publish-status" style={{ fontSize: "0.9rem" }}>
                  {adminBildazoPublishCopy(app.bildazoPublish, isEn)}
                  {publishStatus === "needs_manual_review" ? (
                    <span data-testid="admin-bildazo-needs-manual-review">
                      {" · "}
                      {isEn ? "Needs manual review" : "يحتاج مراجعة يدوية"}
                    </span>
                  ) : null}
                  {publishStatus === "failed" ? (
                    <span data-testid="admin-bildazo-publish-failed" style={{ color: "#b42318" }}>
                      {" · "}
                      {isEn ? "Publish failed" : "فشل النشر"}
                    </span>
                  ) : null}
                  {app.bildazoPublish.articleUrl ? (
                    <>
                      {" · "}
                      <a href={app.bildazoPublish.articleUrl} target="_blank" rel="noreferrer">
                        {app.bildazoPublish.articleUrl}
                      </a>
                    </>
                  ) : null}
                </div>
              ) : null}
              {showPreview ? (
                <BildazoPublishPreviewBlock
                  applicationId={app.id}
                  attachedPreview={app.bildazoPublishPreview || null}
                  isEn={isEn}
                />
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
              {app.status === "selected" || app.status === "assigned" ? (
                <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.8 }}>
                  {isEn
                    ? "Approve is available after the final article is submitted."
                    : "الاعتماد متاح بعد تسليم المقال النهائي."}
                </p>
              ) : null}
              {app.articleSubmission?.status === "submitted" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button type="button" disabled={busyId === app.id} onClick={() => act(app.id, "finalize")}>
                    {isEn ? "Approve article" : "اعتماد المقال"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === app.id}
                    onClick={() => act(app.id, "request-revision")}
                  >
                    {isEn ? "Request revision" : "طلب تعديل"}
                  </Button>
                </div>
              ) : null}
              {app.bildazoPublish?.canRetry ? (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === app.id}
                    onClick={() => act(app.id, "retry-publish")}
                  >
                    {isEn ? "Retry Bildazo publish" : "إعادة نشر Bildazo"}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <FairSelectionOverrideDialog
        open={Boolean(overrideTargetId)}
        isEn={isEn}
        submitting={Boolean(busyId)}
        activationOverride={isActivationFairRankingApplied(fairRanking)}
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
