import { pt } from "../../i18n/activeLocale.js";
import { tPlural } from "../../i18n/plural.js";

const BASE_KEY_BY_UNIT = Object.freeze({ days: "day", hours: "hour", minutes: "minute" });

/**
 * Duration unit word for the Latin-script locales (en / de / nl / ro), chosen with Intl.PluralRules
 * (Romanian has three forms). Arabic keeps its own dual / 3–10 forms at the call sites.
 *
 * @param {((key: string, values?: Record<string, unknown>) => string) | null | undefined} t translator for `locale`
 * @param {string} locale
 * @param {"days" | "hours" | "minutes" | string} unit unknown units fall back to minutes
 * @param {number} count
 */
export function pluralDurationUnit(t, locale, unit, count) {
  const base = BASE_KEY_BY_UNIT[unit] || "minute";
  const translate = typeof t === "function" ? t : (key, values) => pt(key, values, locale);
  return tPlural(translate, locale, `platformComponents.durationUnits.${base}`, count);
}
