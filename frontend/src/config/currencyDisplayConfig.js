/**
 * Display-only currency settings for public pricing UI.
 * Checkout / Stripe remain in JOD on the backend.
 * Live rates come from GET /public/currency-display; this env value is a local/offline fallback only.
 */
export const JOD_TO_EGP_RATE = (() => {
  const raw = import.meta.env?.VITE_JOD_TO_EGP_RATE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 70.5;
})();

export const DISPLAY_CURRENCY = {
  JOD: "JOD",
  EGP: "EGP",
};

/** localStorage key for manual country override (local QA). */
export const COUNTRY_OVERRIDE_STORAGE_KEY = "orderzhouse_country";
