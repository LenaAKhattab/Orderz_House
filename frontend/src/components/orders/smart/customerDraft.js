/**
 * Smart Orders S1 — Admin customer-mode draft (wizard state), validation and API payload.
 * The server re-validates everything; these checks only give fast, field-level feedback.
 */

export const CUSTOMER_MODE_OPTIONS = ["internal", "existing", "new_account", "guest"];
export const ADMIN_ORDER_CHANNELS = ["whatsapp", "admin", "phone", "email", "other"];
export const GUEST_CONTACT_CHANNELS = ["whatsapp", "phone", "email", "other"];
export const GUEST_CONSENT_OPTIONS = ["customer_initiated", "verbal", "written"];
export const CUSTOMER_PRICE_CURRENCIES = ["JOD", "AED"];

export function emptyCustomerDraft() {
  return {
    mode: "",
    channel: "whatsapp",
    accountManagerAdminId: "",
    customer: null,
    phone: "",
    referenceName: "",
    contactChannel: "whatsapp",
    whatsappOnly: true,
    consentStatus: "customer_initiated",
    note: "",
    priceAmount: "",
    priceCurrency: "JOD",
  };
}

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
function asciiDigits(s) {
  return String(s ?? "").replace(ARABIC_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Mirrors the server: "+" / "00" prefix, 8–15 digits. Returns null when invalid. */
export function normalizePhoneE164(raw) {
  let s = asciiDigits(raw).trim().replace(/[\s\-().‎‏]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  return /^\+[1-9][0-9]{7,14}$/.test(s) ? s : null;
}

export function isValidPriceText(raw) {
  const s = asciiDigits(raw).trim().replace(/,/g, ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(s) && Number(s) > 0;
}

/** @param {(k: string) => string} t */
export function validateCustomerDraft(d, t) {
  const errors = {};
  if (!CUSTOMER_MODE_OPTIONS.includes(d.mode)) {
    errors.mode = t("smartOrders.errors.mode");
    return errors;
  }
  if (d.mode === "internal") return errors;
  if (d.mode === "existing" && !d.customer?.id) errors.customer = t("smartOrders.errors.customer");
  if (d.mode === "new_account" && !normalizePhoneE164(d.phone)) errors.phone = t("smartOrders.errors.phone");
  if (d.mode === "guest") {
    const hasPhone = String(d.phone || "").trim() !== "";
    if (hasPhone && !normalizePhoneE164(d.phone)) errors.phone = t("smartOrders.errors.phone");
    else if (!hasPhone && (d.contactChannel === "whatsapp" || d.contactChannel === "phone")) {
      errors.phone = t("smartOrders.errors.phoneRequiredForChannel");
    }
  }
  if (String(d.priceAmount || "").trim() && (!isValidPriceText(d.priceAmount) || !CUSTOMER_PRICE_CURRENCIES.includes(d.priceCurrency))) {
    errors.priceAmount = t("smartOrders.errors.price");
  }
  return errors;
}

/** API `customer` block for POST /admin/orders, or null for an internal order. */
export function buildCustomerPayload(d) {
  if (!d || d.mode === "internal" || !d.mode) return null;
  const base = {
    mode: d.mode,
    channel: d.channel,
    accountManagerAdminId: d.accountManagerAdminId || null,
    priceAmount: String(d.priceAmount || "").trim() ? asciiDigits(d.priceAmount).trim().replace(/,/g, ".") : null,
    priceCurrency: String(d.priceAmount || "").trim() ? d.priceCurrency : null,
  };
  if (d.mode === "existing") return { ...base, customerUserId: d.customer?.id || null };
  if (d.mode === "new_account") return { ...base, phone: normalizePhoneE164(d.phone) };
  return {
    ...base,
    phone: String(d.phone || "").trim() ? normalizePhoneE164(d.phone) : null,
    referenceName: String(d.referenceName || "").trim() || null,
    contactChannel: d.contactChannel,
    whatsappOnly: Boolean(d.whatsappOnly),
    consentStatus: d.consentStatus,
    note: String(d.note || "").trim() || null,
  };
}
