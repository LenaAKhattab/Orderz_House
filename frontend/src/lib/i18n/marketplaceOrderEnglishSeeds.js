/**
 * Known Arabic pool/training order copy → English display text.
 * Used when title_en / description_en are not yet cached on the API row.
 * Remove entries once backend columns are populated for all marketplace orders.
 */
export const MARKETPLACE_ORDER_TITLE_EN_BY_AR = Object.freeze({
  "صياغة نصوص إعلانية قصيرة لمشروع قائم ضمن ميزانية محددة":
    "Write short ad copy for an existing project within a fixed budget",
  "تحسين مشروع MERN قائم لمؤسسة تعليمية ضمن ميزانية محددة":
    "Improve an existing MERN project for an educational organization within a fixed budget",
  "تصميم هوية بسيطة لمشروع ناشئ لفريق صغير مع توثيق واضح":
    "Design a simple brand identity for a small startup team with clear documentation",
});

export const MARKETPLACE_ORDER_DESCRIPTION_EN_BY_AR = Object.freeze({
  "صياغة نصوص إعلانية قصيرة لمشروع قائم ضمن ميزانية محددة":
    "Write short promotional ad copy for an existing project within a fixed budget.",
  "تحسين مشروع MERN قائم لمؤسسة تعليمية ضمن ميزانية محددة":
    "Improve an existing MERN stack project for an educational organization within a fixed budget.",
  "تصميم هوية بسيطة لمشروع ناشئ لفريق صغير مع توثيق واضح":
    "Design a simple brand identity for a small startup team with clear documentation.",
});

/**
 * @param {string} arabicText
 * @param {Record<string, string>} seedMap
 * @returns {string}
 */
export function lookupMarketplaceEnglishSeed(arabicText, seedMap) {
  const ar = String(arabicText || "").trim();
  if (!ar || !seedMap) return "";

  if (seedMap[ar]) return seedMap[ar];

  let best = "";
  let bestLen = 0;
  for (const [key, en] of Object.entries(seedMap)) {
    if (ar.startsWith(key) && key.length > bestLen) {
      best = en;
      bestLen = key.length;
    }
  }
  return best;
}
