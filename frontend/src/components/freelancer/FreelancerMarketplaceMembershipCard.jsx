import { Crown } from "lucide-react";
import { formatJoDateMedium } from "../../utils/freelancerDashboardData";
import { useTranslation } from "../../i18n/LanguageProvider";
import { getLocalizedField } from "../../lib/i18n/getLocalizedField";

/**
 * Map Marketplace Membership backend statuses to simple user-facing labels.
 * Do not borrow labels from the legacy/main subscription system.
 */
function membershipStatusLabel(status, t) {
  const s = String(status || "").toLowerCase();
  if (s === "purchased_pending_start") {
    return t("freelancerDashboard.marketplaceMembership.statusPurchasedPendingStart");
  }
  if (s === "starter_pending_start") {
    return t("freelancerDashboard.marketplaceMembership.statusStarterPendingStart");
  }
  if (s === "active" || s === "cancel_at_period_end") {
    return t("freelancerDashboard.marketplaceMembership.statusActive");
  }
  if (s === "pending" || s === "payment_pending") {
    return t("freelancerDashboard.marketplaceMembership.statusPending");
  }
  if (s === "suspended") return t("freelancerDashboard.marketplaceMembership.statusSuspended");
  if (s === "expired") return t("freelancerDashboard.marketplaceMembership.statusExpired");
  if (s === "cancelled" || s === "superseded") {
    return t("freelancerDashboard.marketplaceMembership.statusEnded");
  }
  return status || t("freelancerDashboard.common.emDash");
}

function resolvePlanName(plan, locale) {
  return (
    getLocalizedField(plan, "name", locale) ||
    (locale === "en" ? plan?.nameEn : plan?.nameAr) ||
    plan?.nameAr ||
    plan?.tierCode ||
    "—"
  );
}

/**
 * Presentational Marketplace Membership status for Freelancer Plans.
 * Parent owns fetching (useFreelancerPlansScreen) — no independent network here.
 *
 * @param {{
 *   snapshot?: object|null,
 *   loading?: boolean,
 *   error?: string|null,
 *   catalogPlans?: Array,
 * }} props
 */
export default function FreelancerMarketplaceMembershipCard({
  snapshot = null,
  loading = false,
  error = null,
  catalogPlans = [],
  onStartStarterTrial = null,
  trialBusy = false,
} = {}) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <header className="fp-surface fp-hero fp-hero--membership" aria-busy="true">
        <div className="fp-hero__copy">
          <span className="fp-hero__eyebrow">
            <Crown size={14} strokeWidth={2} aria-hidden />
            {t("freelancerDashboard.marketplaceMembership.title")}
          </span>
          <p className="fp-hero__subtitle">{t("freelancerDashboard.marketplaceMembership.loading")}</p>
        </div>
      </header>
    );
  }

  if (error && !snapshot) {
    return (
      <header className="fp-surface fp-hero fp-hero--membership">
        <div className="fp-hero__copy">
          <span className="fp-hero__eyebrow">
            <Crown size={14} strokeWidth={2} aria-hidden />
            {t("freelancerDashboard.marketplaceMembership.title")}
          </span>
          <h1 className="fp-hero__title">{t("freelancerDashboard.marketplaceMembership.none")}</h1>
          <p className="fp-hero__subtitle">{t("freelancerDashboard.marketplaceMembership.noneHint")}</p>
        </div>
      </header>
    );
  }

  const snap = snapshot;
  if (!snap?.hasMembership) {
    return (
      <header className="fp-surface fp-hero fp-hero--membership fp-hero--membership-empty">
        <div className="fp-hero__copy">
          <span className="fp-hero__eyebrow">
            <Crown size={14} strokeWidth={2} aria-hidden />
            {t("freelancerDashboard.marketplaceMembership.title")}
          </span>
          <h1 className="fp-hero__title">{t("freelancerDashboard.marketplaceMembership.none")}</h1>
          <p className="fp-hero__subtitle">{t("freelancerDashboard.marketplaceMembership.noneHint")}</p>
        </div>
      </header>
    );
  }

  const membership = snap.membership || {};
  const plan = membership.plan || {};
  const planName = resolvePlanName(plan, locale);
  const tierCode = plan.tierCode ? String(plan.tierCode).toUpperCase() : null;
  const catalogMatch = Array.isArray(catalogPlans)
    ? catalogPlans.find(
        (p) =>
          String(p?.tierCode || p?.tier_code || "").toUpperCase() === tierCode ||
          String(p?.id || "") === String(plan.id || ""),
      )
    : null;
  const cycle = snap.currentCycle;
  const status = membership.status;
  const pendingStart = String(status || "") === "purchased_pending_start";
  const starterPendingStart =
    String(status || "") === "starter_pending_start" || membership.starterPendingStart === true;
  const termStarted =
    membership.termStarted === true ||
    (Boolean(membership.paidTermStartsAt) &&
      (status === "active" || status === "cancel_at_period_end"));
  const benefitsUsable =
    snap.priorityBid?.membershipBenefitsUsable === true ||
    status === "active" ||
    status === "cancel_at_period_end";
  const endsAt = termStarted
    ? cycle?.endsAt || membership.paidTermEndsAt || null
    : null;
  const startsAt = termStarted ? membership.paidTermStartsAt || cycle?.startsAt || null : null;
  const purchasedAt = membership.purchasedAt || null;
  const remainingDays = membership.remainingDays;
  const bidsAvailable = benefitsUsable
    ? cycle?.monthlyBidAllowanceSnapshot ??
      plan.monthlyBidAllowance ??
      catalogMatch?.monthlyBidAllowance ??
      catalogMatch?.primaryMetrics?.bids ??
      null
    : null;
  const dailyLimit = benefitsUsable
    ? plan.dailyBidSpendLimit ??
      plan.capabilities?.dailyBidSpendLimit ??
      catalogMatch?.dailyBidSpendLimit ??
      catalogMatch?.primaryMetrics?.dailyLimit ??
      catalogMatch?.capabilities?.dailyBidSpendLimit ??
      null
    : null;
  const canApply = membership.canApply;
  const applicationEligible = membership.applicationEligible;
  const statusMessageAr = membership.statusMessageAr || null;
  const pendingBody =
    statusMessageAr ||
    t("freelancerDashboard.marketplaceMembership.pendingStartBody");
  const canStartTrial =
    membership.canStartStarterTrial === true ||
    (starterPendingStart &&
      membership.verificationComplete === true &&
      membership.trainingComplete === true);
  const gatesIncomplete =
    starterPendingStart &&
    (membership.verificationComplete === false || membership.trainingComplete === false);

  if (starterPendingStart) {
    return (
      <header
        className="fp-surface fp-hero fp-hero--membership fp-hero--membership-starter-pending"
        data-testid="marketplace-membership-starter-pending"
        data-term-started="false"
      >
        <div className="fp-hero__copy">
          <span className="fp-hero__eyebrow">
            <Crown size={14} strokeWidth={2} aria-hidden />
            {t("freelancerDashboard.marketplaceMembership.starterReadyEyebrow")}
          </span>
          {tierCode ? <p className="fp-hero__tier">{tierCode}</p> : null}
          <h1 className="fp-hero__title">
            {t("freelancerDashboard.marketplaceMembership.starterReadyTitle")}
          </h1>
          <p className="fp-hero__subtitle">
            {statusMessageAr || t("freelancerDashboard.marketplaceMembership.starterReadyBody")}
          </p>
          {gatesIncomplete ? (
            <p className="fp-upgrade-hint" style={{ marginTop: 10 }}>
              {t("freelancerDashboard.marketplaceMembership.starterGatesReminder")}
            </p>
          ) : null}
          {typeof onStartStarterTrial === "function" ? (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="fp-hero__trial-cta"
                data-testid="marketplace-starter-start-trial"
                disabled={!canStartTrial || trialBusy}
                onClick={() => onStartStarterTrial()}
              >
                {trialBusy
                  ? t("common.loading.redirecting")
                  : t("freelancerDashboard.marketplaceMembership.startTrialCta")}
              </button>
            </div>
          ) : null}
        </div>

        <dl
          className="fp-hero__stats"
          aria-label={t("freelancerDashboard.marketplaceMembership.summaryAria")}
        >
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.status")}</dt>
            <dd className="fp-hero__stat-value--warn">{membershipStatusLabel(status, t)}</dd>
          </div>
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.currentPlan")}</dt>
            <dd>{planName}</dd>
          </div>
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.termStatus")}</dt>
            <dd>{t("freelancerDashboard.marketplaceMembership.termNotStarted")}</dd>
          </div>
        </dl>
      </header>
    );
  }

  if (pendingStart) {
    return (
      <header
        className="fp-surface fp-hero fp-hero--membership fp-hero--membership-pending-start"
        data-testid="marketplace-membership-pending-start"
        data-term-started="false"
      >
        <div className="fp-hero__copy">
          <span className="fp-hero__eyebrow">
            <Crown size={14} strokeWidth={2} aria-hidden />
            {t("freelancerDashboard.marketplaceMembership.purchasedEyebrow")}
          </span>
          {tierCode ? <p className="fp-hero__tier">{tierCode}</p> : null}
          <h1 className="fp-hero__title">
            {t("freelancerDashboard.marketplaceMembership.purchasedTitle")}
          </h1>
          <p className="fp-hero__subtitle">{pendingBody}</p>
          {canApply === false || applicationEligible === false ? (
            <p className="fp-upgrade-hint" style={{ marginTop: 10 }}>
              {t("freelancerDashboard.marketplaceMembership.applyGatesReminder")}
            </p>
          ) : null}
        </div>

        <dl
          className="fp-hero__stats"
          aria-label={t("freelancerDashboard.marketplaceMembership.summaryAria")}
        >
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.status")}</dt>
            <dd className="fp-hero__stat-value--warn">{membershipStatusLabel(status, t)}</dd>
          </div>
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.currentPlan")}</dt>
            <dd>{planName}</dd>
          </div>
          {purchasedAt ? (
            <div className="fp-hero__stat">
              <dt>{t("freelancerDashboard.marketplaceMembership.purchasedAt")}</dt>
              <dd>{formatJoDateMedium(purchasedAt, locale)}</dd>
            </div>
          ) : null}
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.termStatus")}</dt>
            <dd>{t("freelancerDashboard.marketplaceMembership.termNotStarted")}</dd>
          </div>
          <div className="fp-hero__stat" style={{ gridColumn: "1 / -1" }}>
            <dt>{t("freelancerDashboard.marketplaceMembership.termStartsWhen")}</dt>
            <dd>{t("freelancerDashboard.marketplaceMembership.termStartsOnFirstOrder")}</dd>
          </div>
        </dl>
      </header>
    );
  }

  return (
    <header className="fp-surface fp-hero fp-hero--membership" data-testid="marketplace-membership-active">
      <div className="fp-hero__copy">
        <span className="fp-hero__eyebrow">
          <Crown size={14} strokeWidth={2} aria-hidden />
          {t("freelancerDashboard.marketplaceMembership.currentEyebrow")}
        </span>
        {tierCode ? <p className="fp-hero__tier">{tierCode}</p> : null}
        <h1 className="fp-hero__title">{planName}</h1>
        {canApply === false ? (
          <p className="fp-hero__subtitle">
            {t("freelancerDashboard.marketplaceMembership.applyGatesReminder")}
          </p>
        ) : null}
      </div>

      <dl
        className="fp-hero__stats"
        aria-label={t("freelancerDashboard.marketplaceMembership.summaryAria")}
      >
        <div className="fp-hero__stat">
          <dt>{t("freelancerDashboard.marketplaceMembership.status")}</dt>
          <dd
            className={
              status === "active" || status === "cancel_at_period_end"
                ? "fp-hero__stat-value--ok"
                : status === "pending" || status === "payment_pending"
                  ? "fp-hero__stat-value--warn"
                  : "fp-hero__stat-value--accent"
            }
          >
            {membershipStatusLabel(status, t)}
          </dd>
        </div>
        {startsAt ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.cycleStart")}</dt>
            <dd>{formatJoDateMedium(startsAt, locale)}</dd>
          </div>
        ) : null}
        {endsAt ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.endsOn")}</dt>
            <dd>{formatJoDateMedium(endsAt, locale)}</dd>
          </div>
        ) : null}
        {remainingDays != null && termStarted ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.remainingDays")}</dt>
            <dd>{remainingDays}</dd>
          </div>
        ) : null}
        {bidsAvailable != null ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.bidsAvailable")}</dt>
            <dd>{bidsAvailable}</dd>
          </div>
        ) : null}
        {dailyLimit != null ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.dailyLimit")}</dt>
            <dd>{dailyLimit}</dd>
          </div>
        ) : null}
      </dl>
    </header>
  );
}
