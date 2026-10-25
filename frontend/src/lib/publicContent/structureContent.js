/**
 * Turns admin-authored plain text (public site pages, How-it-works blocks) into display nodes.
 * Presentation only — wording is never changed. Handles the formats editors actually use:
 *   "## Heading"            → heading
 *   "•\tItem" / "- Item"    → bullet list item
 *   "1.\tItem"              → ordered list item (tab after the number)
 *   "1. Section title"      → heading (short numbered line without tab)
 *   short line, no ending punctuation, followed by more text → heading
 *   "تاريخ آخر تحديث…" / "Last updated…" → meta line
 *   any other line          → paragraph (single newlines are real breaks in the source)
 */

const BULLET_RE = /^[•▪●◦·\-*]\s*\t?\s*/;
const ORDERED_ITEM_RE = /^(\d{1,3})[.)]\t\s*/;
const NUMBERED_HEADING_RE = /^(\d{1,3})[.)]\s+\S/;
const META_RE = /^(تاريخ آخر تحديث|آخر تحديث|last updated|updated on)/i;
const END_PUNCT_RE = /[.:؛;،,!?؟»"')\]]$/;
const HEADING_MAX = 70;

function isHeadingLine(line, hasFollowingText) {
  if (line.length > HEADING_MAX || END_PUNCT_RE.test(line)) return false;
  if (NUMBERED_HEADING_RE.test(line)) return true;
  return hasFollowingText && line.split(/\s+/).length <= 9;
}

/**
 * @param {string} text
 * @returns {Array<{type:"heading"|"paragraph"|"meta", text:string} | {type:"ul"|"ol", items:string[], start?:number}>}
 */
export function structureContent(text) {
  const lines = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""));
  const nodes = [];
  let list = null;
  const flushList = () => {
    if (list) nodes.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push({ type: "heading", text: line.slice(3).trim() });
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (bullet && line.length > bullet[0].length) {
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(line.slice(bullet[0].length).trim());
      continue;
    }
    const ordered = ORDERED_ITEM_RE.exec(raw.trimStart());
    if (ordered) {
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [], start: Number(ordered[1]) };
      }
      list.items.push(raw.trimStart().slice(ordered[0].length).trim());
      continue;
    }
    flushList();
    if (META_RE.test(line)) {
      nodes.push({ type: "meta", text: line });
      continue;
    }
    const next = lines.slice(i + 1).find((l) => l.trim());
    if (isHeadingLine(line, Boolean(next))) {
      nodes.push({ type: "heading", text: line });
      continue;
    }
    nodes.push({ type: "paragraph", text: line });
  }
  flushList();
  return nodes;
}

/** True when the text has structure worth rendering as rich content (vs a one-line lede). */
export function hasStructuredContent(text) {
  const s = String(text || "");
  return /\n/.test(s.trim()) || s.length > 280;
}
