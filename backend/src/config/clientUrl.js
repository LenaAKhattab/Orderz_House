/**
 * First origin only — used for Stripe success/cancel redirect URLs.
 * CORS may list multiple origins in CLIENT_URL or CORS_ORIGINS; checkout must not use a comma-joined value.
 */
function getPrimaryClientUrl() {
  const raw = String(process.env.CLIENT_URL || "").trim();
  if (!raw) return "";
  const first = raw.split(",")[0].trim();
  return first.replace(/\/$/, "");
}

/**
 * All allowed browser origins (for CORS). Merges CLIENT_URL and optional CORS_ORIGINS.
 */
function parseAllowedClientOrigins() {
  const out = [];
  const append = (value) => {
    if (!value) return;
    String(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => out.push(o));
  };
  append(process.env.CLIENT_URL || "http://localhost:5173");
  append(process.env.CORS_ORIGINS);
  return [...new Set(out)];
}

module.exports = { getPrimaryClientUrl, parseAllowedClientOrigins };
