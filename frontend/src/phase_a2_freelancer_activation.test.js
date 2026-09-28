import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { freelancerTrialApplyErrorMessage } from "./constants/freelancerActivationTrial.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A2 freelancer activation trial UI", () => {
  it("status block shows active counts and Silver CTA placeholder", () => {
    const src = read("components/freelancer/FreelancerActivationTrialStatusBlock.jsx");
    const ar = JSON.parse(read("locales/ar/activation.json"));
    assert.match(src, /activation\.trial\.bidsUsed/);
    assert.match(ar.trial.bidsUsed, /عروض التجربة/);
    assert.match(src, /activation\.trial\.dailyUsage/);
    assert.match(ar.trial.dailyUsage, /اليوم/);
    assert.match(src, /activation\.trial\.acceptedWork/);
    assert.match(ar.trial.acceptedWork, /المقبول/);
    assert.match(src, /silver-cta-placeholder/);
    assert.match(src, /activation\.trial\.expiredCta/);
    assert.equal(
      ar.trial.expiredCta,
      "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.",
    );
    assert.doesNotMatch(src, /earned balance/i);
    assert.doesNotMatch(src, /password/i);
  });

  it("blocked apply errors render in Arabic", () => {
    assert.equal(
      freelancerTrialApplyErrorMessage(
        { response: { data: { code: "FREELANCER_TRIAL_REQUIRED" } } },
        { isEn: false },
      ),
      "يلزم تفعيل تجربة العمل قبل التقديم على مقالات Mini Article.",
    );
    assert.equal(
      freelancerTrialApplyErrorMessage(
        { response: { data: { code: "FREELANCER_TRIAL_EXPIRED" } } },
        { isEn: false },
      ),
      "انتهت تجربة العمل. للمتابعة، انتقل إلى Silver.",
    );
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.match(detail, /freelancerTrialApplyErrorMessage/);
  });

  it("Bildazo linked widget still renders on articles page", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    assert.match(list, /FreelancerBildazoLinkedAccountWidget/);
    assert.match(list, /FreelancerBildazoAuthorGateCard/);
    assert.match(list, /FreelancerActivationTrialStatusBlock/);
  });
});
