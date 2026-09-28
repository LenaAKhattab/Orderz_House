import { useTranslation } from "../../i18n/LanguageProvider";
import "../../i18n/activationResources";

export default function FreelancerActivationTrialStatusBlock({
  state,
  isEn: _legacyIsEn,
  activating = false,
  onActivate = null,
  activateError = "",
}) {
  const { t, locale } = useTranslation();

  if (!state || state.engineEnabled !== true) return null;

  const status = String(state.status || "not_started");
  const next = String(state.nextRequiredAction || "none");
  const days = state.trial?.daysRemaining;
  const usage = state.usage || {};
  const trialBidsUsed = usage.trialBidsUsed ?? state.trial?.trialBidsUsed;
  const trialBidLimit = usage.trialBidLimit ?? state.trial?.trialBidLimit;
  const dailyUsed = usage.dailyUsed ?? state.trial?.dailyUsed;
  const dailyLimit = usage.dailyLimit ?? state.trial?.dailyBidLimit;
  const acceptedWorkCount = usage.acceptedWorkCount ?? state.trial?.acceptedWorkCount;
  const successfulWorkCap = usage.successfulWorkCap ?? state.trial?.successfulWorkCap;
  const expired = status === "trial_expired_high_intent" || next === "convert_to_silver";
  const applyReady =
    status === "trial_active" && Boolean(state.trial?.trialBidGrantedAt || state.trial?.trialBidGrantReference);
  const statusLabel =
    {
      not_started: t("activation.trial.not_started"),
      eligible: t("activation.trial.eligible"),
      trial_active: t("activation.trial.trial_active"),
      trial_expired_high_intent: t("activation.trial.trial_expired_high_intent"),
      dormant: t("activation.trial.dormant"),
      final_reactivation_window: t("activation.trial.final_reactivation_window"),
      archived: t("activation.trial.archived"),
      paid_active: t("activation.trial.paid_active"),
    }[status] || status;

  return (
    <div
      className="mb-3 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-info-bg,#eef1f6)] p-3"
      data-testid="freelancer-activation-trial-status"
    >
      <p className="mb-1 text-[0.92rem] font-extrabold text-[color:var(--dash-text,#172033)]">
        {statusLabel}
      </p>
      {status === "trial_active" && days != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
          {t("activation.trial.daysRemaining", { days })}
        </p>
      ) : null}
      {trialBidLimit != null && trialBidsUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-bid-usage">
          {t("activation.trial.bidsUsed", { used: trialBidsUsed, limit: trialBidLimit })}
        </p>
      ) : null}
      {status === "trial_active" && (state.trial?.trialBidGrantedAmount != null || trialBidLimit != null) ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-bids-granted">
          {t("activation.trial.bidsGranted", {
            granted: state.trial?.trialBidGrantedAmount ?? 0,
            limit: trialBidLimit,
          })}
        </p>
      ) : null}
      {trialBidLimit != null && trialBidsUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-apply-allowance">
          {t("activation.trial.appliesRemaining", {
            remaining: Math.max(0, Number(trialBidLimit) - Number(trialBidsUsed)),
            limit: trialBidLimit,
          })}
        </p>
      ) : null}
      {dailyLimit != null && dailyUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-daily-usage">
          {t("activation.trial.dailyUsage", { used: dailyUsed, limit: dailyLimit })}
        </p>
      ) : null}
      {successfulWorkCap != null && acceptedWorkCount != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-work-cap">
          {t("activation.trial.acceptedWork", { count: acceptedWorkCount, cap: successfulWorkCap })}
        </p>
      ) : null}
      {applyReady ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-apply-ready">
          {t("activation.trial.applyReady")}
        </p>
      ) : null}
      {activateError ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-danger,#b42318)]" data-testid="trial-activate-error">
          {activateError}
        </p>
      ) : null}
      <p className="mb-0 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {locale === "en" ? state.messageEn || state.message : state.message}
      </p>
      {next && next !== "none" ? (
        <p className="mb-0 mt-1 text-[0.78rem] font-bold text-[color:var(--dash-primary,#2f3b65)]" data-next-action={next}>
          {t("activation.trial.nextAction", { action: next })}
        </p>
      ) : null}
      {expired ? (
        <p className="mb-0 mt-2 text-[0.86rem] font-extrabold text-[color:var(--dash-primary,#2f3b65)]" data-testid="silver-cta-placeholder">
          {t("activation.trial.expiredCta")}
        </p>
      ) : null}
      {state.canActivate && typeof onActivate === "function" ? (
        <button
          type="button"
          className="oh-account-btn-primary mt-2"
          disabled={activating}
          onClick={() => void onActivate()}
        >
          {activating ? t("activation.trial.starting") : t("activation.trial.startTrial")}
        </button>
      ) : null}
    </div>
  );
}
