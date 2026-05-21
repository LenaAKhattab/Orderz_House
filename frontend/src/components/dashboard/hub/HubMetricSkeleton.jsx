import "./hubMetricSkeleton.css";

/**
 * Shimmer placeholder for stat values and tab counts while loading.
 * @param {{ variant?: "stat" | "count", className?: string }} props
 */
export default function HubMetricSkeleton({ variant = "stat", className = "" }) {
  const variantClass = variant === "count" ? "hub-metric-skel--count" : "hub-metric-skel--stat";
  return <span className={`hub-metric-skel ${variantClass} ${className}`.trim()} aria-hidden />;
}
