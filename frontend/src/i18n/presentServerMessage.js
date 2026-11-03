import { isNewLocale } from "./systemContent.js";
import { resources } from "./resources.js";

const ARABIC = /[؀-ۿ]/;

function catalogHas(ns, path) {
  let cur = resources.en && resources.en[ns];
  for (const part of path) {
    if (cur == null || typeof cur !== "object") return false;
    cur = cur[part];
  }
  return typeof cur === "string";
}

/**
 * Prefer a stable error code when the frontend knows it.
 * Arabic / English: unmapped Arabic server text stays in Arabic and becomes a generic English fallback.
 * German / Dutch / Romanian: never raw backend text — interceptor-localized text, mapped code, or generic.
 */
export function presentServerMessage(payload, t, locale = "ar") {
  const data = payload && typeof payload === "object" && "response" in payload
    ? payload.response?.data
    : payload;
  const code = String(data?.code || "").trim();
  if (code && catalogHas("users", ["errors", "codes", code])) {
    const key = `users.errors.codes.${code}`;
    const mapped = t(key);
    if (mapped && mapped !== key) return mapped;
  }
  const message = String(data?.message || (typeof payload === "string" ? payload : "") || "").trim();
  if (isNewLocale(locale)) {
    if (data?.localized === true && message) return message;
    if (code && catalogHas("apiErrors", ["codes", code])) return t(`apiErrors.codes.${code}`);
    return t("apiErrors.generic");
  }
  if (!message) return t("common.errors.generic");
  if (locale === "en" && ARABIC.test(message)) return t("common.errors.generic");
  return message;
}
