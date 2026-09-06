import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import {
  formatArticleBidCollectionLabel,
  formatActivationAttachmentBadge,
  writingModeLabelAr,
  normalizePackagePlanCode,
  ARTICLE_PACKAGE_PLAN_LABELS_AR,
  planCodeFromArticleLevel,
} from "./marketplaceArticleFormUtils";
import { formatActivationBudgetState } from "../../constants/freelancerActivationCampaign";

export default function MarketplaceArticleCard({
  article,
  isEn = false,
  onEdit,
  busy = false,
  activationCampaigns = [],
}) {
  if (!article) return null;
  const value =
    article.articleValueJod != null
      ? Number(article.articleValueJod).toFixed(3)
      : String(article.articleLevel ?? "");
  const planCode =
    normalizePackagePlanCode(article.activationPlanTierCode) ||
    planCodeFromArticleLevel(article.articleLevel) ||
    "";
  const planLabel = planCode
    ? `${planCode}${ARTICLE_PACKAGE_PLAN_LABELS_AR[planCode] ? ` / ${ARTICLE_PACKAGE_PLAN_LABELS_AR[planCode]}` : ""}`
    : isEn
      ? "Not set"
      : "غير محدد";
  const bildazoLabel =
    article.bildazoCategoryName ||
    article.bildazoCategoryPath ||
    article.bildazoCategorySlug ||
    (isEn ? "Not set" : "غير محدد");
  const writingLabel = article.writingMode
    ? writingModeLabelAr(article.writingMode)
    : isEn
      ? "Not set"
      : "غير محدد";

  return (
    <article className={`oh-mmp-card${article.status === "published" ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{article.title}</h3>
          <p className="oh-mmp-card__tier" data-testid="article-card-target-plan">
            {isEn ? `Plan: ${planLabel}` : `الخطة: ${planLabel}`}
          </p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={article.status === "published" ? "success" : "neutral"}>
            {article.status}
          </StatusBadge>
          {article.isFakeOrTraining ? (
            <StatusBadge tone="warning">{isEn ? "Training" : "تدريب"}</StatusBadge>
          ) : null}
          {article.activationCampaignId ? (
            <span data-testid="activation-attachment-badge">
              <StatusBadge tone="neutral">
                {formatActivationAttachmentBadge(article, activationCampaigns, { isEn }) ||
                  (isEn ? "Activation" : "تفعيل")}
              </StatusBadge>
            </span>
          ) : null}
          {article.activationCampaignId && article.activationBudgetState ? (
            <span data-testid="activation-budget-state-badge">
              <StatusBadge tone={article.activationBudgetState === "used" ? "success" : "neutral"}>
                {formatActivationBudgetState(article.activationBudgetState, { isEn })}
              </StatusBadge>
            </span>
          ) : null}
        </div>
      </header>

      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{isEn ? "Bildazo category" : "صنف بلدازو"}</dt>
          <dd data-testid="article-card-bildazo-category">{bildazoLabel}</dd>
        </div>
        <div>
          <dt>{isEn ? "Writing mode" : "نمط الكتابة"}</dt>
          <dd data-testid="article-card-writing-mode">{writingLabel}</dd>
        </div>
        <div>
          <dt>{isEn ? "Words" : "الكلمات"}</dt>
          <dd>{article.requiredWordCount ?? "—"}</dd>
        </div>
        <div>
          <dt>{isEn ? "References" : "المراجع"}</dt>
          <dd>{article.requiredReferencesCount ?? 0}</dd>
        </div>
        <div>
          <dt>{isEn ? "Value" : "القيمة"}</dt>
          <dd>
            {value} {isEn ? "JOD" : "د.أ"}
          </dd>
        </div>
        <div>
          <dt>{isEn ? "Applicants" : "المتقدمون"}</dt>
          <dd>
            {formatArticleBidCollectionLabel(article.bidCollection, {
              isEn,
              articleStatus: article.status,
            }) ||
              (article.requiredBidCount
                ? isEn
                  ? `Required: ${article.requiredBidCount}`
                  : `المطلوب: ${article.requiredBidCount}`
                : "—")}
          </dd>
        </div>
      </dl>

      {article.description ? (
        <p style={{ margin: "8px 0 0", opacity: 0.85, fontSize: "0.92rem" }}>
          {article.description.length > 160 ? `${article.description.slice(0, 160)}…` : article.description}
        </p>
      ) : null}

      <footer className="oh-mmp-card__actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => onEdit?.(article)}>
          {isEn ? "Edit" : "تعديل"}
        </Button>
      </footer>
    </article>
  );
}
