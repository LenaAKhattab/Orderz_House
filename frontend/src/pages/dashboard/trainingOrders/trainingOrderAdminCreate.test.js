import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));

describe("training order admin create wiring", () => {
  it("pool page uses fake-orders create API and wizard mode fake-order", () => {
    const pageSrc = readFileSync(join(here, "TrainingOrderTemplatesPage.jsx"), "utf8");
    const apiSrc = readFileSync(join(here, "../../../services/api.js"), "utf8");
    assert.match(pageSrc, /adminCreateTrainingFakeOrderRequest/);
    assert.match(pageSrc, /mode="fake-order"/);
    assert.doesNotMatch(pageSrc, /adminCreateTrainingTemplateRequest/);
    assert.match(apiSrc, /post\("\/admin\/training-orders\/fake-orders"/);
  });

  it("template create helper is blocked in api.js", () => {
    const apiSrc = readFileSync(join(here, "../../../services/api.js"), "utf8");
    assert.match(apiSrc, /adminCreateTrainingTemplateRequest[\s\S]*throw new Error/);
    assert.doesNotMatch(apiSrc, /api\.post\("\/admin\/training-orders\/templates", payload/);
  });
});
