/**
 * LTR-isolated numeric display for RTL marketplace/order cards.
 * @param {import("react").ReactNode} children
 * @param {string} [className]
 */
export function MoneyValue({ children, className = "" }) {
  return (
    <span className={["oh-num", "oh-money", className].filter(Boolean).join(" ")} dir="ltr">
      {children}
    </span>
  );
}

/**
 * @param {import("react").ReactNode} children
 * @param {string} [className]
 */
export function DurationValue({ children, className = "" }) {
  return (
    <span className={["oh-num", className].filter(Boolean).join(" ")} dir="ltr">
      {children}
    </span>
  );
}
