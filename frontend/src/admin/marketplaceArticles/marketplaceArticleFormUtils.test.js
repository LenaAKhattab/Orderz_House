/**
 * Phase A2 frontend form utils.
 * Run: node --test src/admin/marketplaceArticles/marketplaceArticleFormUtils.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveArticleValueJodFromLevel,
  normalizeMarketplaceArticlePayload,
  validateMarketplaceArticleForm,
  getInitialMarketplaceArticleFormState,
} from "./marketplaceArticleFormUtils.js";

describe("marketplaceArticleFormUtils", () => {
  it("derives display values 1..5 JOD", () => {
    assert.equal(deriveArticleValueJodFromLevel(1), "1.000");
    assert.equal(deriveArticleValueJodFromLevel(5), "5.000");
  });

  it("validates word/references/level", () => {
    const ok = getInitialMarketplaceArticleFormState({
      title: "T",
      articleLevel: 2,
      requiredWordCount: 100,
      requiredReferencesCount: 0,
    });
    assert.deepEqual(validateMarketplaceArticleForm(ok), {});
    assert.ok(validateMarketplaceArticleForm({ ...ok, articleLevel: 0 }).articleLevel);
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredWordCount: 0 }).requiredWordCount);
    assert.ok(validateMarketplaceArticleForm({ ...ok, requiredReferencesCount: -1 }).requiredReferencesCount);
  });

  it("normalizes payload without forging articleValueJod", () => {
    const payload = normalizeMarketplaceArticlePayload(
      getInitialMarketplaceArticleFormState({
        title: "Hello",
        articleLevel: 3,
        requiredWordCount: 900,
        requiredReferencesCount: 2,
        status: "published",
      }),
    );
    assert.equal(payload.articleLevel, 3);
    assert.equal(payload.requiredWordCount, 900);
    assert.equal(payload.requiredReferencesCount, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "articleValueJod"), false);
  });
});
