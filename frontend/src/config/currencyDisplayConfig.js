/**
 * Display-only currency settings for public pricing UI.
 * Checkout / Stripe remain in JOD on the backend.
 */

// TODO: replace with live/admin-managed exchange rate (API or CMS).
export const JOD_TO_EGP_RATE = (() => {
  const raw = import.meta.env?.VITE_JOD_TO_EGP_RATE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 70.5;
})();

/** Mirrors backend SUBSCRIPTION_ACTIVATION_FEE_JOD — display only. */
export const SUBSCRIPTION_ACTIVATION_FEE_JOD = 25;

export const DISPLAY_CURRENCY = {
  JOD: "JOD",
  EGP: "EGP",
};

/** localStorage key for manual country override (local QA). */
export const COUNTRY_OVERRIDE_STORAGE_KEY = "orderzhouse_country";
