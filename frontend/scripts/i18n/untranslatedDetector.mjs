/**
 * Untranslated-string detector for German / Dutch / Romanian pages (used by the browser QA crawl).
 *
 * Input: visible SYSTEM text samples collected from a rendered page (the crawler excludes user content —
 * elements rendered with dir="auto", which is how the app marks original-language user text — plus form values
 * and elements explicitly in another language via lang="…").
 * Findings:
 *   literalKey      — a catalog key rendered literally ("orders.card.deadline")
 *   brokenValue     — "undefined", "null", "[object Object]", "NaN", "{{var}}"
 *   arabic          — Arabic script on a Latin-script page
 *   englishSource   — text identical to an English catalog value that the locale translates differently
 * Brand names, codes and values intentionally identical in the target locale never count.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(HERE, "../../src/locales");
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const BROKEN = /(^|\s)(undefined|null|NaN)(\s|$)|\[object Object\]|\{\{\s*\w+\s*\}\}/;
const BRANDS = /^(OrderzHouse|Orderz House|FAZAAT|Bildazo|Stripe|WhatsApp|Google Play|App Store|STARTER|SILVER|PRO|ELITE|Starter|Silver|Pro|Elite|JOD|English|Deutsch|Nederlands|Română|العربية)$/;

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

function loadCatalog(locale) {
  const dir = join(LOCALES, locale);
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const ns = f.replace(/\.json$/, "");
    Object.assign(out, flatten(JSON.parse(readFileSync(join(dir, f), "utf8")), ns));
  }
  return out;
}

/** Build a detector for one target locale from the repo catalogs. */
export function createDetector(locale) {
  const en = loadCatalog("en");
  const target = loadCatalog(locale);
  const namespaces = new Set(Object.keys(en).map((k) => k.split(".")[0]));
  const targetValues = new Set(Object.values(target).map((v) => v.trim()));
  const englishOnly = new Set();
  for (const [key, value] of Object.entries(en)) {
    const v = value.trim();
    if (!v || /\{\{/.test(v) || !/[A-Za-z]{3,}/.test(v)) continue;
    if (BRANDS.test(v)) continue;
    // Count only English strings the locale actually translates differently (and that are not words shared by both).
    if (target[key] && target[key].trim() !== v && !targetValues.has(v)) englishOnly.add(v);
  }
  const keyRe = new RegExp(`\\b(${[...namespaces].join("|")})\\.[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)*\\b`);
  return { locale, englishOnly, keyRe };
}

/**
 * @param {string[]} texts visible system text samples (one per text node / element)
 * @param {{ englishOnly: Set<string>, keyRe: RegExp }} detector
 */
export function analyzeTexts(texts, detector) {
  const findings = { literalKey: [], brokenValue: [], arabic: [], englishSource: [] };
  const seen = new Set();
  for (const raw of texts) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    if (detector.keyRe.test(text) && !/\s/.test(text.replace(detector.keyRe, "").trim())) findings.literalKey.push(text);
    else if (detector.keyRe.test(text) && text.split(/\s+/).length <= 3) findings.literalKey.push(text);
    if (BROKEN.test(text)) findings.brokenValue.push(text);
    if (ARABIC.test(text)) findings.arabic.push(text.slice(0, 120));
    if (detector.englishOnly.has(text)) findings.englishSource.push(text);
  }
  return findings;
}

export function countFindings(findings) {
  return Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length]));
}
