import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A9.3 auto-assignment UI", () => {
  it("admin applications panel shows auto-assign status, badge, run button", () => {
    const panel = read("admin/marketplaceArticles/MarketplaceArticleApplicationsPanel.jsx");
    assert.match(panel, /activation-auto-assign-panel/);
    assert.match(panel, /activation-auto-assign-status/);
    assert.match(panel, /تم الإسناد تلقائيًا/);
    assert.match(panel, /activation-auto-assign-run-btn/);
    assert.match(panel, /تشغيل التوزيع التلقائي الآن/);
    assert.match(panel, /activation-auto-assign-fairness-summary/);
    assert.match(panel, /runAdminArticleAutoAssignmentRequest/);
    assert.match(panel, /activation-auto-assign-skip-reason/);
  });

  it("freelancer article pages do not expose weights/scores", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.doesNotMatch(list, /totalWeight|candidateRank|weighted_fair|reasonTags/);
    assert.doesNotMatch(detail, /totalWeight|candidateRank|weighted_fair|reasonTags/);
  });

  it("api exposes auto-assignment endpoints", () => {
    const api = read("services/api.js");
    assert.match(api, /auto-assignment\/run/);
    assert.match(api, /getAdminArticleAutoAssignmentRequest/);
  });
});
