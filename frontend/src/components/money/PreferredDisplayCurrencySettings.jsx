import { useCurrencyDisplay } from "../../context/CurrencyDisplayContext";
import { writePreferredDisplayCurrency } from "../../utils/preferredDisplayCurrencyStorage";
import {
  INDICATIVE_COPY,
  MANUAL_PREFERENCE_OPTIONS,
  OFFICIAL_CURRENCY_COPY,
  PREFERENCE_HINT,
  PREFERENCE_LABEL,
} from "../../constants/displayCurrencies";

export default function PreferredDisplayCurrencySettings({ className = "" }) {
  const { preferred, refresh } = useCurrencyDisplay();

  return (
    <div className={className}>
      <label className="oh-account-label" htmlFor="preferred-display-currency">
        {PREFERENCE_LABEL}
      </label>
      <select
        id="preferred-display-currency"
        className="oh-account-input"
        value={preferred || "auto"}
        onChange={(e) => {
          writePreferredDisplayCurrency(e.target.value);
          refresh();
        }}
      >
        {MANUAL_PREFERENCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="oh-account-value" style={{ marginTop: 10, fontSize: "0.85rem", color: "#6b7280" }}>
        {PREFERENCE_HINT}
      </p>
      <p className="oh-account-value" style={{ marginTop: 6, fontSize: "0.82rem", color: "#6b7280" }}>
        {OFFICIAL_CURRENCY_COPY} {INDICATIVE_COPY}
      </p>
    </div>
  );
}
