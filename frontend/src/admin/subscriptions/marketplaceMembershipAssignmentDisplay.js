import {
  mapMarketplaceMembershipPlansForPublicPlans,
  PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER,
} from "../../lib/marketplaceMembership/mapMarketplaceMembershipPlanForPublicPlans.js";

export const ADMIN_MARKETPLACE_ASSIGNMENT_HELPER_AR =
  "اختر عضوية سوق العمل التي سيتم إسنادها للمستقل. الباقات هنا مطابقة للباقات المعروضة للمستخدمين.";

export const ADMIN_MARKETPLACE_ASSIGNMENT_SCOPE_NOTE_AR =
  "هذه النافذة مخصصة لإسناد عضويات سوق العمل فقط.";

export const ADMIN_LEGACY_PLANS_SECTION_AR = "باقات قديمة / مؤرشفة";

export const ADMIN_LEGACY_PLAN_WARNING_AR = "قديمة — لا تستخدم للإسناد الجديد";

function formatPriceLabel(priceJod) {
  const n = Number(priceJod);
  if (!Number.isFinite(n) || n <= 0) return "مجاناً";
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(3).replace(/\.?0+$/, "")} د.أ`;
}

/**
 * Canonical admin assignment label aligned with public /plans cards.
 * Example: "STARTER — تجربة مجانية — مجاناً — 10 أيام"
 */
export function formatAdminMarketplaceMembershipAssignmentLabel(plan) {
  const mapped = mapMarketplaceMembershipPlansForPublicPlans([plan])[0];
  if (!mapped) return String(plan?.tierCode || plan?.nameAr || "—").toUpperCase();
  const price = formatPriceLabel(mapped.priceJod);
  const days = mapped.durationDays ? `${mapped.durationDays} يوم` : "—";
  const tagline = mapped.taglineAr || "";
  const starterNote =
    String(mapped.tierCode || "").toLowerCase() === "starter" ? " · تجربة سوق العمل فقط" : "";
  return `${mapped.title} — ${tagline} — ${price} — ${days}${starterNote}`;
}

export function pickCanonicalMarketplaceMembershipsForAssignment(plans) {
  const byTier = new Map(
    (plans || []).map((plan) => [String(plan?.tierCode || "").trim().toLowerCase(), plan]),
  );
  return PUBLIC_MARKETPLACE_MEMBERSHIP_TIER_ORDER.map((tier) => byTier.get(tier)).filter(Boolean);
}

export function formatLegacyPlanAssignmentLabel(plan) {
  const title = plan?.title || plan?.assignmentLabelAr || `plan ${plan?.id}`;
  const days = plan?.durationDays != null ? `${plan.durationDays} يوم` : "—";
  return `${title} (${days}) — ${ADMIN_LEGACY_PLAN_WARNING_AR}`;
}

export function isLegacyAssignmentSelection(form) {
  return form?.assignmentKind === "legacy";
}

export function resolveSelectedAssignmentPlanId(form) {
  if (isLegacyAssignmentSelection(form)) return form?.legacyPlanId || "";
  return form?.marketplacePlanId || "";
}
