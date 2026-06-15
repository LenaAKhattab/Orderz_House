const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BRAND_VOICE_HINT =
  "Translate for a modern freelance marketplace (Orderz House). Tone: professional, clear, simple, friendly but not casual. Use natural English marketing copy — not literal word-for-word translation. Keep buttons short. Avoid poetic or exaggerated marketing language.";

const CACHE_FILE = path.join(__dirname, "..", "..", "data", "translation-cache.json");
const MAX_CACHE_ENTRIES = 10000;

/** @type {Map<string, string>} */
const memoryCache = new Map();

function getApiKey() {
  return (
    String(process.env.TRANSLATION_API_KEY || "").trim() ||
    String(process.env.DEEPL_API_KEY || "").trim() ||
    ""
  );
}

function getProvider() {
  const explicit = String(process.env.TRANSLATION_PROVIDER || "").trim().toLowerCase();
  if (explicit === "deepl" || explicit === "openai") return explicit;
  if (getApiKey().startsWith("sk-")) return "openai";
  return "deepl";
}

function cacheId(sourceLang, targetLang, text) {
  const hash = crypto.createHash("sha256").update(`${sourceLang}:${targetLang}:${text}`).digest("hex");
  return hash;
}

function loadDiskCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!raw || typeof raw !== "object") return;
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "string") memoryCache.set(key, value);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[translation] failed to load cache file:", err.message);
  }
}

function persistDiskCache() {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const entries = [...memoryCache.entries()];
    const slice = entries.length > MAX_CACHE_ENTRIES ? entries.slice(-MAX_CACHE_ENTRIES) : entries;
    const obj = Object.fromEntries(slice);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj), "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[translation] failed to persist cache:", err.message);
  }
}

let persistTimer = null;
function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistDiskCache();
  }, 2000);
}

loadDiskCache();

function readCache(sourceLang, targetLang, text) {
  return memoryCache.get(cacheId(sourceLang, targetLang, text));
}

function writeCache(sourceLang, targetLang, text, translated) {
  memoryCache.set(cacheId(sourceLang, targetLang, text), translated);
  schedulePersist();
}

function mapDeepLLang(code) {
  const c = String(code || "").toLowerCase();
  if (c === "ar") return "AR";
  if (c === "en") return "EN";
  if (c === "en-us") return "EN-US";
  if (c === "en-gb") return "EN-GB";
  return c.toUpperCase();
}

async function callDeepL(text, sourceLang, targetLang) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const isFree = apiKey.endsWith(":fx");
  const base = isFree ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const body = new URLSearchParams();
  body.set("auth_key", apiKey);
  body.set("text", text);
  body.set("source_lang", mapDeepLLang(sourceLang));
  body.set("target_lang", mapDeepLLang(targetLang));
  body.set("formality", "default");

  const res = await fetch(`${base}/v2/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`DeepL error ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`);
  }

  const data = await res.json();
  return data?.translations?.[0]?.text || null;
}

async function callOpenAI(text, sourceLang, targetLang) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const model = String(process.env.TRANSLATION_OPENAI_MODEL || "gpt-4o-mini").trim();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${BRAND_VOICE_HINT} Source: ${sourceLang}. Target: ${targetLang}. Return only the translation, no quotes.`,
        },
        { role: "user", content: text },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}${errText ? `: ${errText.slice(0, 120)}` : ""}`);
  }

  const data = await res.json();
  return String(data?.choices?.[0]?.message?.content || "").trim() || null;
}

async function callProvider(text, sourceLang, targetLang) {
  const provider = getProvider();
  if (provider === "openai") return callOpenAI(text, sourceLang, targetLang);
  return callDeepL(text, sourceLang, targetLang);
}

/**
 * @param {string} text
 * @param {{ sourceLang?: string; targetLang?: string }} [options]
 */
async function translateText(text, options = {}) {
  const sourceLang = String(options.sourceLang || "ar").toLowerCase();
  const targetLang = String(options.targetLang || "en").toLowerCase();
  const raw = String(text || "").trim();
  if (!raw) return { translatedText: "", cached: false, provider: null };
  if (sourceLang === targetLang) return { translatedText: raw, cached: true, provider: null };

  const cached = readCache(sourceLang, targetLang, raw);
  if (cached) return { translatedText: cached, cached: true, provider: getProvider() };

  if (!getApiKey()) {
    return { translatedText: raw, cached: false, provider: null, fallback: true };
  }

  try {
    const translated = await callProvider(raw, sourceLang, targetLang);
    const result = String(translated || "").trim() || raw;
    writeCache(sourceLang, targetLang, raw, result);
    return { translatedText: result, cached: false, provider: getProvider() };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[translation] provider error:", err.message);
    return { translatedText: raw, cached: false, provider: getProvider(), fallback: true };
  }
}

/**
 * @param {string[]} texts
 * @param {{ sourceLang?: string; targetLang?: string }} [options]
 */
async function translateBatch(texts, options = {}) {
  const unique = [...new Set((texts || []).map((t) => String(t || "").trim()).filter(Boolean))];
  const results = await Promise.all(unique.map((text) => translateText(text, options)));
  return unique.map((text, i) => ({
    sourceText: text,
    translatedText: results[i].translatedText,
    cached: results[i].cached,
  }));
}

function isTranslationConfigured() {
  return Boolean(getApiKey());
}

module.exports = {
  translateText,
  translateBatch,
  isTranslationConfigured,
};
