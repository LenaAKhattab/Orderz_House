/**
 * Customer-facing WhatsApp copy (Smart Orders S1). Rendered in the language the Admin picks for the
 * customer, independent of the Admin's UI language. Text only — nothing is sent automatically.
 */
import { pt } from "../../../i18n/activeLocale.js";
import { ensureLocaleLoaded } from "../../../i18n/loadLocaleBundle.js";
import { formatLocaleDate } from "../../../i18n/formatLocale.js";

export const MESSAGE_LOCALES = ["ar", "en", "de", "nl", "ro"];

function formatDate(value, locale) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return formatLocaleDate(d, locale) || null;
}

/**
 * @param {{ kind: "account"|"guest"|"conversion", locale: string, customer: object, link?: string|null }} p
 */
export async function buildCustomerMessage({ kind, locale, customer, link = null }) {
  const loc = MESSAGE_LOCALES.includes(locale) ? locale : "ar";
  await ensureLocaleLoaded(loc).catch(() => {});
  const tr = (key, values) => pt(`smartOrders.templates.${key}`, values, loc);
  const pricing = customer?.pricing || {};
  const price =
    pricing.status === "priced" && pricing.amount ? `${pricing.amount} ${pricing.currency}` : tr("pricePending");
  const service = (loc === "ar" ? customer?.serviceName : customer?.serviceNameEn || customer?.serviceName) || "—";
  const dueAt = formatDate(customer?.dueAt, loc) || tr("dueTbd");
  return tr(kind, {
    orderCode: customer?.orderCode || "",
    service,
    dueAt,
    price,
    link: link || "",
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    return true;
  } catch {
    return false;
  }
}
