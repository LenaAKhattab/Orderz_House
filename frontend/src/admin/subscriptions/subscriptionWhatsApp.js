import {
  paymentStatusLabel,
  subscriptionStatusLabel,
  activationStatusLabel,
  formatSubscriptionAdminDateTime,
  formatFreelancerDisplayName,
} from "./subscriptionAdminDisplay";
import { getLocalizedCountryName } from "../../utils/countryDisplay";

/** Localized country name using billing country first, then account country. */
export function resolveFreelancerCountryLabel(sub) {
  const f = sub?.freelancer || {};
  return getLocalizedCountryName(f.billingCountry) || getLocalizedCountryName(f.country) || "";
}

const ARABIC_DIGIT_MAP = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

/** Convert Arabic-Indic / Eastern Arabic-Indic numerals to Latin digits. */
export function toEnglishDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (d) => ARABIC_DIGIT_MAP[d] || d);
}

/**
 * Normalize a phone/WhatsApp number to a WhatsApp-ready international digit string.
 * - converts Arabic numerals to English
 * - strips spaces, dashes, parentheses, and a leading "+"
 * - removes a leading "00" (international prefix)
 * Returns null when there is no usable number.
 */
export function normalizeWhatsappNumber(raw) {
  if (raw == null) return null;
  let digits = toEnglishDigits(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length < 8) return null;
  return digits;
}

/** Pick the best available number (WhatsApp first, then phone) from a subscription's freelancer. */
export function resolveFreelancerWhatsapp(sub) {
  const f = sub?.freelancer || {};
  const candidates = [f.whatsapp, f.phone];
  for (const candidate of candidates) {
    const normalized = normalizeWhatsappNumber(candidate);
    if (normalized) {
      return { raw: String(candidate).trim(), normalized };
    }
  }
  return { raw: "", normalized: null };
}

/** Whether the WhatsApp action should be offered for this row (paid subscriptions only). */
export function isWhatsappEligibleSubscription(sub) {
  return String(sub?.paymentStatus || "").trim().toLowerCase() === "paid";
}

/**
 * Ordered field groups for the WhatsApp composer. Each field resolves to a printable
 * string (empty string means "no value" and is skipped in the generated message).
 */
export function getWhatsappFieldGroups(sub, planTitle, t) {
  const f = sub?.freelancer || {};
  const dt = (v) => {
    const out = formatSubscriptionAdminDateTime(v);
    return out === "—" ? "" : out;
  };
  const clean = (v) => (v && String(v).trim() && String(v).trim() !== "—" ? String(v).trim() : "");
  const fieldLabel = (id) => t(`subscriptions.whatsapp.fields.${id}`);
  return [
    {
      id: "user",
      title: t("subscriptions.whatsapp.sections.user"),
      fields: [
        { id: "fullName", label: fieldLabel("fullName"), value: formatFreelancerDisplayName(sub, t) },
        { id: "email", label: fieldLabel("email"), value: f.email || "" },
        { id: "phone", label: fieldLabel("phone"), value: f.phone || "" },
        { id: "whatsapp", label: fieldLabel("whatsapp"), value: f.whatsapp || "" },
        { id: "country", label: fieldLabel("country"), value: resolveFreelancerCountryLabel(sub) },
        { id: "accountId", label: fieldLabel("accountId"), value: f.accountId || "" },
      ],
    },
    {
      id: "subscription",
      title: t("subscriptions.whatsapp.sections.subscription"),
      fields: [
        { id: "subId", label: fieldLabel("subId"), value: sub?.id ? `#${sub.id}` : "" },
        { id: "subPaymentStatus", label: fieldLabel("subPaymentStatus"), value: clean(paymentStatusLabel(sub?.paymentStatus, t)) },
        { id: "subStatus", label: fieldLabel("subStatus"), value: clean(subscriptionStatusLabel(sub?.status, t)) },
        { id: "subActivationStatus", label: fieldLabel("subActivationStatus"), value: clean(activationStatusLabel(sub?.activationStatus, t)) },
        { id: "assignedAt", label: fieldLabel("assignedAt"), value: dt(sub?.assignedAt) },
        { id: "actualStartDate", label: fieldLabel("actualStartDate"), value: dt(sub?.actualStartDate) },
        { id: "expiryDate", label: fieldLabel("expiryDate"), value: dt(sub?.expiryDate) },
        { id: "firstOrderDate", label: fieldLabel("firstOrderDate"), value: dt(sub?.firstOrderDate) },
      ],
    },
    {
      id: "plan",
      title: t("subscriptions.whatsapp.sections.plan"),
      fields: [
        { id: "planTitle", label: fieldLabel("planTitle"), value: planTitle || sub?.plan?.title || sub?.plan?.name || "" },
        { id: "planId", label: fieldLabel("planId"), value: sub?.planId || "" },
        {
          id: "planDuration",
          label: fieldLabel("duration"),
          value:
            sub?.plan?.durationDays != null
              ? t("subscriptions.whatsapp.fields.durationDays", { days: sub.plan.durationDays })
              : "",
        },
        {
          id: "planPrice",
          label: fieldLabel("price"),
          value:
            sub?.plan?.priceJod != null
              ? t("subscriptions.whatsapp.fields.priceJod", { amount: sub.plan.priceJod })
              : "",
        },
      ],
    },
    {
      id: "payment",
      title: t("subscriptions.whatsapp.sections.payment"),
      fields: [
        { id: "payStatus", label: fieldLabel("payStatus"), value: clean(paymentStatusLabel(sub?.paymentStatus, t)) },
        { id: "paidAt", label: fieldLabel("paidAt"), value: dt(sub?.paidAt) },
        { id: "stripeSessionId", label: fieldLabel("stripeSessionId"), value: sub?.stripeSessionId || "" },
        { id: "stripePaymentIntentId", label: fieldLabel("stripePaymentIntentId"), value: sub?.stripePaymentIntentId || "" },
      ],
    },
  ];
}

/** Default selection: a concise, useful subset (admin can Select-All for everything). */
export const DEFAULT_WHATSAPP_SELECTION = {
  fullName: true,
  subId: true,
  subPaymentStatus: true,
  subStatus: true,
  planTitle: true,
  expiryDate: true,
  planPrice: true,
};

/**
 * Build the final Arabic WhatsApp message from selected fields + optional admin text.
 * Empty-valued or unselected fields are skipped; empty groups are omitted entirely.
 */
export function buildSubscriptionWhatsAppMessage({ sub, planTitle, selection = {}, customText = "", t }) {
  if (!t) throw new Error("buildSubscriptionWhatsAppMessage requires t");
  const groups = getWhatsappFieldGroups(sub, planTitle, t);
  const parts = [];

  const trimmedCustom = String(customText || "").trim();
  if (trimmedCustom) parts.push(trimmedCustom);

  for (const group of groups) {
    const lines = group.fields
      .filter((field) => selection[field.id] && String(field.value || "").trim())
      .map((field) => `• ${field.label}: ${String(field.value).trim()}`);
    if (lines.length) {
      parts.push([`*${group.title}*`, ...lines].join("\n"));
    }
  }

  return parts.join("\n\n").trim();
}
