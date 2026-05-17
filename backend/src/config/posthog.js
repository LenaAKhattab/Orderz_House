const { PostHog } = require("posthog-node");
const { normalizeHost } = require("../utils/posthogEnvValidation");

let _client = null;

function getPostHogClient() {
  if (_client) return _client;
  const apiKey = String(process.env.POSTHOG_API_KEY || "").trim();
  const { host } = normalizeHost(process.env.POSTHOG_HOST);
  if (!apiKey || !host || !apiKey.startsWith("phc_")) return null;
  _client = new PostHog(apiKey, {
    host,
    enableExceptionAutocapture: true,
  });
  return _client;
}

/**
 * Capture a PostHog event. Silently no-ops if PostHog is not configured.
 * @param {string} distinctId
 * @param {string} event
 * @param {Record<string, unknown>} [properties]
 */
function capture(distinctId, event, properties = {}) {
  const client = getPostHogClient();
  if (!client) return;
  client.capture({ distinctId: String(distinctId), event, properties });
}

/**
 * Identify a user and set their properties. Silently no-ops if PostHog is not configured.
 * @param {string} distinctId
 * @param {Record<string, unknown>} [properties]
 */
function identify(distinctId, properties = {}) {
  const client = getPostHogClient();
  if (!client) return;
  client.identify({ distinctId: String(distinctId), properties });
}

/**
 * Capture an exception. Silently no-ops if PostHog is not configured.
 * @param {Error} err
 * @param {string} [distinctId]
 */
function captureException(err, distinctId) {
  const client = getPostHogClient();
  if (!client) return;
  client.captureException(err, distinctId ? String(distinctId) : undefined);
}

module.exports = { capture, identify, captureException, getPostHogClient };
