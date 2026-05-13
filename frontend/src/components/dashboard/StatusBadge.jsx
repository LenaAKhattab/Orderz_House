const TONES = /** @type {const} */ ({
  neutral: "bg-slate-100 text-slate-800 border-slate-200/90",
  active: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
  inactive: "bg-slate-100 text-slate-600 border-slate-200/80",
  pending: "bg-amber-50 text-amber-900 border-amber-200/80",
  success: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
  warning: "bg-orange-50 text-orange-900 border-orange-200/80",
  danger: "bg-red-50 text-red-900 border-red-200/80",
});

const BASE =
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.72rem] font-bold leading-tight";

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
