import { JodMoneyDisplay } from "../money/JodMoneyDisplay";
import {
  EARNED_BALANCE_HELPER_AR,
  EARNED_BALANCE_HELPER_EN,
  EARNED_BALANCE_LOCKED_CTA_AR,
  EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR,
  EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN,
  earnedBalanceStatusLabel,
  resolveEarnedBalanceLockCopy,
} from "../../constants/freelancerActivationEarnedBalance";
import { BILDAZO_VIEW_ARTICLE_AR, BILDAZO_VIEW_WRITER_PROFILE_AR } from "../../constants/bildazoArticlePublish";
import { startFreelancerSilverCheckoutRequest } from "../../services/api";

export default function FreelancerEarnedBalancePanel({
  balance,
  isEn = false,
  conversion = null,
  onSilverCheckoutStarted = null,
}) {
  const totalPending = balance?.totalLockedPendingJod ?? balance?.totalPendingJod ?? "0.000";
  const totalForfeited = balance?.totalForfeitedJod ?? "0.000";
  const accepted = Number(balance?.totalAcceptedArticles) || 0;
  const published = Number(balance?.totalPublishedArticles) || 0;
  const entries = Array.isArray(balance?.entries) ? balance.entries : [];
  const writerProfileUrl = balance?.writerProfileUrl || null;
  const lockPolicy = balance?.lockPolicy || null;
  const withdrawalPolicy = balance?.withdrawalPolicy || null;
  const lockHeadline = resolveEarnedBalanceLockCopy(lockPolicy, { isEn });
  const lockDetail = isEn
    ? lockPolicy?.messages?.en?.detail
    : lockPolicy?.messages?.ar?.detail;
  const kycWithdrawalMessage = isEn
    ? withdrawalPolicy?.messageEn || EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_EN
    : withdrawalPolicy?.messageAr || EARNED_BALANCE_WITHDRAWAL_KYC_MESSAGE_AR;
  const showKycWithdrawalBlock =
    withdrawalPolicy?.allowed === false
    && (withdrawalPolicy?.reason === "company_kyc_required"
      || entries.some((entry) => entry.status === "awaiting_account_approval"));
  const showCta =
    Boolean(lockPolicy?.showSilverCta)
    || Boolean(conversion?.shouldShowSilverCta);
  const forfeitedClosed = lockPolicy?.state === "forfeited_closed";

  async function handleSilverCta() {
    try {
      const res = await startFreelancerSilverCheckoutRequest();
      if (typeof onSilverCheckoutStarted === "function") {
        onSilverCheckoutStarted(res?.data);
      }
    } catch {
      /* parent may show toast */
    }
  }

  return (
    <div
      className="mb-3 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
      data-testid="freelancer-earned-balance"
      data-lock-state={lockPolicy?.state || "none"}
    >
      <p className="mb-1 text-[0.92rem] font-extrabold text-[color:var(--dash-text,#172033)]">
        {isEn ? "Earned balance" : "الرصيد المكتسب"}
      </p>
      {lockHeadline ? (
        <p
          className="mb-2 flex items-start gap-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]"
          data-testid="earned-balance-lock-headline"
        >
          <span aria-hidden="true">🔒</span>
          <span>{lockHeadline}</span>
        </p>
      ) : null}
      {lockDetail ? (
        <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-lock-detail">
          {lockDetail}
        </p>
      ) : null}
      {showKycWithdrawalBlock ? (
        <p
          className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]"
          data-testid="earned-balance-kyc-block"
        >
          {kycWithdrawalMessage}
        </p>
      ) : null}
      <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-pending">
        {isEn ? "Locked pending" : "معلّق غير قابل للسحب"}:{" "}
        <JodMoneyDisplay amount={totalPending} compact showDisclaimer={false} />
      </p>
      {Number(totalForfeited) > 0 || forfeitedClosed ? (
        <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-forfeited">
          {isEn ? "Previously closed" : "رصيد سابق مُغلق"}:{" "}
          <JodMoneyDisplay amount={totalForfeited} compact showDisclaimer={false} />
        </p>
      ) : null}
      <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {isEn
          ? `Accepted ${accepted} · Published ${published}`
          : `مقبول ${accepted} · منشور ${published}`}
      </p>
      <p className="mb-2 text-[0.78rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {isEn ? EARNED_BALANCE_HELPER_EN : EARNED_BALANCE_HELPER_AR}
      </p>
      {showCta && !forfeitedClosed ? (
        <button
          type="button"
          className="oh-account-btn-primary mb-2"
          data-testid="earned-balance-silver-cta"
          onClick={() => void handleSilverCta()}
        >
          {isEn ? "Subscribe to unlock withdrawal" : EARNED_BALANCE_LOCKED_CTA_AR}
        </button>
      ) : null}
      {entries.length === 0 ? (
        <p className="mb-0 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-empty">
          {isEn ? "No accepted Mini Articles yet." : "لا توجد مقالات مقبولة بعد."}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="earned-balance-entries">
          {entries.slice(0, 8).map((entry) => (
            <li key={entry.applicationId} className="text-[0.82rem] font-semibold text-[color:var(--dash-text,#172033)]">
              {entry.locked ? <span aria-hidden="true">🔒 </span> : null}
              <span>{entry.articleTitle || (isEn ? "Accepted article" : "مقال مقبول")}</span>
              {" · "}
              <JodMoneyDisplay amount={entry.amountJod} compact showDisclaimer={false} />
              {" · "}
              <span data-entry-status={entry.status}>{earnedBalanceStatusLabel(entry.status, { isEn })}</span>
              {entry.bildazoUrl ? (
                <>
                  {" · "}
                  <a
                    href={entry.bildazoUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="earned-balance-open-article"
                  >
                    {isEn ? "View article" : BILDAZO_VIEW_ARTICLE_AR}
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {writerProfileUrl ? (
        <p className="mb-0 mt-2 text-[0.82rem] font-semibold">
          <a href={writerProfileUrl} target="_blank" rel="noreferrer" data-testid="earned-balance-writer-profile">
            {isEn ? "View writer profile" : BILDAZO_VIEW_WRITER_PROFILE_AR}
          </a>
        </p>
      ) : null}
    </div>
  );
}
