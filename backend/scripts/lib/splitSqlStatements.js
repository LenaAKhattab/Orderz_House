/**
 * Split SQL on semicolons while respecting:
 * - standard 'string' literals (with '' escapes)
 * - double-quoted identifiers (with "" escapes)
 * - PostgreSQL dollar-quoted strings: $$...$$ or $tag$...$tag$
 *
 * Without dollar-quote awareness, DO $$ ... $$ blocks break mid-statement
 * (seen when applying 132_user_feedback_topics in production).
 *
 * @param {string} sql
 * @returns {string[]}
 */
function splitSqlStatements(sql) {
  const out = [];
  let buf = "";
  let inQuote = false;
  let inDoubleQuote = false;
  let dollarTag = null; // null | "" for $$ | "tag" for $tag$

  const source = String(sql ?? "");
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];

    if (dollarTag !== null) {
      if (c === "$") {
        const closer = `$${dollarTag}$`;
        if (source.startsWith(closer, i)) {
          buf += closer;
          i += closer.length - 1;
          dollarTag = null;
          continue;
        }
      }
      buf += c;
      continue;
    }

    if (!inQuote && !inDoubleQuote && c === "$") {
      const rest = source.slice(i);
      const m = rest.match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (m) {
        dollarTag = m[1] || "";
        buf += m[0];
        i += m[0].length - 1;
        continue;
      }
    }

    if (!inDoubleQuote && c === "'") {
      if (inQuote && source[i + 1] === "'") {
        buf += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      buf += c;
      continue;
    }

    if (!inQuote && c === '"') {
      if (inDoubleQuote && source[i + 1] === '"') {
        buf += '""';
        i += 1;
        continue;
      }
      inDoubleQuote = !inDoubleQuote;
      buf += c;
      continue;
    }

    if (c === ";" && !inQuote && !inDoubleQuote) {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
      continue;
    }
    buf += c;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/**
 * Strip full-line SQL comments (`-- ...`) before splitting.
 * @param {string} sql
 * @returns {string}
 */
function stripSqlLineComments(sql) {
  return String(sql ?? "")
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
}

module.exports = {
  splitSqlStatements,
  stripSqlLineComments,
};
