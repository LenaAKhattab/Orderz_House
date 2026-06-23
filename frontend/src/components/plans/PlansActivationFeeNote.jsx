import { useTranslation } from "../../i18n/LanguageProvider";

function PriceTagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="14" height="14" aria-hidden>
      <path
        d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0l-7.17-7.17a2 2 0 0 1 0-2.83L10.58 3.41a2 2 0 0 1 2.83 0l7.17 7.17a2 2 0 0 1 0 2.83z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="7.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

export default function PlansActivationFeeNote({ className = "" }) {
  const { t } = useTranslation();

  return (
    <p className={["plans-activation-fee-note", className].filter(Boolean).join(" ")} role="note">
      <span className="plans-activation-fee-note__icon" aria-hidden="true">
        <PriceTagIcon />
      </span>
      <span className="plans-activation-fee-note__text">
        <span className="plans-activation-fee-note__label">{t("plans.activationFeeNote.prefix")}</span>{" "}
        <span className="plans-activation-fee-note__amount">{t("plans.activationFeeNote.amount")}</span>
        <span className="plans-activation-fee-note__suffix">{t("plans.activationFeeNote.suffix")}</span>
      </span>
    </p>
  );
}
