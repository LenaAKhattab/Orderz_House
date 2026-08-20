import { JodMoneyDisplay } from "../money/JodMoneyDisplay";
import {
  EARNED_BALANCE_HELPER_AR,
  EARNED_BALANCE_HELPER_EN,
  earnedBalanceStatusLabel,
} from "../../constants/freelancerActivationEarnedBalance";

export default function FreelancerEarnedBalancePanel({ balance, isEn = false }) {
  const totalPending = balance?.totalPendingJod ?? "0.000";
  const accepted = Number(balance?.totalAcceptedArticles) || 0;
  const published = Number(balance?.totalPublishedArticles) || 0;
  const entries = Array.isArray(balance?.entries) ? balance.entries : [];

  return (
    <div
      className="mb-3 rounded-[var(--dash-radius-md,12px)] border border-[color:var(--dash-border,#c9d0da)] bg-[color:var(--dash-card,#fcfcfd)] p-3"
      data-testid="freelancer-earned-balance"
    >
      <p className="mb-1 text-[0.92rem] font-extrabold text-[color:var(--dash-text,#172033)]">
        {isEn ? "Earned balance" : "الرصيد المكتسب"}
      </p>
      <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-pending">
        {isEn ? "Pending" : "قيد المعالجة"}:{" "}
        <JodMoneyDisplay amount={totalPending} compact showDisclaimer={false} />
      </p>
      <p className="mb-2 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {isEn
          ? `Accepted ${accepted} · Published ${published}`
          : `مقبول ${accepted} · منشور ${published}`}
      </p>
      <p className="mb-2 text-[0.78rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]">
        {isEn ? EARNED_BALANCE_HELPER_EN : EARNED_BALANCE_HELPER_AR}
      </p>
      {entries.length === 0 ? (
        <p className="mb-0 text-[0.82rem] font-semibold text-[color:var(--dash-text-secondary,#4b5563)]" data-testid="earned-balance-empty">
          {isEn ? "No accepted Mini Articles yet." : "لا توجد مقالات مقبولة بعد."}
        </p>
      ) : (
        <ul className="m-0 grid list-none gap-2 p-0" data-testid="earned-balance-entries">
          {entries.slice(0, 8).map((entry) => (
            <li key={entry.applicationId} className="text-[0.82rem] font-semibold text-[color:var(--dash-text,#172033)]">
              <span>{entry.articleTitle || (isEn ? "Accepted article" : "مقال مقبول")}</span>
              {" · "}
              <JodMoneyDisplay amount={entry.amountJod} compact showDisclaimer={false} />
              {" · "}
              <span>{earnedBalanceStatusLabel(entry.status, { isEn })}</span>
              {entry.bildazoUrl ? (
                <>
                  {" · "}
                  <span>{isEn ? "Published on Bildazo" : "نُشر على Bildazo"}</span>
                  {" · "}
                  <a
                    href={entry.bildazoUrl}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="earned-balance-open-article"
                  >
                    {isEn ? "Open article" : "فتح المقال"}
                  </a>
                </>
              ) : (
                <>
                  {" · "}
                  <span>{isEn ? "Accepted article" : "مقال مقبول"}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
