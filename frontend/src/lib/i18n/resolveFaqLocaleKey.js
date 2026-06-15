import { HOME_FAQ_ITEMS } from "../../constants/homeFaqItems";

function normalizeFaqText(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[،,]/g, ",")
    .replace(/\u0640/g, "");
}

/**
 * Map a public FAQ item to a stable locale key (trust, worth, …).
 * @param {{ localeKey?: string, question?: string } | null | undefined} item
 * @param {number} [index]
 * @returns {string | null}
 */
export function resolveFaqLocaleKey(item, index) {
  if (item?.localeKey) return item.localeKey;

  const normalized = normalizeFaqText(item?.question);
  if (normalized) {
    const match = HOME_FAQ_ITEMS.find((entry) => normalizeFaqText(entry.q) === normalized);
    if (match) return match.id;
  }

  if (typeof index === "number" && index >= 0 && index < HOME_FAQ_ITEMS.length) {
    return HOME_FAQ_ITEMS[index].id;
  }

  return null;
}
