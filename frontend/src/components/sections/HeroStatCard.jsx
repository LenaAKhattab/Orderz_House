/**
 * Premium floating stat pill for the home hero (RTL-aware).
 * @param {{ value: React.ReactNode, label: string, hint?: string, tone?: "emerald" | "violet", children: React.ReactNode }} p
 */
export default function HeroStatCard({ value, label, hint, tone = "emerald", children }) {
  const toneClass =
    tone === "violet"
      ? "hero-stat-card__icon-wrap--violet"
      : "hero-stat-card__icon-wrap--emerald";

  return (
    <article
      className="hero-stat-card relative flex min-w-0 flex-row items-center gap-3 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-8px_rgba(15,23,42,0.08)] backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 ease-out will-change-transform sm:gap-3.5 sm:px-4 sm:py-3.5 md:rounded-2xl"
      dir="rtl"
    >
      <div
        className={`hero-stat-card__icon-wrap flex size-11 shrink-0 items-center justify-center rounded-full sm:size-12 ${toneClass}`}
        aria-hidden="true"
      >
        {children}
      </div>
      <div className="min-w-0 flex-1 text-start">
        <p className="hero-stat-card__value m-0 font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
        <p className="hero-stat-card__label m-0 mt-0.5 text-[0.7rem] font-semibold leading-snug text-slate-700 sm:text-[0.75rem]">
          {label}
        </p>
        {hint ? (
          <p className="hero-stat-card__hint m-0 mt-0.5 text-[0.65rem] font-medium leading-snug text-slate-500 sm:text-[0.6875rem]">
            {hint}
          </p>
        ) : null}
      </div>
    </article>
  );
}
