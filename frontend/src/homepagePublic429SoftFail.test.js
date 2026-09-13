/**
 * Homepage soft-fail for optional public 429s (static contracts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("homepage public 429 soft-fail contracts", () => {
  it("home-stats respects cache TTL and backs off on 429", () => {
    const src = read("hooks/usePublicHomeStats.js");
    assert.match(src, /shouldSkipPublicPoll/);
    assert.match(src, /computePublicPollResumeAt/);
    assert.match(src, /isRateLimitedError/);
    assert.doesNotMatch(src, /bypassCache:\s*!initial/);
  });

  it("ads soft-fail 429 without console.error storm", () => {
    const src = read("hooks/usePublicAds.js");
    assert.match(src, /isRateLimitedError/);
    assert.match(src, /fetchPublicCached/);
    assert.doesNotMatch(src, /console\.error\(\s*["']\[usePublicAds\]/);
  });

  it("pool preview soft-fail 429 and uses cache", () => {
    const src = read("hooks/usePublicPoolOrdersPreview.js");
    assert.match(src, /isRateLimitedError/);
    assert.match(src, /fetchPublicCached/);
    assert.match(src, /shouldSkipPublicPoll/);
  });
});
