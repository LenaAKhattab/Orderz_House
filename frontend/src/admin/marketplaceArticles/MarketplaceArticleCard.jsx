import StatusBadge from "../../components/dashboard/StatusBadge";
import Button from "../../components/ui/Button";
import { formatArticleBidCollectionLabel } from "./marketplaceArticleFormUtils";

export default function MarketplaceArticleCard({ article, isEn = false, onEdit, busy = false }) {
  if (!article) return null;
  const value =
    article.articleValueJod != null
      ? Number(article.articleValueJod).toFixed(3)
      : String(article.articleLevel ?? "");

  return (
    <article className={`oh-mmp-card${article.status === "published" ? "" : " oh-mmp-card--inactive"}`}>
      <header className="oh-mmp-card__header">
        <div className="oh-mmp-card__titles">
          <h3 className="oh-mmp-card__title">{article.title}</h3>
          <p className="oh-mmp-card__tier">
            {isEn ? `Level ${article.articleLevel}` : `المستوى ${article.articleLevel}`}
          </p>
        </div>
        <div className="oh-mmp-card__badges">
          <StatusBadge tone={article.status === "published" ? "success" : "neutral"}>
            {article.status}
          </StatusBadge>
          {article.isFakeOrTraining ? (
            <StatusBadge tone="warning">{isEn ? "Training" : "تدريب"}</StatusBadge>
          ) : null}
        </div>
      </header>

      <dl className="oh-mmp-card__meta">
        <div>
          <dt>{isEn ? "Value" : "القيمة"}</dt>
          <dd>
            {value} {isEn ? "JOD" : "د.أ"}
          </dd>
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
        <div>
          <dt>{isEn ? "Category" : "التصنيف"}</dt>
          <dd>{article.category?.name || "—"}</dd>
        </div>
        <div>
          <dt>{isEn ? "Subcategory" : "الفرعي"}</dt>
          <dd>{article.subcategory?.name || "—"}</dd>
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
