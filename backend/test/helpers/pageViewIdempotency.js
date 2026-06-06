/**
 * Pageview idempotency key generation (mirrors frontend pageViewNavigation.js).
 */

const PAGE_LOAD_ID = `test-load-${Date.now()}`;

let lastLocationSignature = "";
let navigationCounter = 0;

function buildPageViewIdempotencyKey(fullPath) {
  const sig = String(fullPath || "/");
  if (sig !== lastLocationSignature) {
    lastLocationSignature = sig;
    navigationCounter += 1;
  }
  return `${PAGE_LOAD_ID}:${navigationCounter}`;
}

function resetNavigationState() {
  lastLocationSignature = "";
  navigationCounter = 0;
}

module.exports = {
  buildPageViewIdempotencyKey,
  resetNavigationState,
};
