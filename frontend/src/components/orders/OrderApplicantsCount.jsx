import { formatApplicantsCountLabel, formatApplicantsCountValue } from "../../utils/orderApplicantsDisplay";

/**
 * Applicant / bidder count for order cards and list rows.
 * Guests never see the numeric count — only a login prompt.
 *
 * @param {{ count?: unknown, isAuthenticated?: boolean, variant?: "label" | "value", className?: string, title?: string, guestMessage?: string, guestTitle?: string, applicantSingular?: string, applicantPlural?: string, emptyLabel?: string }} props
 */
export default function OrderApplicantsCount({
  count = 0,
  isAuthenticated = false,
  variant = "label",
  className,
  title,
  guestMessage,
  guestTitle,
  applicantSingular,
  applicantPlural,
  emptyLabel,
}) {
  const displayOpts = {
    isAuthenticated,
    guestMessage,
    applicantSingular,
    applicantPlural,
    emptyLabel,
  };

  const text =
    variant === "value"
      ? formatApplicantsCountValue(count, displayOpts)
      : formatApplicantsCountLabel(count, displayOpts);

  return (
    <span
      className={className}
      title={title || (!isAuthenticated ? guestTitle : undefined)}
    >
      {text}
    </span>
  );
}
