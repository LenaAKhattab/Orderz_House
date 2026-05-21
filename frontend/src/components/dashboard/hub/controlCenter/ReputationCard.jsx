import { Link } from "react-router-dom";

export default function ReputationCard({ reputation, loading }) {
  if (loading) {
    return (
      <article className="fdash-cc-card">
        <div className="fdash-cc-skel" style={{ height: 140 }} />
      </article>
    );
  }

  const rep = reputation || { trustScore: 0, trustLevelAr: "مبتدئ", factors: [] };
  const score = Math.min(100, Math.max(0, Number(rep.trustScore) || 0));

  return (
    <article className="fdash-cc-card fdash-cc-card--growth fdash-cc-card--reputation">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">مؤشر الثقة</h3>
        <span className="fdash-growth-level">{rep.trustLevelAr || "—"}</span>
      </header>
      <div className="fdash-growth-score">
        <strong className="fdash-growth-score__value">{score}</strong>
        <span className="fdash-growth-score__max">/ 100</span>
      </div>
      <div className="fdash-growth-bar" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100}>
        <span className="fdash-growth-bar__fill" style={{ width: `${score}%` }} />
      </div>
      <p className="fdash-cc-card__note">يُحسب من إنجازاتك الحقيقية على المنصة — وليس تقييمات وهمية.</p>
      {rep.factors?.length > 0 ? (
        <ul className="fdash-growth-factors">
          {rep.factors.slice(0, 4).map((f) => (
            <li key={f.key}>
              <span>{f.labelAr}</span>
              <span className="fdash-growth-factors__pts">+{f.impact}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fdash-cc-card__muted">أكمل طلباتك وملفك لرفع مستوى الثقة.</p>
      )}
      <Link to="/dashboard/freelancer/settings" className="fdash-cc-card__link fdash-cc-card__link--block">
        تحسين الملف والحضور
      </Link>
    </article>
  );
}
