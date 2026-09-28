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
/**
 * Locale key only when this exact field still matches the canonical seed.
 * An edited answer stays admin content even if the question is unchanged.
 * @param {{ question?: string, answer?: string } | null | undefined} item
 * @param {"question" | "answer"} field
 * @returns {string | null}
 */
export function canonicalFaqIdForField(item, field) {
  const raw = field === "answer" ? item?.answer : item?.question;
  const prop = field === "answer" ? "a" : "q";
  const normalized = normalizeFaqText(raw);
  if (!normalized) return null;
  const match = HOME_FAQ_ITEMS.find((entry) => normalizeFaqText(entry[prop]) === normalized);
  return match ? match.id : null;
}

export function resolveFaqLocaleKey(item, _index) {
  if (item?.localeKey) return item.localeKey;

  const normalized = normalizeFaqText(item?.question);
  if (normalized) {
    const match = HOME_FAQ_ITEMS.find((entry) => normalizeFaqText(entry.q) === normalized);
    if (match) return match.id;
  }

  // Position is not an identity. Admin-edited FAQ rows in website_faq_items
  // must stay as entered unless the question still matches the canonical seed.
  return null;
}
