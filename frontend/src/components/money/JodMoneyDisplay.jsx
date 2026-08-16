import { formatApproximateCurrency, formatJodAmount } from "../../utils/displayMoney";
import { useCurrencyDisplay } from "../../context/CurrencyDisplayContext";
import { useTranslation } from "../../i18n/LanguageProvider";
import { DISPLAY_DISCLAIMER } from "../../constants/displayCurrencies";
import "./jodMoneyDisplay.css";

function parseAmount(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Official JOD amount plus optional approximate local currency.
 * Converted values are display-only and must never feed checkout or ledgers.
 */
export function JodMoneyDisplay({
  amount,
  amountMax = null,
  locale: localeProp,
  showDisclaimer = true,
  compact = false,
  className = "",
}) {
  const { locale: uiLocale } = useTranslation();
  const locale = localeProp || uiLocale || "ar";
  const { displayCurrency, rate, showApproximate, disclaimer } = useCurrencyDisplay();

  const minN = parseAmount(amount);
  const maxN = parseAmount(amountMax);
  const hasMin = Number.isFinite(minN);
  const hasMax = Number.isFinite(maxN);
  if (!hasMin && !hasMax) return "—";

  const primary =
    hasMin && hasMax && minN !== maxN
      ? `${formatJodAmount(minN, { locale })} – ${formatJodAmount(maxN, { locale })}`
      : formatJodAmount(hasMin ? minN : maxN, { locale });

  let approx = null;
  if (showApproximate) {
    if (hasMin && hasMax && minN !== maxN) {
      const a = formatApproximateCurrency(minN, displayCurrency, rate);
      const b = formatApproximateCurrency(maxN, displayCurrency, rate);
      approx = a && b ? `${a} – ${b}` : a || b;
    } else {
      approx = formatApproximateCurrency(hasMin ? minN : maxN, displayCurrency, rate);
    }
  }

  const note = disclaimer || DISPLAY_DISCLAIMER;

  return (
    <span className={["oh-jod-money", compact ? "oh-jod-money--compact" : "", className].filter(Boolean).join(" ")}>
      <span className="oh-jod-money__primary" dir="ltr">
        {primary}
      </span>
      {approx ? (
        <span className="oh-jod-money__approx" dir="ltr" title={note}>
          ≈ {approx}
        </span>
      ) : null}
      {approx && showDisclaimer ? <span className="oh-jod-money__note">{note}</span> : null}
    </span>
  );
}

export const MoneyDisplay = JodMoneyDisplay;

export function JodOrderBudgetDisplay({ order, ...rest }) {
  if (!order) return "—";
  const projectType = String(order?.projectType || "").toLowerCase();
  if (projectType === "bidding") {
    if (order?.bidBudgetMin != null && order?.bidBudgetMax != null) {
      return <JodMoneyDisplay amount={order.bidBudgetMin} amountMax={order.bidBudgetMax} {...rest} />;
    }
    return "—";
  }
  if (order?.budget != null && Number.isFinite(Number(order.budget))) {
    return <JodMoneyDisplay amount={order.budget} {...rest} />;
  }
  return "—";
}

export function ApproximateCurrencyLine({ amount, amountMax = null, className = "" }) {
  const { displayCurrency, rate, showApproximate, disclaimer } = useCurrencyDisplay();
  if (!showApproximate) return null;
  const minN = parseAmount(amount);
  const maxN = parseAmount(amountMax);
  const hasMin = Number.isFinite(minN);
  const hasMax = Number.isFinite(maxN);
  if (!hasMin && !hasMax) return null;
  let approx = null;
  if (hasMin && hasMax && minN !== maxN) {
    const a = formatApproximateCurrency(minN, displayCurrency, rate);
    const b = formatApproximateCurrency(maxN, displayCurrency, rate);
    approx = a && b ? `${a} – ${b}` : a || b;
  } else {
    approx = formatApproximateCurrency(hasMin ? minN : maxN, displayCurrency, rate);
  }
  if (!approx) return null;
  return (
    <span className={["oh-jod-money__approx", className].filter(Boolean).join(" ")} dir="ltr" title={disclaimer}>
      ≈ {approx}
    </span>
  );
}
