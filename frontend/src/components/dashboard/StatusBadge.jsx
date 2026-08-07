const TONES = /** @type {const} */ ({
  neutral: "bg-[var(--dash-hover,#eef1f4)] text-[var(--dash-text,#172033)] border-[var(--dash-border,#c9d0da)]",
  active: "bg-[var(--dash-success-bg,#e8f7f0)] text-[var(--dash-success,#0f7a4f)] border-[var(--dash-success-border,#b7e4ce)]",
  inactive: "bg-[var(--dash-disabled,#f3f4f6)] text-[var(--dash-text-secondary,#4b5563)] border-[var(--dash-border,#c9d0da)]",
  pending: "bg-[var(--dash-warning-bg,#fff6e8)] text-[var(--dash-warning,#b86a00)] border-[var(--dash-warning-border,#f0d4a8)]",
  success: "bg-[var(--dash-success-bg,#e8f7f0)] text-[var(--dash-success,#0f7a4f)] border-[var(--dash-success-border,#b7e4ce)]",
  warning: "bg-[var(--dash-warning-bg,#fff6e8)] text-[var(--dash-warning,#b86a00)] border-[var(--dash-warning-border,#f0d4a8)]",
  danger: "bg-[var(--dash-danger-bg,#fdecec)] text-[var(--dash-danger,#c03535)] border-[var(--dash-danger-border,#f0b4b4)]",
  admin_assigned: "bg-[var(--dash-info-bg,#eef1f6)] text-[var(--dash-primary,#2f3b65)] border-[var(--dash-info-border,#cfd5e0)]",
});

const BASE =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-bold leading-tight";

/**
 * Small status pill — pass visible text as `children`.
 * @param {object} p
 * @param {import("react").ReactNode} p.children
 * @param {keyof typeof TONES} [p.tone]
 * @param {string} [p.className]
 */
export default function StatusBadge({ children, tone = "neutral", className = "" }) {
  const mod = TONES[tone] || TONES.neutral;
  return <span className={`${BASE} ${mod} ${className}`.trim()}>{children}</span>;
}
