import { formatApplicantsCountLabel, formatApplicantsCountValue } from "../../utils/orderApplicantsDisplay";

/**
 * Applicant / bidder count for order cards and list rows.
 * Guests never see the numeric count — only a login prompt.
 *
 * @param {{ count?: unknown, isAuthenticated?: boolean, variant?: "label" | "value", className?: string, title?: string }} props
 */
export default function OrderApplicantsCount({
  count = 0,
  isAuthenticated = false,
  variant = "label",
  className,
  title,
}) {
  const text =
    variant === "value"
      ? formatApplicantsCountValue(count, { isAuthenticated })
      : formatApplicantsCountLabel(count, { isAuthenticated });

  return (
    <span
      className={className}
      title={title || (!isAuthenticated ? "سجّل الدخول لعرض عدد المتقدمين" : undefined)}
    >
      {text}
    </span>
  );
}
