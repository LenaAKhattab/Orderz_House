const ytpl = require("ytpl");

function safeUrl(raw) {
  try {
    return new URL(String(raw || "").trim());
  } catch {
    return null;
  }
}

function extractYoutubeVideoId(input) {
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

function extractYoutubePlaylistId(input) {
  const u = safeUrl(input);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./i, "").toLowerCase();
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
  return u.searchParams.get("list") || null;
}

async function fetchVideoTitle(videoId) {
  if (!videoId) return null;
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) return null;
  const json = await res.json();
  return json?.title ? String(json.title).trim() : null;
}

async function importYoutubeSource(sourceUrl) {
  const playlistId = extractYoutubePlaylistId(sourceUrl);
  if (playlistId) {
    const list = await ytpl(playlistId, { pages: Infinity });
    const lessons = (list.items || [])
      .map((item, idx) => ({
        title: String(item.title || `الدرس ${idx + 1}`).trim(),
        youtubeVideoId: String(item.id || "").trim(),
        youtubeUrl: `https://www.youtube.com/watch?v=${String(item.id || "").trim()}`,
        sortOrder: idx + 1,
        durationSeconds: Number.isFinite(Number(item.durationSec)) ? Number(item.durationSec) : null,
      }))
      .filter((x) => x.youtubeVideoId);
    if (!lessons.length) {
      const err = new Error("تعذر استيراد دروس من قائمة التشغيل.");
      err.statusCode = 400;
      throw err;
    }
    return { sourceType: "playlist", lessons };
  }

  const videoId = extractYoutubeVideoId(sourceUrl);
  if (!videoId) {
    const err = new Error("رابط يوتيوب غير صالح. استخدم رابط فيديو أو قائمة تشغيل.");
    err.statusCode = 400;
    throw err;
  }
  const title = (await fetchVideoTitle(videoId)) || "درس جديد";
  return {
    sourceType: "video",
    lessons: [
      {
        title,
        youtubeVideoId: videoId,
        youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
        sortOrder: 1,
        durationSeconds: null,
      },
    ],
  };
}

module.exports = {
  extractYoutubeVideoId,
  extractYoutubePlaylistId,
  importYoutubeSource,
};
