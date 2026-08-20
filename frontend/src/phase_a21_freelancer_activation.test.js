import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freelancerTrialActivateErrorMessage } from "./constants/freelancerActivationTrial.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A2.1 freelancer trial Bid grant UI", () => {
  it("status block shows granted Bids, remaining allowance, and apply-ready", () => {
    const src = read("components/freelancer/FreelancerActivationTrialStatusBlock.jsx");
    assert.match(src, /trial-bids-granted/);
    assert.match(src, /Trial bids granted/);
    assert.match(src, /عروض التجربة الممنوحة/);
    assert.match(src, /trial-apply-allowance/);
    assert.match(src, /trial-apply-ready/);
    assert.match(src, /trial-activate-error/);
    assert.doesNotMatch(src, /subscription purchase/i);
    assert.doesNotMatch(src, /19 JOD/);
    assert.doesNotMatch(src, /earned balance/i);
  });

  it("grant failure copy is safe and not paid-subscription language", () => {
    assert.equal(
      freelancerTrialActivateErrorMessage(
        { response: { data: { code: "FREELANCER_TRIAL_BID_GRANT_FAILED" } } },
        { isEn: false },
      ),
      "تعذر منح عروض التجربة. لم تكتمل التجربة، حاول مرة أخرى.",
    );
    const page = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(page, /freelancerTrialActivateErrorMessage/);
    assert.match(page, /trialActivateError/);
  });
});
