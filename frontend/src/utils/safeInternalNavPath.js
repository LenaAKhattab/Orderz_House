/**
 * Allow in-app notification navigation only. Rejects protocol URLs, protocol-relative, and non-path values.
 */
export function resolveSafeInternalNavPath(link, fallback = "/dashboard") {
  const raw = String(link || "").trim();
  const fbRaw = fallback == null ? "/dashboard" : String(fallback);
  const fb = fbRaw === "" || fbRaw.startsWith("/") ? fbRaw : "/dashboard";
  if (!raw) return fb;
  if (raw.startsWith("//")) return fb;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fb;
  if (!raw.startsWith("/")) return fb;
  if (raw.includes("\\")) return fb;
  return raw;
}
