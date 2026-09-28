const ARABIC = /[\u0600-\u06FF]/;

/**
 * Prefer a stable error code when the frontend knows it.
 * Unmapped Arabic server text stays in Arabic and becomes a generic English fallback.
 */
export function presentServerMessage(payload, t, locale = "ar") {
  const data = payload && typeof payload === "object" && "response" in payload
    ? payload.response?.data
    : payload;
  const code = String(data?.code || "").trim();
  if (code) {
    const key = `users.errors.codes.${code}`;
    const mapped = t(key);
    if (mapped && mapped !== key) return mapped;
  }
  const message = String(data?.message || (typeof payload === "string" ? payload : "") || "").trim();
  if (!message) return t("common.errors.generic");
  if (locale === "en" && ARABIC.test(message)) return t("common.errors.generic");
  return message;
}
