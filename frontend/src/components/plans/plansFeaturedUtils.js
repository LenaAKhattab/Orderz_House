/** Pick highlighted plan index (popular → featured → PRO tier → middle). */
export function pickFeaturedPlanIndex(plans) {
  const popular = plans.findIndex((p) => p?.isPopular === true || p?.is_popular === true);
  if (popular >= 0) return popular;
  const featured = plans.findIndex((p) => p?.isFeatured === true || p?.is_featured === true);
  if (featured >= 0) return featured;
  const pro = plans.findIndex(
    (p) => String(p?.tierCode || "").trim().toLowerCase() === "pro",
  );
  if (pro >= 0) return pro;
  if (plans.length === 0) return -1;
  return Math.floor(plans.length / 2);
}
