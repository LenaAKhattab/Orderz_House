import { ARAB_COUNTRIES, DEFAULT_DIAL_CODE } from "../constants/arabCountries";

/** Longest dial-code first so +971 wins over +97, +962 over +96, etc. */
const DIAL_CODES_LONGEST_FIRST = Object.freeze(
  [...new Set(ARAB_COUNTRIES.map((c) => c.dialCode))].sort((a, b) => b.length - a.length),
);

const PLACEHOLDERS_BY_DIAL = Object.freeze({
  "+962": "7XXXXXXXX",
  "+971": "5XXXXXXXX",
  "+966": "5XXXXXXXX",
  "+20": "1XXXXXXXXX",
  "+965": "5XXXXXXX",
  "+974": "3XXXXXXX",
  "+973": "3XXXXXXX",
  "+968": "9XXXXXXX",
  "+961": "3XXXXXX",
  "+970": "5XXXXXXX",
  "+964": "7XXXXXXXX",
  "+963": "9XXXXXXXX",
  "+967": "7XXXXXXXX",
});

export { DEFAULT_DIAL_CODE };

export function normalizePhonePart(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\s()-]/g, "");
}

/**
 * Split a stored E.164 value into country dial code + local number using the
 * known Arab dial-code dataset (longest matching prefix).
 */
export function splitE164(e164, { defaultDialCode = DEFAULT_DIAL_CODE } = {}) {
  const normalized = normalizePhonePart(e164);
  if (!normalized) {
    return { countryCode: defaultDialCode, number: "" };
  }
  if (!normalized.startsWith("+")) {
    return { countryCode: defaultDialCode, number: normalized.replace(/\D/g, "") };
  }
  for (const dial of DIAL_CODES_LONGEST_FIRST) {
    if (normalized.startsWith(dial)) {
      return { countryCode: dial, number: normalized.slice(dial.length) };
    }
  }
  // Unknown international prefix — keep digits after + as local, default dial.
  return { countryCode: defaultDialCode, number: normalized.slice(1).replace(/\D/g, "") };
}

/** UI/client payload shape accepted by backend composeE164. */
export function toPhonePayload({ countryCode, number }) {
  return {
    countryCode: normalizePhonePart(countryCode) || DEFAULT_DIAL_CODE,
    number: normalizePhonePart(number),
  };
}

/** Client-side preview only — server remains authoritative. */
export function composeE164Preview({ countryCode, number }) {
  const payload = toPhonePayload({ countryCode, number });
  return `${payload.countryCode}${payload.number}`;
}

export function phonePlaceholderForDial(dialCode) {
  return PLACEHOLDERS_BY_DIAL[normalizePhonePart(dialCode)] || "XXXXXXXX";
}

export function dialCodeOptions() {
  return ARAB_COUNTRIES.map((c) => ({
    value: c.dialCode,
    label: `${c.flag ? `${c.flag} ` : ""}${c.dialCode} — ${c.nameAr}`,
    compactLabel: `${c.flag ? `${c.flag} ` : ""}${c.dialCode}`,
    flag: c.flag,
    nameAr: c.nameAr,
    code: c.code,
  }));
}
