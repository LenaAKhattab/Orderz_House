import { Link } from "react-router-dom";
import { formatMoneyJod, formatJoDateMedium } from "../../../../utils/freelancerDashboardData";
import WidgetLoadError from "./WidgetLoadError";

function claimStatusAr(status) {
  const s = String(status || "");
  if (s === "paid") return "مدفوعة";
  if (s === "pending") return "قيد المراجعة";
  if (s === "accepted") return "مقبولة";
  if (s === "requires_in_person_review") return "مراجعة حضورية";
  return s || "—";
}

export default function EarningsSummaryCard({ summary, loadState = "ok", loadError = "", onRetry, loading }) {
  if (loading) {
    return (
      <article className="fdash-cc-card fdash-cc-card--earnings">
        <div className="fdash-cc-skel" style={{ height: 120 }} />
      </article>
    );
  }

  const failed = loadState === "error";

  return (
    <article className="fdash-cc-card fdash-cc-card--earnings">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">المستحقات والمحفظة</h3>
        <Link to="/dashboard/freelancer/financial-claims" className="fdash-cc-card__link">
          المحفظة
        </Link>
      </header>
      {failed ? (
        <WidgetLoadError
          message={loadError || "تعذر تحميل المستحقات. لن نعرض أرقاماً قد تكون مضللة."}
          onRetry={onRetry}
        />
      ) : (
        <>
          <p className="fdash-cc-card__note">
            الأرقام من مطالباتك المالية المعتمدة — وليست قيمة الطلبات على المنصة.
          </p>
          <div className="fdash-cc-metrics fdash-cc-metrics--3">
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">مدفوع</span>
              <strong className="fdash-cc-metric__value">{formatMoneyJod(summary?.paidTotalJod)} JOD</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">مستحق / معلّق</span>
              <strong className="fdash-cc-metric__value">{formatMoneyJod(summary?.pendingTotalJod)} JOD</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">مطالبات مفتوحة</span>
              <strong className="fdash-cc-metric__value">{summary?.openClaimsCount ?? 0}</strong>
            </div>
          </div>
          {summary?.latestClaim ? (
            <div className="fdash-cc-card__footer">
              <span className="fdash-cc-card__muted">آخر مطالبة</span>
              <p className="fdash-cc-card__line">
                {summary.latestClaim.requestTitle || summary.latestClaim.orderNumber || "—"} ·{" "}
                {claimStatusAr(summary.latestClaim.status)} ·{" "}
                {formatJoDateMedium(summary.latestClaim.updatedAt)}
              </p>
            </div>
          ) : (
            <p className="fdash-cc-card__muted">لا توجد مطالبات مالية بعد.</p>
          )}
        </>
      )}
    </article>
  );
}
