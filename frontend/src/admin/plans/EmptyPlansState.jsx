/**
 * Empty list for super-admin plans.
 */
export default function EmptyPlansState() {
  return (
    <div className="oh-sapl-empty">
      <div className="oh-sapl-empty__icon" aria-hidden>
        <svg viewBox="0 0 48 48" width="48" height="48" fill="none">
          <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="1.5" opacity="0.25" />
          <path
            d="M16 28h16M20 20h8M18 32h12"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            opacity="0.45"
          />
        </svg>
      </div>
      <p className="oh-sapl-empty__title">لا توجد باقات بعد</p>
      <p className="oh-sapl-empty__hint">أنشئ أول باقة من النموذج أعلاه لتظهر هنا.</p>
    </div>
  );
}
