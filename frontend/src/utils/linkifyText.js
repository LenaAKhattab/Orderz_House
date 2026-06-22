const URL_REGEX = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)}\]'"]+$/;

function isSafeHttpUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function trimTrailingPunctuation(url) {
  let value = String(url || "");
  let trailing = "";

  while (value.length > 0 && TRAILING_PUNCTUATION.test(value)) {
    trailing = value.slice(-1) + trailing;
    value = value.slice(0, -1);
  }

  return { url: value, trailing };
}

/**
 * Split plain text into alternating text/link segments for safe rendering.
 * @param {unknown} input
 * @returns {{ type: "text" | "link", value: string, href?: string }[]}
 */
export function splitTextWithLinks(input) {
  const text = String(input ?? "");
  if (!text) return [];

  const segments = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const raw = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, start) });
    }

    const { url, trailing } = trimTrailingPunctuation(raw);
    if (url && isSafeHttpUrl(url)) {
      segments.push({ type: "link", value: url, href: url });
      if (trailing) segments.push({ type: "text", value: trailing });
    } else {
      segments.push({ type: "text", value: raw });
    }

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", value: text }];
}
