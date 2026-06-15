const translationService = require("../services/translationService");

const MAX_TEXT_LEN = 2000;
const MAX_BATCH = 40;

function normalizeLang(value, fallback) {
  const v = String(value || fallback || "ar").trim().toLowerCase();
  return v === "en" ? "en" : "ar";
}

async function translateOne(req, res, next) {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      return res.status(400).json({ success: false, message: "text is required" });
    }
    if (text.length > MAX_TEXT_LEN) {
      return res.status(400).json({ success: false, message: "text too long" });
    }

    const sourceLang = normalizeLang(req.body?.sourceLang, "ar");
    const targetLang = normalizeLang(req.body?.targetLang, "en");

    const result = await translationService.translateText(text, { sourceLang, targetLang });
    return res.json({
      success: true,
      sourceText: text,
      translatedText: result.translatedText,
      cached: result.cached,
      fallback: Boolean(result.fallback),
    });
  } catch (err) {
    return next(err);
  }
}

async function translateMany(req, res, next) {
  try {
    const texts = Array.isArray(req.body?.texts) ? req.body.texts : [];
    if (!texts.length) {
      return res.status(400).json({ success: false, message: "texts array is required" });
    }
    if (texts.length > MAX_BATCH) {
      return res.status(400).json({ success: false, message: `max ${MAX_BATCH} texts per batch` });
    }

    const tooLong = texts.some((t) => String(t || "").trim().length > MAX_TEXT_LEN);
    if (tooLong) {
      return res.status(400).json({ success: false, message: "one or more texts too long" });
    }

    const sourceLang = normalizeLang(req.body?.sourceLang, "ar");
    const targetLang = normalizeLang(req.body?.targetLang, "en");

    const translations = await translationService.translateBatch(texts, { sourceLang, targetLang });
    return res.json({ success: true, translations });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  translateOne,
  translateMany,
};
