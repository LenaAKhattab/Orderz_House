import { Link } from "react-router-dom";
import { useTranslation } from "../../../../i18n/LanguageProvider";
import { getFreelancerOrderEligibilityMessage } from "../../../../utils/freelancerEligibilityUi";
import { isOrderzhouseFreePlan } from "../../../../constants/orderzhousePlansCatalog";
import {
  computeActiveWorkloadCount,
  formatJoDateMedium,
  formatTimeRemaining,
  getPlanOrderValueRangeLabel,
} from "../../../../utils/freelancerDashboardData";
import { getLocalizedField } from "../../../../lib/i18n/getLocalizedField";

function paymentLabel(status, t) {
  const s = String(status || "");
  if (s === "paid") return t("freelancerDashboard.status.payment.paid");
  if (s === "pending") return t("freelancerDashboard.status.payment.pending");
  if (s === "failed") return t("freelancerDashboard.status.payment.failed");
  if (s === "not_required") return t("freelancerDashboard.status.payment.notRequired");
  return s || t("freelancerDashboard.common.emDash");
}

function activationLabel(status, t) {
  const s = String(status || "");
  if (s === "company_approved") return t("freelancerDashboard.status.activation.approved");
  if (s === "company_pending") return t("freelancerDashboard.status.activation.pending");
  return s || t("freelancerDashboard.common.emDash");
}

function subscriptionStatusLabel(status, t) {
  const s = String(status || "");
  if (s === "active") return t("freelancerDashboard.status.subscription.active");
  if (s === "assigned_not_started") return t("freelancerDashboard.status.subscription.assignedNotStarted");
  if (s === "expired") return t("freelancerDashboard.status.subscription.expired");
  if (s === "inactive") return t("freelancerDashboard.status.subscription.inactive");
  return s || t("freelancerDashboard.common.emDash");
}

export default function PlanStatusCard({ subscription, eligibility, orderCounts, nowMs, loading }) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <article className="fdash-cc-card fdash-cc-card--plan">
        <div className="fdash-cc-skel" style={{ height: 120 }} />
      </article>
    );
  }

  const freePlan = isOrderzhouseFreePlan(subscription?.planId ?? subscription?.plan);
  const rangeLabel =
    getLocalizedField(subscription, "label", locale) ||
    getLocalizedField(subscription?.planOrderValueRange, "label", locale) ||
    getPlanOrderValueRangeLabel(subscription, t);
  const remaining = subscription?.expiryDate ? formatTimeRemaining(subscription.expiryDate, nowMs, t) : null;
  const activeWorkload = computeActiveWorkloadCount(orderCounts);

  const eligible = Boolean(eligibility?.eligible);
  const blockMsg =
    !eligible && eligibility ? getFreelancerOrderEligibilityMessage(eligibility, subscription, t) : "";

  return (
    <article className="fdash-cc-card fdash-cc-card--plan">
      <header className="fdash-cc-card__head">
        <h3 className="fdash-cc-card__title">{t("freelancerDashboard.controlCenter.planStatus.title")}</h3>
        {!subscription ? (
          <Link to="/dashboard/freelancer/plans" className="fdash-cc-card__link">
            {t("freelancerDashboard.controlCenter.planStatus.choosePlan")}
          </Link>
        ) : null}
      </header>

      {!subscription ? (
        <p className="fdash-cc-card__muted">{t("freelancerDashboard.controlCenter.planStatus.noSubscription")}</p>
      ) : (
        <div className="fdash-cc-card__body">
          <p className="fdash-cc-card__highlight">
            {getLocalizedField(subscription.plan, "title", locale) ||
              t("freelancerDashboard.controlCenter.planStatus.subscriptionDefault")}
          </p>
          <dl className="fdash-cc-kv">
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.subscriptionStatus")}</dt>
              <dd>{subscriptionStatusLabel(subscription.status, t)}</dd>
            </div>
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.payment")}</dt>
              <dd>{paymentLabel(subscription.paymentStatus, t)}</dd>
            </div>
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.companyActivation")}</dt>
              <dd>{activationLabel(subscription.activationStatus, t)}</dd>
            </div>
            {subscription.expiryDate ? (
              <div>
                <dt>{t("freelancerDashboard.controlCenter.planStatus.expiresAt")}</dt>
                <dd>{formatJoDateMedium(subscription.expiryDate, locale)}</dd>
              </div>
            ) : null}
            {remaining ? (
              <div>
                <dt>{t("freelancerDashboard.controlCenter.planStatus.timeRemaining")}</dt>
                <dd className={remaining.expired ? "fdash-cc-kv__urgent" : ""}>{remaining.text}</dd>
              </div>
            ) : null}
            {rangeLabel ? (
              <div>
                <dt>{t("freelancerDashboard.controlCenter.planStatus.orderValueRange")}</dt>
                <dd>{rangeLabel}</dd>
              </div>
            ) : null}
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.realOrders")}</dt>
              <dd>
                {freePlan
                  ? t("freelancerDashboard.controlCenter.planStatus.realOrdersFree")
                  : t("freelancerDashboard.controlCenter.planStatus.realOrdersPaid")}
              </dd>
            </div>
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.trainingOrders")}</dt>
              <dd>{t("freelancerDashboard.controlCenter.planStatus.trainingOrdersNote")}</dd>
            </div>
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.currentWorkload")}</dt>
              <dd>{t("freelancerDashboard.controlCenter.planStatus.activeOrdersCount", { count: activeWorkload })}</dd>
            </div>
            <div>
              <dt>{t("freelancerDashboard.controlCenter.planStatus.marketplaceEligibility")}</dt>
              <dd className={eligible ? "fdash-cc-kv__ok" : "fdash-cc-kv__urgent"}>
                {eligible
                  ? t("freelancerDashboard.controlCenter.planStatus.eligible")
                  : t("freelancerDashboard.controlCenter.planStatus.notEligible")}
              </dd>
            </div>
          </dl>
          {blockMsg ? <p className="fdash-cc-card__warn">{blockMsg}</p> : null}
        </div>
      )}
    </article>
  );
}
