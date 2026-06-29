/**
 * Popup ad route safety — block sensitive/auth/payment/admin-editing routes.
 * Used by PopupAdsHost before fetch/display (defense in depth with backend page scopes).
 */

function normalizePath(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

/** Exact path matches — auth, errors */
const BLOCKED_EXACT = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/unauthorized",
]);

/** Prefix matches — admin ads editing, payment/financial flows */
const BLOCKED_PREFIXES = [
  "/dashboard/admin/ads",
  "/dashboard/super-admin/ads",
  "/dashboard/client/financial",
  "/dashboard/client/orders/create",
  "/dashboard/freelancer/plans",
  "/dashboard/freelancer/financial-claims",
  "/dashboard/super-admin/financial-claims",
];

/** Account / security settings (all dashboard roles) */
const SETTINGS_SUFFIX = "/settings";

/**
 * Stripe / checkout return query keys — block on any pathname.
 * @param {string} [search]
 */
function hasPaymentReturnQuery(search) {
  const q = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  if (q.get("session_id")?.trim()) return true;
  if (q.get("payment_intent")?.trim()) return true;
  if (q.get("payment_intent_client_secret")?.trim()) return true;
  const checkout = q.get("checkout");
  if (checkout === "success" || checkout === "cancel") return true;
  return false;
}

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function isPopupRouteBlocked(pathname, search = "") {
  const path = normalizePath(pathname);

  if (BLOCKED_EXACT.has(path)) return true;

  for (const prefix of BLOCKED_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }

  if (path.startsWith("/dashboard/") && (path.endsWith(SETTINGS_SUFFIX) || path.includes(`${SETTINGS_SUFFIX}/`))) {
    return true;
  }

  if (hasPaymentReturnQuery(search)) return true;

  return false;
}

/**
 * True when another app modal/dialog is already open (avoid stacking).
 */
export function isAnotherAppModalOpen() {
  if (typeof document === "undefined") return false;

  for (const d of document.querySelectorAll("dialog[open]")) {
    if (!d.classList.contains("oh-popup-ad-modal")) return true;
  }

  if (document.querySelector(".dash-ui-modal")) return true;
  if (document.querySelector(".oh-admin-ads__preview-drawer")) return true;
  if (
    document.querySelector(
      ".client-order-modal, .oh-admin-courses__modal-backdrop, .oh-sapl-modal, .oh-admins-modal, .oh-training-applicants-modal",
    )
  ) {
    return true;
  }

  for (const el of document.querySelectorAll('[role="dialog"][aria-modal="true"]')) {
    if (!el.classList.contains("oh-popup-ad-modal") && !el.closest(".oh-popup-ad-modal")) {
      return true;
    }
  }

  return false;
}

/**
 * @param {string} pathname
 * @param {string} [search]
 */
export function canShowPopupOnRoute(pathname, search = "") {
  if (isPopupRouteBlocked(pathname, search)) return false;
  if (isAnotherAppModalOpen()) return false;
  return true;
}

/** @returns {string[]} */
export function listBlockedPopupRoutes() {
  return [
    ...BLOCKED_EXACT,
    ...BLOCKED_PREFIXES,
    "/dashboard/*/settings (all roles)",
    "any route with ?session_id=, ?payment_intent=, or ?checkout=success|cancel",
  ];
}
