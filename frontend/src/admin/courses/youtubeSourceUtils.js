/**
 * Client-side YouTube URL parsing (mirrors backend extractors; no API calls).
 */

function safeUrl(raw) {
  try {
    return new URL(String(raw || "").trim());
  } catch {
    return null;
  }
}

export function extractYoutubeVideoId(input) {
  const u = safeUrl(input);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\/+/, "").split("/")[0];
    return id || null;
  }
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
  if (u.pathname === "/watch") return u.searchParams.get("v") || null;
  if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
  if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
  return null;
}

export function extractYoutubePlaylistId(input) {
  const u = safeUrl(input);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
  return u.searchParams.get("list") || null;
}

/**
 * @param {string} sourceUrl
 * @returns {{ ok: boolean, error?: string, sourceType?: 'playlist'|'video', sourceLabel?: string, expectedLessonCount?: number|null }}
 */
export function isHttpUrl(value) {
  const v = String(value || "").trim();
  return v.startsWith("http://") || v.startsWith("https://");
}

export function analyzeYoutubeSourceUrl(sourceUrl) {
  const trimmed = String(sourceUrl || "").trim();
  if (!trimmed) {
    return { ok: false, error: "أدخل رابط يوتيوب أولاً." };
  }
  const playlistId = extractYoutubePlaylistId(trimmed);
  if (playlistId) {
    return {
      ok: true,
      sourceType: "playlist",
      sourceLabel: "قائمة تشغيل يوتيوب",
      expectedLessonCount: null,
    };
  }
  const videoId = extractYoutubeVideoId(trimmed);
  if (videoId) {
    return {
      ok: true,
      sourceType: "video",
      sourceLabel: "فيديو يوتيوب",
      expectedLessonCount: 1,
    };
  }
  return {
    ok: false,
    error: "رابط يوتيوب غير صالح. استخدم رابط فيديو أو قائمة تشغيل.",
  };
}
