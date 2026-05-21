const helmet = require("helmet");

/**
 * Baseline security headers for JSON API (no HTML shell).
 * CSP disabled — API does not serve pages; strict CSP would not help and could confuse proxies.
 * CORP cross-origin so category images and Cloudinary URLs work from the SPA.
 */
function applySecurityHeaders(app) {
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );
}

module.exports = { applySecurityHeaders };
