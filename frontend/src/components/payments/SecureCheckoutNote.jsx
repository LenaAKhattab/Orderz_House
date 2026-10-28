import { Lock } from "lucide-react";
import { useTranslation } from "../../i18n/LanguageProvider";
import "./secureCheckoutNote.css";

/**
 * One-line trust context shown before redirecting to Stripe Checkout: secure provider, JOD, payment-method
 * expectations, and what happens when the user returns without paying. Concise by design — no modal, no friction.
 * @param {{ context?: "order" | "package", className?: string }} props
 */
export default function SecureCheckoutNote({ context = "package", className = "" }) {
  const { t } = useTranslation();
  return (
    <p className={`oh-secure-checkout-note ${className}`.trim()} data-testid="secure-checkout-note">
      <Lock className="oh-secure-checkout-note__icon" size={14} strokeWidth={2.25} aria-hidden="true" />
      <span>
        {t("common.secureCheckout.lead")}{" "}
        {t(context === "order" ? "common.secureCheckout.returnOrder" : "common.secureCheckout.returnPackage")}
      </span>
    </p>
  );
}
