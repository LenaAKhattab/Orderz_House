/**
 * Shared skeleton primitives (shimmer via `home-skeleton.css`).
 * @param {{ className?: string }} p
 */
export function SkBox({ className = "" }) {
  return <div className={`home-sk-base home-sk-shimmer home-sk-card ${className}`.trim()} aria-hidden />;
}

/**
 * @param {{ className?: string }} p
 */
export function SkLine({ className = "" }) {
  return <span className={`home-sk-base home-sk-shimmer home-sk-line block ${className}`.trim()} aria-hidden />;
}
