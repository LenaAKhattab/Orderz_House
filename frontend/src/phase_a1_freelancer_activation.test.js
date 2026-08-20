import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A1 freelancer activation trial UI", () => {
  it("status block renders active state, next action, and no earned balance", () => {
    const src = read("components/freelancer/FreelancerActivationTrialStatusBlock.jsx");
    assert.match(src, /Trial active/);
    assert.match(src, /التجربة نشطة/);
    assert.match(src, /data-next-action/);
    assert.match(src, /day\(s\) remaining/);
    assert.doesNotMatch(src, /earned balance/i);
    assert.doesNotMatch(src, /رصيد مكتسب/);
    assert.doesNotMatch(src, /wallet/i);
  });

  it("articles page shows the block only when engine is enabled and does not block apply", () => {
    const page = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(page, /FreelancerActivationTrialStatusBlock/);
    assert.match(page, /trialState\?\.engineEnabled/);
    assert.match(page, /getFreelancerActivationTrialRequest/);
    assert.doesNotMatch(page, /canActivate.*return null/);
  });

  it("API helpers exist for freelancer trial and super-admin overview", () => {
    const api = read("services/api.js");
    assert.match(api, /\/freelancer\/activation-trial/);
    assert.match(api, /\/super-admin\/freelancer-activation\/trials/);
  });
});
