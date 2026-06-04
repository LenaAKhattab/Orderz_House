/** Inline SVG icons for attention cards (no external deps). */

function IconShell({ children, className = "" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function AttentionIconClock(props) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </IconShell>
  );
}

export function AttentionIconHourglass(props) {
  return (
    <IconShell {...props}>
      <path d="M6 4h12M6 20h12M8 4v4l4 4-4 4v4M16 4v4l-4 4 4 4v4" />
    </IconShell>
  );
}

export function AttentionIconCard(props) {
  return (
    <IconShell {...props}>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
    </IconShell>
  );
}

export function AttentionIconUser(props) {
  return (
    <IconShell {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </IconShell>
  );
}

export function AttentionIconUsers(props) {
  return (
    <IconShell {...props}>
      <circle cx="9" cy="9" r="2.5" />
      <circle cx="16" cy="10" r="2" />
      <path d="M4 19c0-2.5 2.2-4.5 5-4.5M13 19c0-2 1.6-3.5 3.5-3.8" />
    </IconShell>
  );
}

export function AttentionIconBell(props) {
  return (
    <IconShell {...props}>
      <path d="M12 4a4 4 0 0 0-4 4v3l-2 3h12l-2-3V8a4 4 0 0 0-4-4" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </IconShell>
  );
}

export function AttentionIconGraduation(props) {
  return (
    <IconShell {...props}>
      <path d="M4 10l8-4 8 4-8 4-8-4z" />
      <path d="M6 12v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
      <path d="M20 10v6" />
    </IconShell>
  );
}

export function AttentionIconClaims(props) {
  return (
    <IconShell {...props}>
      <path d="M8 4h11l-3 4 3 4H8V4z" />
      <path d="M6 20h12" />
    </IconShell>
  );
}

export function AttentionIconClipboard(props) {
  return (
    <IconShell {...props}>
      <rect x="7" y="5" width="10" height="14" rx="1.5" />
      <path d="M9 5h6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2" />
    </IconShell>
  );
}

export function AttentionIconAlert(props) {
  return (
    <IconShell {...props}>
      <path d="M12 4l9 16H3L12 4z" />
      <path d="M12 10v4M12 18h.01" />
    </IconShell>
  );
}

const ICON_BY_KEY = {
  "pending-activation": AttentionIconClock,
  "alert-pending_activations": AttentionIconClock,
  "stale-orders": AttentionIconHourglass,
  "alert-orders_waiting_too_long": AttentionIconHourglass,
  "alert-pending_or_failed_payments": AttentionIconCard,
  "inactive-freelancers": AttentionIconUser,
  "alert-inactive_subscribed_freelancers": AttentionIconUser,
  "cat-shortage": AttentionIconUsers,
  "low-courses": AttentionIconGraduation,
  "courses-stuck": AttentionIconGraduation,
  "alert-low_performing_courses": AttentionIconGraduation,
  "stale-claims": AttentionIconClaims,
  "pending-claims": AttentionIconClaims,
  "alert-pending_claims_review": AttentionIconClaims,
  "alert-unread_notifications": AttentionIconBell,
  "alert-internal_orders_pending": AttentionIconClipboard,
};

export function AttentionTypeIcon({ itemId, className }) {
  const Icon = ICON_BY_KEY[itemId] || AttentionIconAlert;
  return <Icon className={className} />;
}
