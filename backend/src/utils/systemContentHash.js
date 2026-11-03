/**
 * Hash of a system-content SOURCE string (English, else Arabic) — the key of the German / Dutch / Romanian
 * translation memory (`system_content_translations.source_hash`).
 * MUST stay byte-identical to frontend/src/i18n/systemContent.js (shared test vectors in both test suites).
 */

function normalizeSystemContentSource(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

/** cyrb53 (53-bit) → 14 hex chars. */
function systemContentHash(text) {
  const str = normalizeSystemContentSource(text);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

module.exports = { normalizeSystemContentSource, systemContentHash };
