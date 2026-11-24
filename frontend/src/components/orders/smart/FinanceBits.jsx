/**
 * Small presentational pieces shared by the finance page and the per-order finance panel.
 * Amounts are server decimal strings rendered verbatim with their currency (no client arithmetic).
 */
export function Money({ amount, currency, testId }) {
  if (amount === null || amount === undefined || amount === "") return <span className="fin-money fin-money--empty">—</span>;
  const neg = String(amount).startsWith("-");
  return (
    <span className={`fin-money${neg ? " fin-money--negative" : ""}`} dir="ltr" data-testid={testId}>
      {amount}
      {currency ? <span className="fin-money__ccy"> {currency}</span> : null}
    </span>
  );
}

/** Horizontal scroll stays inside the container (never the page). */
export function FinanceTable({ caption, children, testId }) {
  return (
    <div className="fin-table-wrap" role="region" aria-label={caption} tabIndex={0} data-testid={testId}>
      <table className="fin-table">
        {caption ? <caption className="fin-sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function FinanceNotice({ tone = "info", children, testId }) {
  return (
    <div className={`fin-notice fin-notice--${tone}`} role={tone === "danger" ? "alert" : "note"} data-testid={testId}>
      {children}
    </div>
  );
}

export function StatusBadge({ tone = "neutral", children, testId }) {
  return (
    <span className={`oh-badge oh-badge--${tone}`} data-testid={testId}>
      {children}
    </span>
  );
}
