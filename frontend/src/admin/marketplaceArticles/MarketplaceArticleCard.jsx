import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import {
  formatArticleBidCollectionLabel,
  formatActivationAttachmentBadge,
  writingModeLabel,
  normalizePackagePlanCode,
  planCodeFromArticleLevel,
} from "./marketplaceArticleFormUtils";
import { formatActivationBudgetState } from "../../constants/freelancerActivationCampaign";
import { useArticlesT } from "./useArticlesT";

export default function MarketplaceArticleCard({
  article,
  onEdit,
  busy = false,
  activationCampaigns = [],
}) {
  const { t, locale } = useArticlesT();
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
    ? `${planCode}${t(`planLabels.${planCode}`) ? ` / ${t(`planLabels.${planCode}`)}` : ""}`
    : t("common.notSet");
  const bildazoLabel =
    article.bildazoCategoryName ||
    article.bildazoCategoryPath ||
    article.bildazoCategorySlug ||
    t("common.notSet");
  const writingLabel = article.writingMode
    ? writingModeLabel(article.writingMode, { locale })
    : t("common.notSet");

  return (
    <article className={`oh-mmp-card${article.status === "published" ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{article.title}</h3>
          <p className="oh-mmp-card__tier" data-testid="article-card-target-plan">
            {t("common.planColon", { label: planLabel })}
          </p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={article.status === "published" ? "success" : "neutral"}>
            {article.status}
          </StatusBadge>
          {article.isFakeOrTraining ? (
            <StatusBadge tone="warning">{t("common.training")}</StatusBadge>
          ) : null}
          {article.activationCampaignId ? (
            <span data-testid="activation-attachment-badge">
              <StatusBadge tone="neutral">
                {formatActivationAttachmentBadge(article, activationCampaigns, { locale }) ||
                  t("common.activation")}
              </StatusBadge>
            </span>
          ) : null}
          {article.activationCampaignId && article.activationBudgetState ? (
            <span data-testid="activation-budget-state-badge">
              <StatusBadge tone={article.activationBudgetState === "used" ? "success" : "neutral"}>
                {formatActivationBudgetState(article.activationBudgetState, {
                  isEn: locale === "en",
                })}
              </StatusBadge>
            </span>
          ) : null}
        </div>
      </header>

      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{t("card.bildazoCategory")}</dt>
          <dd data-testid="article-card-bildazo-category">{bildazoLabel}</dd>
        </div>
        <div>
          <dt>{t("card.writingMode")}</dt>
          <dd data-testid="article-card-writing-mode">{writingLabel}</dd>
        </div>
        <div>
          <dt>{t("card.words")}</dt>
          <dd>{article.requiredWordCount ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("card.references")}</dt>
          <dd>{article.requiredReferencesCount ?? 0}</dd>
        </div>
        <div>
          <dt>{t("card.value")}</dt>
          <dd>
            {value} {locale === "en" ? t("common.jod") : t("common.jod")}
          </dd>
        </div>
        <div>
          <dt>{t("card.applicants")}</dt>
          <dd>
            {formatArticleBidCollectionLabel(article.bidCollection, {
              locale,
              articleStatus: article.status,
            }) ||
              (article.requiredBidCount
                ? t("common.required", { count: article.requiredBidCount })
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
          {t("card.edit")}
        </Button>
      </footer>
    </article>
  );
}
