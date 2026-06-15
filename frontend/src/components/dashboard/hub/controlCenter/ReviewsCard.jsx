import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { getLocalizedField } from "../../../../lib/i18n/getLocalizedField";

function formatRating(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(1);
}

function StarsDisplay({ rating, size = "md" }) {
  const r = Math.round(Number(rating) || 0);
  return (
    <span className={`fdash-review-stars fdash-review-stars--${size}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= r ? "is-on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}

function DistributionBars({ distribution = {}, total: _total = 0 }) {
  const dist = distribution || {};
  const max = Math.max(1, ...[1, 2, 3, 4, 5].map((k) => Number(dist[k] || 0)));
  return (
    <ul className="fdash-review-dist">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = Number(dist[star] || 0);
        return (
          <li key={star}>
            <span className="fdash-review-dist__label">{star}★</span>
            <span className="fdash-review-dist__bar">
              <span className="fdash-review-dist__fill" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="fdash-review-dist__count">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function ReviewsCard({ reviews, loadState = "ok", loadError = "", onRetry, loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 140 }} />
      </article>
    );
  }

  if (loadState === "error") {
    return (
      <article className="fdash-cc-card fdash-cc-card--reviews">
        <header className="fdash-cc-card__head">
          <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.reviews.title")}</h3>
        </header>
        <p className="fdash-cc-card__muted">{loadError || t("freelancerDashboard.controlCenter.reviews.loadError")}</p>
        {onRetry ? (
          <button type="button" className="fdash-cc-btn fdash-cc-btn--sm" onClick={onRetry}>
            {t("freelancerDashboard.common.retry")}
          </button>
        ) : null}
      </article>
    );
  }

  const r = reviews || {};
  const total = Number(r.totalReviews || 0);
  const empty = !r.available || total === 0;
  const emptyMessage =
    getLocalizedField(r, "message", locale) || t("freelancerDashboard.controlCenter.reviews.empty");

  return (
    <article className="fdash-cc-card fdash-cc-card--growth fdash-cc-card--reviews">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.reviews.title")}</h3>
        <Link to="/dashboard/freelancer/profile" className="fdash-cc-card__link">
          {t("freelancerDashboard.controlCenter.reviews.viewAll")}
        </Link>
      </header>

      {empty ? (
        <p className="fdash-cc-card__muted">{emptyMessage}</p>
      ) : (
        <>
          <div className="fdash-review-summary">
            <div className="fdash-review-summary__score">
              <strong>{formatRating(r.averageRating)}</strong>
              <StarsDisplay rating={r.averageRating} size="lg" />
              <span className="fdash-cc-card__muted">
                {t("freelancerDashboard.controlCenter.reviews.reviewCount", { count: total })}
              </span>
            </div>
            <DistributionBars distribution={r.ratingDistribution} total={total} />
          </div>
          {r.recommendationRate != null ? (
            <p className="fdash-cc-card__line">
              {t("freelancerDashboard.controlCenter.reviews.recommendationRate", {
                rate: r.recommendationRate,
              })}
            </p>
          ) : null}
          {r.latestReviews?.length > 0 ? (
            <ul className="fdash-review-latest">
              {r.latestReviews.map((rev) => (
                <li key={rev.id}>
                  <div className="fdash-review-latest__head">
                    <StarsDisplay rating={rev.rating} size="sm" />
                    <span className="fdash-review-latest__who">
                      {rev.clientLabel || t("freelancerDashboard.controlCenter.reviews.client")}
                    </span>
                  </div>
                  {rev.reviewText ? <p>{rev.reviewText}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </article>
  );
}
