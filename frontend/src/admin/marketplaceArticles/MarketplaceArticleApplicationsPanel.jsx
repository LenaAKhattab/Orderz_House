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
import { useArticlesT } from "./useArticlesT";
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

function ActivationFairBadges({ activationFairness, locale }) {
  const badges = activationFairBadges(activationFairness, { isEn: locale === "en" });
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

function BildazoPublishPreviewBlock({ applicationId, attachedPreview, t, locale }) {
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
        setError(getSafeApiErrorMessage(err) || t("applications.previewUnavailable"));
        setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, attachedPreview, t]);

  if (loading) {
    return (
      <p style={{ margin: 0, fontSize: "0.85rem" }}>
        {t("applications.previewLoading")}
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
      <strong>{t("applications.bildazoPreviewTitle")}</strong>
      {!authorLinked ? (
        <p data-testid="admin-bildazo-author-warning" style={{ margin: 0, color: "#b42318", fontWeight: 700 }}>
          {meta.authorBlockMessage || t("applications.authorNotLinked")}
        </p>
      ) : null}
      <div>
        {t("common.words")}: {meta.wordCount ?? "—"} / {meta.requiredWords ?? "—"}
        {" · "}
        {t("common.references")}: {meta.referencesCount ?? "—"} / {meta.requiredReferences ?? "—"}
      </div>
      <div>
        {t("common.writingSource")}:{" "}
        {t(`writingSources.${payload.writingSource}`) || payload.writingSource || "—"}
        {" · "}
        {t("common.mode")}: {writingModeLabelAr(meta.writingMode)}
      </div>
      <div>
        {t("common.category")}: {meta.categoryName || "—"}
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
  onToast,
  onRelisted,
}) {
  const { t, locale } = useArticlesT();
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
          t("applications.loadError"),
      );
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }, [articleId, t]);

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
          message: t("applications.selectSuccess"),
        });
      } else if (action === "finalize") {
        await finalizeAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: t("applications.approveSuccess"),
        });
      } else if (action === "retry-publish") {
        await retryAdminArticleBildazoPublishRequest(applicationId);
        onToast?.({
          type: "success",
          message: t("applications.retryPublishSuccess"),
        });
      } else if (action === "request-revision") {
        await requestAdminArticleRevisionRequest(applicationId, {});
        onToast?.({
          type: "success",
          message: t("applications.revisionSuccess"),
        });
      } else {
        await rejectAdminArticleApplicationRequest(applicationId);
        onToast?.({
          type: "success",
          message: t("applications.rejectSuccess"),
        });
      }
      await refresh();
    } catch (err) {
      onToast?.({
        type: "error",
        message:
          activationAssignmentErrorMessage(err, { isEn: locale === "en" }) ||
          getSafeApiErrorMessage(err) ||
          t("applications.actionFailed"),
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
        message: t("applications.relistSuccess"),
      });
      await refresh();
      await onRelisted?.();
    } catch (err) {
      onToast?.({
        type: "error",
        message: getSafeApiErrorMessage(err) || t("applications.relistFailed"),
      });
    } finally {
      setRelisting(false);
    }
  };

  if (!articleId) return null;

  return (
    <section style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid rgba(0,0,0,0.08)" }}>
      <h4 style={{ margin: "0 0 8px" }}>
        {t("applications.title")}
        {!loading ? ` (${applications.length})` : ""}
      </h4>
      {formatArticleBidCollectionLabel(bidCollection, { locale }) ? (
        <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
          {formatArticleBidCollectionLabel(bidCollection, { locale })}
        </p>
      ) : null}
      {canRelistBidCollection(bidCollection) ? (
        <div data-testid="article-relist-bid-collection" style={{ margin: "0 0 12px" }}>
          <p style={{ margin: "0 0 8px", fontSize: "0.92rem" }}>
            {t("applications.relistHint")}
          </p>
          <Button type="button" onClick={relist} disabled={relisting}>
            {t("applications.relistAuction")}
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
          {t("applications.autoAssignTitle")}
        </h5>
        <p data-testid="activation-auto-assign-status" style={{ margin: "0 0 8px" }}>
          {t("common.status")}:{" "}
          <strong>
            {autoAssignment?.autoAssignedBadge
              ? t("applications.autoAssignedStatus")
              : autoAssignment?.readiness?.status ||
                autoAssignment?.run?.status ||
                t("applications.disabledUnknown")}
          </strong>
        </p>
        {autoAssignment?.run?.skipReason || autoAssignment?.run?.errorCode ? (
          <p data-testid="activation-auto-assign-skip-reason" style={{ margin: "0 0 8px", fontSize: "0.9rem" }}>
            {t("applications.reason")}:{" "}
            {autoAssignment.run.skipReason || autoAssignment.run.errorCode}
          </p>
        ) : null}
        {autoAssignment?.autoAssignedBadge ? (
          <p data-testid="activation-auto-assigned-badge" style={{ margin: "0 0 8px", fontWeight: 700 }}>
            {t("applications.autoAssigned")}
          </p>
        ) : null}
        {(autoAssignment?.candidates || []).length > 0 ? (
          <div data-testid="activation-auto-assign-fairness-summary" style={{ marginBottom: 8 }}>
            <p style={{ margin: "0 0 6px", fontSize: "0.9rem" }}>
              {t("applications.fairSummary")}
            </p>
            <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: "0.85rem" }}>
              {autoAssignment.candidates.slice(0, 12).map((c) => (
                <li key={c.id || c.applicationId}>
                  #{c.candidateRank || "—"} app {c.applicationId} · weight {c.weight}
                  {c.selected ? t("applications.selected") : ""}
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
                  message: t("applications.autoAssignDone"),
                });
                await refresh();
              } catch (err) {
                onToast?.({
                  type: "error",
                  message:
                    getSafeApiErrorMessage(err) ||
                    t("applications.autoAssignFailed"),
                });
              } finally {
                setAutoAssignBusy(false);
              }
            }}
          >
            {t("applications.runAutoAssign")}
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
          {t("applications.fairRankingTitle")}
        </h5>
        {!isFairRankingEligible(fairRanking) ? (
          <p style={{ margin: 0, opacity: 0.8 }}>
            {locale === "ar" && fairRanking?.messageAr
              ? fairRanking.messageAr
              : fairRanking?.messageEn || t("applications.fairRankingPending")}
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 10px", fontSize: "0.92rem" }}>
              {t("applications.fairRankingDisclaimer")}
            </p>
            <ol style={{ margin: 0, paddingInlineStart: 20, display: "grid", gap: 8 }}>
              {(fairRanking.candidates || []).map((c) => (
                <li key={c.applicationId}>
                  <strong>
                    #{c.rank} {c.freelancerName || c.freelancerUserId}
                    {String(c.applicationId) === String(fairRanking.recommendedApplicationId)
                      ? t("applications.recommended")
                      : ""}
                  </strong>
                  <div style={{ fontSize: "0.88rem", opacity: 0.85 }}>
                    {t("common.status")}: {c.status}
                    {c.submittedAt ? ` · ${new Date(c.submittedAt).toLocaleString()}` : ""}
                    {c.rankingReason
                      ? ` · ${locale === "en" ? c.rankingReasonEn || c.rankingReason : c.rankingReason}`
                      : ""}
                  </div>
                  {isActivationFairRankingApplied(fairRanking) ? (
                    <ActivationFairBadges activationFairness={c.activationFairness} locale={locale} />
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </section>
      {loading ? <p style={{ opacity: 0.75 }}>{t("common.loading")}</p> : null}
      {error ? <p style={{ color: "#b00020" }}>{error}</p> : null}
      {!loading && !error && applications.length === 0 ? (
        <p style={{ opacity: 0.75, margin: 0 }}>
          {t("applications.noApplications")}
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
                    {t("applications.autoAssigned")}
                  </span>
                ) : null}
              </div>
              {isActivationFairRankingApplied(fairRanking) ? (
                <ActivationFairBadges
                  activationFairness={findFairRankingCandidate(app.id, fairRanking)?.activationFairness}
                  locale={locale}
                />
              ) : null}
              {isActivationFairRankingApplied(fairRanking) &&
              app.status === "pending" &&
              !isRecommendedArticleApplicant(app.id, fairRanking) ? (
                <div data-testid="activation-fair-override-note" style={{ fontSize: "0.82rem", opacity: 0.75 }}>
                  {t("applications.overrideNote")}
                </div>
              ) : null}
              <div style={{ fontSize: "0.9rem" }}>
                {t("common.status")}: <strong>{app.status}</strong>
                {" · "}
                {t("applications.accessSnapshot")}: {app.membershipArticleAccessLevelSnapshot}
                {" · "}
                {t("applications.articleLevel")}: {app.articleLevelSnapshot}
              </div>
              {(app.bildazoCategoryIdSnapshot ||
                app.bildazoCategoryNameSnapshot ||
                app.writingModeSnapshot ||
                app.requiredWordCountSnapshot != null) && (
                <div data-testid="admin-application-bildazo-snapshots" style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                  {t("common.bildazoCategory")}: {app.bildazoCategoryNameSnapshot || "—"}
                  {app.bildazoCategorySlugSnapshot ? ` · ${app.bildazoCategorySlugSnapshot}` : ""}
                  {app.bildazoCategoryIdSnapshot ? ` · id ${app.bildazoCategoryIdSnapshot}` : ""}
                  {" · "}
                  {t("common.writingMode")}: {writingModeLabelAr(app.writingModeSnapshot)}
                  {" · "}
                  {t("applications.wordsRefs")}: {app.requiredWordCountSnapshot ?? "—"} /{" "}
                  {app.requiredReferencesCountSnapshot ?? 0}
                </div>
              )}
              {app.bidEconomics ? (
                <div style={{ fontSize: "0.85rem", opacity: 0.9 }}>
                  {t("applications.bidEconomics")}:{" "}
                  {app.bidEconomics.chargeStatus === "charged"
                    ? t("applications.charged")
                    : app.bidEconomics.chargeStatus}
                  {app.bidEconomics.refundStatus === "refunded"
                    ? `${t("applications.refunded")}${app.bidEconomics.refundMode ? ` (${app.bidEconomics.refundMode})` : ""}`
                    : ""}
                </div>
              ) : null}
              {app.proposalMessage ? (
                <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
                  {t("applications.proposal")} {app.proposalMessage}
                </p>
              ) : null}
              {app.articleSubmission ? (
                <div data-testid="admin-final-article-status" style={{ fontSize: "0.9rem" }}>
                  <strong>{t("applications.finalManuscript")}:</strong>{" "}
                  {app.articleSubmission.status}
                  {app.articleSubmission.title ? ` · ${app.articleSubmission.title}` : ""}
                  <div style={{ fontSize: "0.82rem", opacity: 0.9 }}>
                    {t("common.words")}: {app.articleSubmission.wordCount ?? "—"}
                    {" · "}
                    {t("common.references")}: {app.articleSubmission.referencesCount ?? "—"}
                    {" · "}
                    {t("common.writingSource")}:{" "}
                    {t(`writingSources.${app.articleSubmission.writingSource}`) ||
                      app.articleSubmission.writingSource ||
                      "—"}
                  </div>
                  <div data-testid="admin-submission-terms" style={{ fontSize: "0.82rem", opacity: 0.85 }}>
                    {formatManuscriptTermsAdmin(app.articleSubmission, { isEn: locale === "en" })}
                  </div>
                </div>
              ) : app.status === "selected" || app.status === "assigned" ? (
                <p data-testid="admin-final-article-missing" style={{ margin: 0, fontSize: "0.9rem" }}>
                  {t("applications.waitingFinal")}
                </p>
              ) : null}
              {app.bildazoPublish ? (
                <div data-testid="admin-bildazo-publish-status" style={{ fontSize: "0.9rem" }}>
                  {adminBildazoPublishCopy(app.bildazoPublish, locale === "en")}
                  {publishStatus === "needs_manual_review" ? (
                    <span data-testid="admin-bildazo-needs-manual-review">
                      {" · "}
                      {t("applications.needsManualReview")}
                    </span>
                  ) : null}
                  {publishStatus === "failed" ? (
                    <span data-testid="admin-bildazo-publish-failed" style={{ color: "#b42318" }}>
                      {" · "}
                      {t("applications.publishFailed")}
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
                  t={t}
                  locale={locale}
                />
              ) : null}
              {app.status === "pending" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    disabled={busyId === app.id || !canSelectArticleApplicant(bidCollection)}
                    onClick={() => act(app.id, "select")}
                  >
                    {t("applications.select")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === app.id}
                    onClick={() => act(app.id, "reject")}
                  >
                    {t("applications.reject")}
                  </Button>
                </div>
              ) : null}
              {app.status === "selected" || app.status === "assigned" ? (
                <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.8 }}>
                  {t("applications.approveAfterSubmit")}
                </p>
              ) : null}
              {app.articleSubmission?.status === "submitted" ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button type="button" disabled={busyId === app.id} onClick={() => act(app.id, "finalize")}>
                    {t("applications.approveArticle")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busyId === app.id}
                    onClick={() => act(app.id, "request-revision")}
                  >
                    {t("applications.requestRevision")}
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
                    {t("applications.retryBildazo")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <FairSelectionOverrideDialog
        open={Boolean(overrideTargetId)}
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
