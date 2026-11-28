/**
 * English rendering of server-authored Arabic text (notification titles/bodies) for clients that chose
 * English — currently FCM pushes to Android installs registered with locale 'en'.
 *
 * The table is generated from the same translation memory as the Android app
 * (mobile/orderzhouse_app/tool/i18n/generate.mjs → src/i18n/serverStringsEn.json). Unknown text returns
 * null so callers fall back to generic English copy (never mixed-language output).
 */

const table = require("../i18n/serverStringsEn.json");

const AR = /[؀-ۿ]/;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const templates = (table.templates || []).map(([source, english]) => {
  const parts = source.split(/\{\d+\}/);
  return { re: new RegExp(`^${parts.map(escapeRe).join("(.+?)")}$`, "s"), english };
});

/** @returns {string | null} English text, or null when no translation exists. */
function toEnglish(text) {
  const t = String(text ?? "").trim();
  if (!t) return null;
  if (!AR.test(t)) return t;
  const exact = table.exact?.[t] ?? table.exact?.[t.replace(/\s+/g, " ")];
  if (exact) return exact;
  for (const { re, english } of templates) {
    const m = re.exec(t);
    if (!m) continue;
    let out = english;
    for (let i = 1; i < m.length; i += 1) {
      const v = m[i] ?? "";
      out = out.split(`{${i - 1}}`).join(AR.test(v) ? table.exact?.[v.trim()] ?? v : v);
    }
    if (!AR.test(out)) return out;
  }
  return null;
}

module.exports = { toEnglish };
