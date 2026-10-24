import { useTranslation } from "../../i18n/LanguageProvider";

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="12" cy="7.75" r="1.1" fill="currentColor" />
    </svg>
  );
}

/**
 * One shared, compact clarification under membership package grids:
 * an "application" is submitting an offer on an order, not a guaranteed order.
 */
export default function PlansApplicationNote({ className = "" }) {
  const { t } = useTranslation();
  return (
    <p
      className={["plans-activation-fee-note", "plans-application-note", className].filter(Boolean).join(" ")}
      role="note"
      data-testid="plans-application-note"
    >
      <span className="plans-activation-fee-note__icon plans-application-note__icon" aria-hidden="true">
        <InfoIcon />
      </span>
      <span className="plans-application-note__text">{t("plans.membership.applicationNote")}</span>
    </p>
  );
}
