/**
 * External (WhatsApp) order intake — shared UI constants.
 * Backend: /api/freelancer/external-order-intakes and /api/admin/external-order-intakes.
 */

export const EXTERNAL_INTAKE_PAGE_SIZE = 15;

export const FREELANCER_WHATSAPP_ORDERS_PATH = "/dashboard/freelancer/whatsapp-orders";
export const ADMIN_WHATSAPP_ORDERS_PATH = "/dashboard/admin/whatsapp-orders";
export const SUPER_ADMIN_WHATSAPP_ORDERS_PATH = "/dashboard/super-admin/whatsapp-orders";

/** Fired after an Admin approves / rejects so the sidebar badge refreshes without polling. */
export const EXTERNAL_INTAKES_CHANGED_EVENT = "oh:external-intakes-changed";

export const EXTERNAL_INTAKE_STATUSES = Object.freeze(["pending_review", "approved", "rejected"]);

export const EXTERNAL_INTAKE_REJECTION_REASONS = Object.freeze([
  "invalid_id",
  "duplicate",
  "not_assigned_to_you",
  "cancelled_externally",
  "other",
]);

/** StatusBadge tone per intake status. */
export function externalIntakeStatusTone(status) {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "pending";
}

/** Same rule as the backend (letters/digits . _ / # -, ≤ 64) after a light client-side cleanup. */
export function cleanExternalOrderIdInput(raw) {
  let v = String(raw ?? "").normalize("NFKC");
  v = v.replace(/\p{Cf}/gu, "");
  let out = "";
  for (const ch of v) {
    const code = ch.codePointAt(0);
    if (code >= 0x0660 && code <= 0x0669) out += String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String(code - 0x06f0);
    else out += ch;
  }
  out = out.trim();
  if (out.startsWith("#")) out = out.slice(1).trim();
  return out;
}

export function isPlausibleExternalOrderId(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._/#-]{0,63}$/.test(String(value || ""));
}

/** Admin price input: up to 6 integer digits and 2 decimals, strictly > 0 (validated again server-side). */
export function isValidApprovalPriceInput(value) {
  const s = String(value ?? "").trim();
  const m = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return false;
  return !(/^0+$/.test(m[1]) && /^0*$/.test(m[2] || ""));
}

export function freelancerOrderPath(orderId) {
  return `/dashboard/freelancer/my-orders/${encodeURIComponent(String(orderId))}`;
}

export function staffOrderPath(orderId, isSuperAdminShell) {
  const base = isSuperAdminShell ? "/dashboard/super-admin/orders" : "/dashboard/admin/orders";
  return `${base}?orderId=${encodeURIComponent(String(orderId))}`;
}
