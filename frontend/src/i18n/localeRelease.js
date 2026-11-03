/**
 * Locales exposed to every user in the language selector.
 *
 * Release gate: a locale may only be listed here when `npm run i18n:check` reports 100% static coverage,
 * placeholder parity and no likely-untranslated values for it (enforced by i18nReleaseGate.test.js and by
 * `prebuild`). Until then it stays reachable only through the internal preview (`?i18n_preview=1`).
 */
export const RELEASED_LOCALES = Object.freeze(["ar", "en", "de", "nl", "ro"]);
