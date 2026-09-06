/**
 * Server-side rollout flag for the freelancer Mini Article ↔ Bildazo writer gate.
 * Default OFF so existing article apply behavior is unchanged until explicitly enabled.
 * Separate from BILDAZO_AUTHOR_SYNC_ENABLED (whether OrderzHouse calls Bildazo S2S).
 * Does not contain secrets.
 */

function truthy(raw) {
  const s = String(raw || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function isBildazoAuthorGateEnabled() {
  return truthy(process.env.BILDAZO_AUTHOR_GATE_ENABLED);
}

module.exports = {
  isBildazoAuthorGateEnabled,
};
