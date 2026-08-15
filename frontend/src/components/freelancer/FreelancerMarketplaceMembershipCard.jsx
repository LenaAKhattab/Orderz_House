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
  if (s === "active" || s === "cancel_at_period_end") {
    return t("freelancerDashboard.marketplaceMembership.statusActive");
  }
  if (s === "pending") return t("freelancerDashboard.marketplaceMembership.statusPending");
  if (s === "suspended") return t("freelancerDashboard.marketplaceMembership.statusSuspended");
  if (s === "expired") return t("freelancerDashboard.marketplaceMembership.statusExpired");
  if (s === "cancelled" || s === "superseded") {
    return t("freelancerDashboard.marketplaceMembership.statusEnded");
  }
  return status || t("freelancerDashboard.common.emDash");
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

  const plan = snap.membership?.plan || {};
  const planName =
    getLocalizedField(plan, "name", locale) ||
    (locale === "en" ? plan.nameEn : plan.nameAr) ||
    plan.nameAr ||
    plan.tierCode ||
    "—";
  const tierCode = plan.tierCode ? String(plan.tierCode).toUpperCase() : null;
  const catalogMatch = Array.isArray(catalogPlans)
    ? catalogPlans.find(
        (p) =>
          String(p?.tierCode || p?.tier_code || "").toUpperCase() === tierCode ||
          String(p?.id || "") === String(plan.id || ""),
      )
    : null;
  const cycle = snap.currentCycle;
  const endsAt = cycle?.endsAt || snap.membership?.paidTermEndsAt || null;
  const bidsAvailable =
    cycle?.monthlyBidAllowanceSnapshot ??
    plan.monthlyBidAllowance ??
    catalogMatch?.monthlyBidAllowance ??
    catalogMatch?.primaryMetrics?.bids ??
    null;
  const dailyLimit =
    plan.dailyBidSpendLimit ??
    plan.capabilities?.dailyBidSpendLimit ??
    catalogMatch?.dailyBidSpendLimit ??
    catalogMatch?.primaryMetrics?.dailyLimit ??
    catalogMatch?.capabilities?.dailyBidSpendLimit ??
    null;
  const status = snap.membership?.status;

  return (
    <header className="fp-surface fp-hero fp-hero--membership">
      <div className="fp-hero__copy">
        <span className="fp-hero__eyebrow">
          <Crown size={14} strokeWidth={2} aria-hidden />
          {t("freelancerDashboard.marketplaceMembership.currentEyebrow")}
        </span>
        {tierCode ? <p className="fp-hero__tier">{tierCode}</p> : null}
        <h1 className="fp-hero__title">{planName}</h1>
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
                : status === "pending"
                  ? "fp-hero__stat-value--warn"
                  : "fp-hero__stat-value--accent"
            }
          >
            {membershipStatusLabel(status, t)}
          </dd>
        </div>
        {endsAt ? (
          <div className="fp-hero__stat">
            <dt>{t("freelancerDashboard.marketplaceMembership.endsOn")}</dt>
            <dd>{formatJoDateMedium(endsAt, locale)}</dd>
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
