#!/usr/bin/env node
/**
 * Translation completeness gate (static UI strings).
 *
 * Canonical keys: English (`src/locales/en`), which must stay in key parity with Arabic.
 * For every target locale (de / nl / ro) and namespace it reports:
 *   missing · extra · empty · wrong type / array length · placeholder mismatch ({{var}} set + counts) ·
 *   markup mismatch (<tag> counts) · malformed interpolation · value equal to its key · Arabic script left in ·
 *   Romanian cedilla letters (ş ţ instead of ș ț) · likely untranslated (identical to English, not allowlisted).
 * Romanian may add `<key>_plural_other` siblings for `_plural` keys (Intl.PluralRules "other": "20 de …").
 *
 * Usage:
 *   node scripts/i18n/checkI18n.mjs                     # all target locales, summary
 *   node scripts/i18n/checkI18n.mjs --locale de --ns orders --details
 *   node scripts/i18n/checkI18n.mjs --json report.json  # machine-readable report
 *   node scripts/i18n/checkI18n.mjs --released          # exit 1 if a RELEASED locale is not 100% clean
 *   node scripts/i18n/checkI18n.mjs --strict            # exit 1 if ANY target locale is not 100% clean
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../src");
const LOCALES_DIR = join(ROOT, "locales");
export const TARGET_LOCALES = ["de", "nl", "ro"];

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const CEDILLA = /[ŞşŢţ]/; // Ş ş Ţ ţ — Romanian uses comma-below ș ț (U+0218–U+021B)
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

export function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

function counts(re, s) {
  const m = {};
  for (const x of String(s).matchAll(re)) m[x[1]] = (m[x[1]] || 0) + 1;
  return m;
}
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

function malformed(s) {
  const str = String(s);
  // Single-brace / unbalanced / spaced interpolation that the runtime would not resolve.
  if (/\{\{[^{}]*$/.test(str) || /^[^{}]*\}\}/.test(str)) return true;
  if (/\{\{\s+\w+|\w+\s+\}\}/.test(str)) return true;
  if (/(^|[^{])\{\w+\}(?!\})/.test(str)) return true;
  return false;
}

/** Values that legitimately stay identical to English in every target language. */
function exemptIdentical(enValue) {
  const v = String(enValue).trim();
  if (!v) return true;
  if (!/[A-Za-z]{2,}/.test(v.replace(PLACEHOLDER, ""))) return true; // numbers, symbols, placeholders only
  if (/^(https?:\/\/|www\.|mailto:)/i.test(v) || /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(v)) return true;
  if (/^[A-Z0-9_\-./: ]{1,12}$/.test(v)) return true; // codes / acronyms: JOD, PDF, ID, OK, SILVER, PRO …
  const BRANDS = /^(OrderzHouse|Orderz House|FAZAAT|Fazaat|Stripe|WhatsApp|Bildazo|Google|Apple|Android|iOS|Visa|Mastercard|PayPal|Cloudinary|Cloudflare|Firebase|LinkedIn|Facebook|Instagram|TikTok|YouTube|X|Telegram|App Store|Google Play)(\s*[·|•:-]\s*\S.*)?$/;
  return BRANDS.test(v);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadAllowlist() {
  const p = join(ROOT, "i18n", "identicalAllowlist.json");
  if (!existsSync(p)) return {};
  return readJson(p);
}

/**
 * @returns {{ locales: Record<string, object>, canonical: { keys: number, namespaces: number, arParity: boolean } }}
 */
export function checkLocales({ locales = TARGET_LOCALES, namespaces = null } = {}) {
  const enFiles = readdirSync(join(LOCALES_DIR, "en")).filter((f) => f.endsWith(".json")).sort();
  const nsList = enFiles.map((f) => f.replace(/\.json$/, "")).filter((ns) => !namespaces || namespaces.includes(ns));
  const allow = loadAllowlist();
  let canonicalKeys = 0;
  let arParity = true;
  const en = {};
  for (const ns of nsList) {
    en[ns] = flatten(readJson(join(LOCALES_DIR, "en", `${ns}.json`)));
    canonicalKeys += Object.keys(en[ns]).length;
    const arPath = join(LOCALES_DIR, "ar", `${ns}.json`);
    const ar = existsSync(arPath) ? flatten(readJson(arPath)) : {};
    if (JSON.stringify(Object.keys(ar).sort()) !== JSON.stringify(Object.keys(en[ns]).sort())) arParity = false;
  }

  const result = {};
  for (const loc of locales) {
    const L = {
      total: canonicalKeys,
      translated: 0,
      issues: { missing: [], extra: [], empty: [], type: [], placeholder: [], markup: [], malformed: [], keyAsValue: [], arabic: [], cedilla: [], identical: [] },
      namespaces: {},
    };
    const allowed = new Set(allow[loc] || []);
    for (const ns of nsList) {
      const path = join(LOCALES_DIR, loc, `${ns}.json`);
      const tgt = existsSync(path) ? flatten(readJson(path)) : {};
      let nsOk = 0;
      for (const [key, enVal] of Object.entries(en[ns])) {
        const id = `${ns}.${key}`;
        if (!(key in tgt)) {
          L.issues.missing.push(id);
          continue;
        }
        const val = tgt[key];
        let ok = true;
        if (Array.isArray(enVal)) {
          if (!Array.isArray(val) || val.length !== enVal.length || val.some((x) => typeof x !== "string" || !x.trim())) {
            L.issues.type.push(id);
            ok = false;
          } else {
            for (let i = 0; i < enVal.length; i += 1) {
              if (!same(counts(PLACEHOLDER, enVal[i]), counts(PLACEHOLDER, val[i]))) ok = false;
              if (ARABIC.test(val[i])) ok = false;
            }
            if (!ok) L.issues.placeholder.push(id);
          }
        } else if (typeof val !== "string") {
          L.issues.type.push(id);
          ok = false;
        } else if (!val.trim() && String(enVal).trim()) {
          L.issues.empty.push(id);
          ok = false;
        } else {
          if (!same(counts(PLACEHOLDER, enVal), counts(PLACEHOLDER, val))) {
            L.issues.placeholder.push(id);
            ok = false;
          }
          if (!same(counts(TAG, enVal), counts(TAG, val))) {
            L.issues.markup.push(id);
            ok = false;
          }
          if (malformed(val) && !malformed(enVal)) {
            L.issues.malformed.push(id);
            ok = false;
          }
          if (val.trim() === id || val.trim() === key) {
            L.issues.keyAsValue.push(id);
            ok = false;
          }
          if (ARABIC.test(val) && !ARABIC.test(enVal)) {
            L.issues.arabic.push(id);
            ok = false;
          }
          if (loc === "ro" && CEDILLA.test(val)) {
            L.issues.cedilla.push(id);
            ok = false;
          }
          if (val.trim() === String(enVal).trim() && !exemptIdentical(enVal) && !allowed.has(id)) {
            L.issues.identical.push(id);
            ok = false;
          }
        }
        if (ok) nsOk += 1;
      }
      for (const key of Object.keys(tgt)) {
        if (key in en[ns]) continue;
        if (loc === "ro" && key.endsWith("_plural_other") && key.replace(/_other$/, "") in en[ns]) continue;
        L.issues.extra.push(`${ns}.${key}`);
      }
      L.translated += nsOk;
      L.namespaces[ns] = { keys: Object.keys(en[ns]).length, ok: nsOk };
    }
    L.coveragePct = canonicalKeys ? Math.floor((10000 * L.translated) / canonicalKeys) / 100 : 0;
    L.clean = L.translated === canonicalKeys && L.issues.extra.length === 0;
    result[loc] = L;
  }
  return { canonical: { keys: canonicalKeys, namespaces: nsList.length, arParity }, locales: result };
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : null;
  };
  const locales = arg("--locale") ? arg("--locale").split(",") : TARGET_LOCALES;
  const namespaces = arg("--ns") ? arg("--ns").split(",") : null;
  const report = checkLocales({ locales, namespaces });
  const details = args.includes("--details");
  console.log(`canonical keys=${report.canonical.keys} namespaces=${report.canonical.namespaces} ar/en parity=${report.canonical.arParity}`);
  for (const [loc, L] of Object.entries(report.locales)) {
    const counts = Object.fromEntries(Object.entries(L.issues).map(([k, v]) => [k, v.length]));
    console.log(`${loc}: coverage ${L.coveragePct}% (${L.translated}/${L.total}) clean=${L.clean} ${JSON.stringify(counts)}`);
    if (details) {
      for (const [k, v] of Object.entries(L.issues)) if (v.length) console.log(`  ${k}: ${v.slice(0, 60).join(", ")}${v.length > 60 ? " …" : ""}`);
    }
  }
  const jsonOut = arg("--json");
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 1)}\n`);
  let exit = 0;
  if (!report.canonical.arParity) exit = 1;
  if (args.includes("--strict") && Object.values(report.locales).some((L) => !L.clean)) exit = 1;
  if (args.includes("--released")) {
    const { RELEASED_LOCALES } = await import("../../src/i18n/localeRelease.js");
    for (const loc of RELEASED_LOCALES) if (report.locales[loc] && !report.locales[loc].clean) exit = 1;
  }
  process.exitCode = exit;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
