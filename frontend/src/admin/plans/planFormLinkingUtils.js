import { buildPlanPagesIndex } from "./planAdminSections";
import { localeFromEnFlag } from "../../i18n/activeLocale.js";
import { pickIntlTag } from "../../i18n/intlLocale.js";
import { isNewLocale, localizeSystemText } from "../../i18n/systemContent.js";

export function formatPlanPagePath(page) {
  if (!page) return "/plans";
  return page.slug ? `/plans/${page.slug}` : "/plans";
}

export function formatPlanPageOptionLabel(page, isEn = false) {
  if (!page) return "";
  const loc = localeFromEnFlag(isEn);
  const title = isNewLocale(loc)
    ? localizeSystemText(loc, { ar: page.title, en: page.titleEn }) || "—"
    : isEn && page.titleEn
      ? String(page.titleEn)
      : String(page.title || "").trim() || "—";
  return `${title} (${formatPlanPagePath(page)})`;
}

export function formatCheckoutPlanPriceLabel(priceJod, isEn = false) {
  const loc = localeFromEnFlag(isEn);
  // Arabic keeps the dinar sign; every Latin-script locale uses the currency code JOD.
  const latin = loc !== "ar";
  const n = priceJod == null || priceJod === "" ? 0 : Number(priceJod);
  if (!Number.isFinite(n) || n === 0) {
    return latin ? "0 JOD" : "0 د.أ";
  }
  const formatted = n.toLocaleString(pickIntlTag(loc, { ar: "ar-JO-u-nu-latn", en: "en-US" }), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return latin ? `${formatted} JOD` : `${formatted} د.أ`;
}

export function formatCheckoutPlanOptionLabel(plan, isEn = false) {
  if (!plan) return "";
  const loc = localeFromEnFlag(isEn);
  const title = isNewLocale(loc)
    ? localizeSystemText(loc, { ar: plan.title || plan.name, en: plan.titleEn })
    : isEn && plan.titleEn
      ? String(plan.titleEn)
      : String(plan.title || plan.name || "").trim();
  const price = formatCheckoutPlanPriceLabel(plan.priceJod, isEn);
  return `${title} — ${price}`;
}

export function planHasOwnCheckout(form) {
  if (!form?.selfSubscribeAllowed) return false;
  const priceRaw = form.priceJod;
  const stripeRaw = form.stripeCheckoutAmountJod;
  const price = priceRaw === "" || priceRaw == null ? null : Number(priceRaw);
  const stripe = stripeRaw === "" || stripeRaw == null ? null : Number(stripeRaw);
  const effective =
    stripe != null && Number.isFinite(stripe) && stripe > 0
      ? stripe
      : price != null && Number.isFinite(price) && price > 0
        ? price
        : 0;
  return effective > 0;
}

export function resolvePlanPagesById(planPages) {
  if (planPages instanceof Map) return planPages;
  return buildPlanPagesIndex(planPages || []);
}

export function isPlanOnSpecialPage(form, planPagesOrIndex) {
  const pageId = form?.planPageId;
  if (!pageId) return false;
  const byId = resolvePlanPagesById(planPagesOrIndex);
  const page = byId.get(String(pageId));
  return page?.pageType === "special";
}

export function shouldShowLinkedCheckoutField(form, planPagesOrIndex) {
  return isPlanOnSpecialPage(form, planPagesOrIndex);
}

export function isLinkedCheckoutRequired(form, planPagesOrIndex) {
  return shouldShowLinkedCheckoutField(form, planPagesOrIndex) && !planHasOwnCheckout(form);
}

export function isPlanPageSelectionValid(form, planPagesOrIndex) {
  if (!isPlanOnSpecialPage(form, planPagesOrIndex)) return true;
  return Boolean(form?.planPageId && String(form.planPageId).trim() !== "");
}

export function isLinkedCheckoutSelectionValid(form, planPagesOrIndex) {
  if (!isLinkedCheckoutRequired(form, planPagesOrIndex)) return true;
  return Boolean(form?.subscriptionPlanId && String(form.subscriptionPlanId).trim() !== "");
}

export function isPlanFormLinkingValid(form, planPagesOrIndex) {
  return isPlanPageSelectionValid(form, planPagesOrIndex) && isLinkedCheckoutSelectionValid(form, planPagesOrIndex);
}
