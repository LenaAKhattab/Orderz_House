/**
 * OZ-Articles-Bildazo-02 — writing mode + package requirement defaults.
 */

const ARTICLE_WRITING_MODES = Object.freeze(["ai", "manual", "either"]);

const ARTICLE_WRITING_SOURCES = Object.freeze([
  "HUMAN_WRITTEN",
  "AI_ASSISTED",
  "UNKNOWN",
]);

const ARTICLE_PACKAGE_PLAN_CODES = Object.freeze(["STARTER", "SILVER", "PRO", "ELITE"]);

const ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS = Object.freeze({
  STARTER: { minWords: 600, minReferences: 2 },
  SILVER: { minWords: 1200, minReferences: 4 },
  PRO: { minWords: 1800, minReferences: 6 },
  ELITE: { minWords: 2400, minReferences: 8 },
});

/** Membership article_access_level mapping used as article_level when plan drives inventory. */
const ARTICLE_PACKAGE_TO_LEVEL = Object.freeze({
  STARTER: 1,
  SILVER: 2,
  PRO: 3,
  ELITE: 5,
});

const ARTICLE_PACKAGE_PLAN_LABELS_AR = Object.freeze({
  STARTER: "تجربة / مجاني",
  SILVER: "فضية (Silver)",
  PRO: "احترافية (Pro)",
  ELITE: "نخبة (Elite)",
});

function normalizePackagePlanCode(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (ARTICLE_PACKAGE_PLAN_CODES.includes(s)) return s;
  const lower = String(raw || "")
    .trim()
    .toLowerCase();
  const map = {
    starter: "STARTER",
    free: "STARTER",
    trial: "STARTER",
    basic: "STARTER",
    silver: "SILVER",
    pro: "PRO",
    elite: "ELITE",
  };
  return map[lower] || null;
}

function articleLevelForPackagePlan(planCode) {
  const code = normalizePackagePlanCode(planCode);
  return code ? ARTICLE_PACKAGE_TO_LEVEL[code] : null;
}

function tierCodeForPackagePlan(planCode) {
  const code = normalizePackagePlanCode(planCode);
  return code ? code.toLowerCase() : null;
}

const WRITING_MODE_LABELS_AR = Object.freeze({
  ai: "بالذكاء الاصطناعي",
  manual: "يدوي",
  either: "لا يفرق",
});

function normalizeWritingMode(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (ARTICLE_WRITING_MODES.includes(s)) return s;
  return null;
}

function normalizeWritingSource(raw) {
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (s === "HUMAN" || s === "HUMAN_WRITTEN") return "HUMAN_WRITTEN";
  if (s === "AI" || s === "AI_ASSISTED") return "AI_ASSISTED";
  if (s === "UNKNOWN") return "UNKNOWN";
  return null;
}

function writingSourceSatisfiesMode(writingSource, writingMode) {
  const mode = normalizeWritingMode(writingMode) || "either";
  const source = normalizeWritingSource(writingSource);
  if (!source || source === "UNKNOWN") return false;
  if (mode === "either") return true;
  if (mode === "ai") return source === "AI_ASSISTED";
  if (mode === "manual") return source === "HUMAN_WRITTEN";
  return false;
}

function countReferences(referencesText) {
  const text = String(referencesText || "").trim();
  if (!text) return 0;
  // Prefer newline-separated entries; also accept numbered lists / semicolons.
  const parts = text
    .split(/\n+|;\s+/)
    .map((p) => p.replace(/^\s*\d+[.)\-]\s*/, "").trim())
    .filter(Boolean);
  return parts.length;
}

function countWords(content) {
  const text = String(content || "").trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

module.exports = {
  ARTICLE_WRITING_MODES,
  ARTICLE_WRITING_SOURCES,
  ARTICLE_PACKAGE_PLAN_CODES,
  ARTICLE_PACKAGE_REQUIREMENT_DEFAULTS,
  ARTICLE_PACKAGE_TO_LEVEL,
  ARTICLE_PACKAGE_PLAN_LABELS_AR,
  WRITING_MODE_LABELS_AR,
  normalizePackagePlanCode,
  articleLevelForPackagePlan,
  tierCodeForPackagePlan,
  normalizeWritingMode,
  normalizeWritingSource,
  writingSourceSatisfiesMode,
  countReferences,
  countWords,
};
