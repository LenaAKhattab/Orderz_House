/**
 * Pick a skeleton layout variant for the locale transition overlay based on route.
 * @param {string} pathname
 * @returns {'home' | 'plans' | 'services' | 'orders' | 'freelancerDashboard' | 'generic'}
 */
export function resolveLocaleSkeletonVariant(pathname) {
  const path = String(pathname || "/");
  if (path === "/") return "home";
  if (path === "/plans") return "plans";
  if (path === "/services") return "services";
  if (path === "/orders" || path.startsWith("/orders/")) return "orders";
  if (path.startsWith("/dashboard/freelancer")) return "freelancerDashboard";
  return "generic";
}
