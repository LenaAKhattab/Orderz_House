/** Client-side display helpers for admin plan cards (no API changes). */

import { planListItems } from "../../components/plans/planDisplayUtils";
import { pt } from "../../i18n/activeLocale.js";
import { pickIntlTag } from "../../i18n/intlLocale.js";
import { legacyArabicUiLocale } from "../adminLocale.js";

/** Admin plan cards historically used Arabic copy in both AR and EN UIs; de / nl / ro get their own. */
function formatJodAmount(v, loc) {
  return Number(v).toLocaleString(pickIntlTag(loc, { ar: "ar-JO-u-nu-latn", en: "ar-JO-u-nu-latn" }), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPriceJod(priceJod, locale) {
  if (priceJod == null || Number.isNaN(Number(priceJod))) return null;
  const loc = legacyArabicUiLocale(locale);
  return pt("platformAdmin.planCard.priceJod", { amount: formatJodAmount(priceJod, loc) }, loc);
}

export function formatOrderValueRange(minJod, maxJod, locale) {
  const loc = legacyArabicUiLocale(locale);
  const fmt = (v) => formatJodAmount(v, loc);

  const min = minJod != null && !Number.isNaN(Number(minJod)) ? Number(minJod) : null;
  const max = maxJod != null && !Number.isNaN(Number(maxJod)) ? Number(maxJod) : null;

  if (min != null && max != null) {
    return pt("platformAdmin.planCard.orderRange.between", { min: fmt(min), max: fmt(max) }, loc);
  }
  if (min != null) return pt("platformAdmin.planCard.orderRange.from", { min: fmt(min) }, loc);
  if (max != null) return pt("platformAdmin.planCard.orderRange.upTo", { max: fmt(max) }, loc);
  return null;
}

function planCardFeature(key, icon) {
  return Object.freeze({
    key,
    get label() {
      return pt(`platformAdmin.planCard.features.${key}`, undefined, legacyArabicUiLocale());
    },
    icon,
  });
}

export const PLAN_CARD_FEATURES = [
  planCardFeature("selfSubscribeAllowed", "🛒"),
  planCardFeature("requiresCompanyVisit", "📍"),
  planCardFeature("isVisible", "👁"),
  planCardFeature("isFeatured", "★"),
  planCardFeature("isPopular", "◆"),
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
