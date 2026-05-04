/**
 * Shared review row for create-order flows (RTL-safe, long-text safe).
 * Keeps labels and values inside the modal without horizontal overflow.
 */
export function CreateOrderReviewRow({ label, children, multiline = false }) {
  const vClass = multiline ? "oh-review__v oh-review__v--pre" : "oh-review__v";
  return (
    <div className="oh-review__row">
      <div className="oh-review__k">{label}</div>
      <div className={vClass}>{children}</div>
    </div>
  );
}
