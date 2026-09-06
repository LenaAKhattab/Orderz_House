/**
 * A2.3 — Mobile M5 alias for freelancer article applications list.
 * Static route registration only; no DB / Production access.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Freelancer my-articles alias (A2.3)", () => {
  it("registers GET /my-articles to listMine alongside /article-applications", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "..", "src", "routes", "freelancerMarketplaceArticleApplicationsRoutes.js"),
      "utf8",
    );
    assert.match(routes, /router\.get\(\s*["']\/article-applications["']/);
    assert.match(routes, /router\.get\(\s*["']\/my-articles["']/);
    const myArticlesBlock = routes.slice(routes.indexOf('"/my-articles"'));
    assert.match(myArticlesBlock, /controller\.listMine/);
  });
});
