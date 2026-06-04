/** Client-side display helpers for admin plan cards (no API changes). */

import { planListItems } from "../../components/plans/planDisplayUtils";

export function formatPriceJod(priceJod) {
  if (priceJod == null || Number.isNaN(Number(priceJod))) return null;
  return `${Number(priceJod).toLocaleString("ar-JO-u-nu-latn", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} د.أ`;
}

export function formatOrderValueRange(minJod, maxJod) {
  const fmt = (v) =>
    Number(v).toLocaleString("ar-JO-u-nu-latn", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const min = minJod != null && !Number.isNaN(Number(minJod)) ? Number(minJod) : null;
  const max = maxJod != null && !Number.isNaN(Number(maxJod)) ? Number(maxJod) : null;

  if (min != null && max != null) return `${fmt(min)} د.أ → ${fmt(max)} د.أ`;
  if (min != null) return `من ${fmt(min)} د.أ`;
  if (max != null) return `حتى ${fmt(max)} د.أ`;
  return null;
}

export const PLAN_CARD_FEATURES = [
  { key: "selfSubscribeAllowed", label: "شراء ذاتي مباشر", icon: "🛒" },
  { key: "requiresCompanyVisit", label: "تفعيل بزيارة ميدانية", icon: "📍" },
  { key: "isVisible", label: "معروضة في المتجر", icon: "👁" },
  { key: "isFeatured", label: "باقة مميزة في الواجهة", icon: "★" },
  { key: "isPopular", label: "موسومة كالأكثر شيوعاً", icon: "◆" },
];

const BENEFIT_ICON_DEFAULT = "✓";

/**
 * Benefit lines for card display — config flags + stored feature/training bullets.
 */
export function buildPlanBenefits(plan) {
  const items = [];

  for (const row of PLAN_CARD_FEATURES) {
    if (!plan?.[row.key]) continue;
    items.push({ id: row.key, text: row.label, icon: row.icon || BENEFIT_ICON_DEFAULT, kind: "flag" });
  }

  const bullets = planListItems(plan);
  for (const text of bullets) {
    const icon = String(text).includes("تدريب") ? "▶" : BENEFIT_ICON_DEFAULT;
    items.push({ id: `bullet-${items.length}`, text, icon, kind: "bullet" });
  }

  return items.slice(0, 10);
}

export function computePlanKpis(plans = []) {
  const list = Array.isArray(plans) ? plans : [];
  return {
    total: list.length,
    active: list.filter((p) => p.isActive).length,
    storeVisible: list.filter((p) => p.isVisible).length,
    inactive: list.filter((p) => !p.isActive).length,
  };
}

export function filterPlans(plans, { search = "", status = "all", visibility = "all", selfPurchase = "all" } = {}) {
  const q = String(search || "")
    .trim()
    .toLowerCase();

  return (plans || []).filter((plan) => {
    if (q) {
      const hay = `${plan.title || ""} ${plan.name || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }

    if (status === "active" && !plan.isActive) return false;
    if (status === "inactive" && plan.isActive) return false;

    if (visibility === "visible" && !plan.isVisible) return false;
    if (visibility === "hidden" && plan.isVisible) return false;

    if (selfPurchase === "allowed" && !plan.selfSubscribeAllowed) return false;
    if (selfPurchase === "blocked" && plan.selfSubscribeAllowed) return false;

    return true;
  });
}
