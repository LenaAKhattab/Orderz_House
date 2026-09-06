export default function FreelancerActivationTrialStatusBlock({
  state,
  isEn = false,
  activating = false,
  onActivate = null,
  activateError = "",
}) {
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
  const statusLabel = {
    not_started: isEn ? "Trial not started" : "التجربة غير مفعّلة",
    eligible: isEn ? "Eligible for trial" : "مؤهل للتجربة",
    trial_active: isEn ? "Trial active" : "التجربة نشطة",
    trial_expired_high_intent: isEn ? "Trial expired" : "انتهت التجربة",
    dormant: isEn ? "Trial dormant" : "التجربة خاملة",
    final_reactivation_window: isEn ? "Reactivation window" : "نافذة إعادة التفعيل",
    archived: isEn ? "Trial archived" : "التجربة مؤرشفة",
    paid_active: isEn ? "Paid membership active" : "اشتراك مدفوع نشط",
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
          {isEn ? `${days} day(s) remaining` : `${days} يوم متبقية`}
        </p>
      ) : null}
      {trialBidLimit != null && trialBidsUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-bid-usage">
          {isEn
            ? `Trial bids used ${trialBidsUsed} / ${trialBidLimit}`
            : `عروض التجربة المستخدمة ${trialBidsUsed} / ${trialBidLimit}`}
        </p>
      ) : null}
      {status === "trial_active" && (state.trial?.trialBidGrantedAmount != null || trialBidLimit != null) ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-bids-granted">
          {isEn
            ? `Trial bids granted ${state.trial?.trialBidGrantedAmount ?? 0} / ${trialBidLimit}`
            : `عروض التجربة الممنوحة ${state.trial?.trialBidGrantedAmount ?? 0} / ${trialBidLimit}`}
        </p>
      ) : null}
      {trialBidLimit != null && trialBidsUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-apply-allowance">
          {isEn
            ? `Remaining trial applies ${Math.max(0, Number(trialBidLimit) - Number(trialBidsUsed))} / ${trialBidLimit}`
            : `متبقي من تقديمات التجربة ${Math.max(0, Number(trialBidLimit) - Number(trialBidsUsed))} / ${trialBidLimit}`}
        </p>
      ) : null}
      {dailyLimit != null && dailyUsed != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-daily-usage">
          {isEn
            ? `Today ${dailyUsed} / ${dailyLimit}`
            : `اليوم ${dailyUsed} / ${dailyLimit}`}
        </p>
      ) : null}
      {successfulWorkCap != null && acceptedWorkCount != null ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-work-cap">
          {isEn
            ? `Accepted ${acceptedWorkCount} / ${successfulWorkCap}`
            : `المقبول ${acceptedWorkCount} / ${successfulWorkCap}`}
        </p>
      ) : null}
      {applyReady ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="trial-apply-ready">
          {isEn
            ? "Trial is active. You can apply to Mini Articles with trial Bids."
            : "التجربة نشطة. يمكنك التقديم على مقالات Mini Article بعروض التجربة."}
        </p>
      ) : null}
      {activateError ? (
        <p className="mb-1 text-[0.82rem] font-semibold text-[color:var(--dash-danger,#b42318)]" data-testid="trial-activate-error">
          {activateError}
        </p>
      ) : null}
      <p className="mb-0 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {isEn ? state.messageEn || state.message : state.message}
      </p>
      {next && next !== "none" ? (
        <p className="mb-0 mt-1 text-[0.78rem] font-bold text-[color:var(--dash-primary,#2f3b65)]" data-next-action={next}>
          {isEn ? `Next: ${next}` : `التالي: ${next}`}
        </p>
      ) : null}
      {expired ? (
        <p className="mb-0 mt-2 text-[0.86rem] font-extrabold text-[color:var(--dash-primary,#2f3b65)]" data-testid="silver-cta-placeholder">
          {isEn
            ? "Your work trial has ended. Continue with Silver."
            : "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver."}
        </p>
      ) : null}
      {state.canActivate && typeof onActivate === "function" ? (
        <button
          type="button"
          className="oh-account-btn-primary mt-2"
          disabled={activating}
          onClick={() => void onActivate()}
        >
          {activating
            ? isEn
              ? "Starting…"
              : "جاري البدء…"
            : isEn
              ? "Start trial"
              : "بدء التجربة"}
        </button>
      ) : null}
    </div>
  );
}
