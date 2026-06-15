import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { formatMoneyJod, formatJoDateMedium } from "../../../../utils/freelancerDashboardData";
import WidgetLoadError from "./WidgetLoadError";

function claimStatusLabel(status, t) {
  const s = String(status || "");
  if (s === "paid") return t("freelancerDashboard.status.claim.paid");
  if (s === "pending") return t("freelancerDashboard.status.claim.pending");
  if (s === "accepted") return t("freelancerDashboard.status.claim.accepted");
  if (s === "requires_in_person_review") return t("freelancerDashboard.status.claim.requiresInPersonReview");
  return s || t("freelancerDashboard.common.emDash");
}

export default function EarningsSummaryCard({ summary, loadState = "ok", loadError = "", onRetry, loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card fdash-cc-card--earnings">
        <div className="fdash-cc-skel" style={{ height: 120 }} />
      </article>
    );
  }

  const failed = loadState === "error";
  const emDash = t("freelancerDashboard.common.emDash");

  return (
    <article className="fdash-cc-card fdash-cc-card--earnings">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.earnings.title")}</h3>
        <Link to="/dashboard/freelancer/financial-claims" className="fdash-cc-card__link">
          {t("freelancerDashboard.controlCenter.earnings.wallet")}
        </Link>
      </header>
      {failed ? (
        <WidgetLoadError
          message={loadError || t("freelancerDashboard.controlCenter.earnings.loadError")}
          onRetry={onRetry}
        />
      ) : (
        <>
          <p className="fdash-cc-card__note">{t("freelancerDashboard.controlCenter.earnings.note")}</p>
          <div className="fdash-cc-metrics fdash-cc-metrics--3">
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.earnings.paid")}</span>
              <strong className="fdash-cc-metric__value">{formatMoneyJod(summary?.paidTotalJod)} JOD</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.earnings.pending")}</span>
              <strong className="fdash-cc-metric__value">{formatMoneyJod(summary?.pendingTotalJod)} JOD</strong>
            </div>
            <div className="fdash-cc-metric">
              <span className="fdash-cc-metric__label">{t("freelancerDashboard.controlCenter.earnings.openClaims")}</span>
              <strong className="fdash-cc-metric__value">{summary?.openClaimsCount ?? 0}</strong>
            </div>
          </div>
          {summary?.latestClaim ? (
            <div className="fdash-cc-card__footer">
              <span className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.earnings.latestClaim")}</span>
              <p className="fdash-cc-card__line">
                {summary.latestClaim.requestTitle || summary.latestClaim.orderNumber || emDash} ·{" "}
                {claimStatusLabel(summary.latestClaim.status, t)} ·{" "}
                {formatJoDateMedium(summary.latestClaim.updatedAt, locale)}
              </p>
            </div>
          ) : (
            <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.earnings.noClaims")}</p>
          )}
        </>
      )}
    </article>
  );
}
