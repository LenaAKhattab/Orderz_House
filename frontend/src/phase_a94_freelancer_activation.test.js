import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A9.4 live monitoring UI", () => {
  it("monitor tab renders summary, filters, rows, and actions", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    const ar = JSON.parse(read("locales/ar/articles.json"));
    assert.match(panel, /activationOps\.tabs\.monitor/);
    assert.match(ar.activationOps.tabs.monitor, /متابعة المقالات/);
    assert.match(panel, /activation-monitor-tab/);
    assert.match(panel, /activation-monitor-summary/);
    assert.match(panel, /activationOps\.monitor\.summary\.released/);
    assert.match(ar.activationOps.monitor.summary.released, /المقالات المنزلة/);
    assert.match(panel, /activationOps\.monitor\.summary\.waiting/);
    assert.match(ar.activationOps.monitor.summary.waiting, /بانتظار المتقدمين/);
    assert.match(panel, /activationOps\.monitor\.summary\.ready/);
    assert.match(ar.activationOps.monitor.summary.ready, /جاهزة للتوزيع/);
    assert.match(panel, /activationOps\.monitor\.summary\.autoAssigned/);
    assert.match(ar.activationOps.monitor.summary.autoAssigned, /تم إسنادها تلقائيًا/);
    assert.match(panel, /activationOps\.monitor\.summary\.publishedBildazo/);
    assert.match(ar.activationOps.monitor.summary.publishedBildazo, /منشورة على Bildazo/);
    assert.match(panel, /activation-monitor-filters/);
    assert.match(panel, /activation-monitor-list/);
    assert.match(panel, /activationOps\.monitor\.applicants/);
    assert.match(panel, /activationOps\.monitor\.runAssign/);
    assert.match(ar.activationOps.monitor.runAssign, /تشغيل التوزيع الآن/);
    assert.match(panel, /activationOps\.monitor\.openDetails/);
    assert.match(ar.activationOps.monitor.openDetails, /فتح التفاصيل/);
    assert.match(panel, /activationOps\.monitor\.viewApplicants/);
    assert.match(ar.activationOps.monitor.viewApplicants, /عرض المتقدمين/);
    assert.match(panel, /runSuperAdminActivationLiveArticleAutoAssignmentRequest/);
    assert.match(panel, /activation-monitor-privacy-note/);
    assert.match(panel, /activationOps\.monitor\.privacy/);
  });

  it("existing A9.1–A9.3 tabs remain", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    const ar = JSON.parse(read("locales/ar/articles.json"));
    assert.match(panel, /activationOps\.tabs\.fund/);
    assert.match(ar.activationOps.tabs.fund, /صندوق المقالات/);
    assert.match(panel, /activationOps\.tabs\.alloc/);
    assert.match(panel, /activationOps\.tabs\.inventory/);
    assert.match(panel, /activationOps\.tabs\.release/);
  });

  it("freelancer routes do not expose monitoring", () => {
    const list = read("pages/dashboard/FreelancerMarketplaceArticlesPage.jsx");
    const detail = read("pages/dashboard/FreelancerMarketplaceArticleDetailPage.jsx");
    assert.doesNotMatch(list, /activation-monitor|live-articles|متابعة المقالات/);
    assert.doesNotMatch(detail, /activation-monitor|live-articles|متابعة المقالات/);
  });

  it("api helpers expose live-articles endpoints", () => {
    const api = read("services/api.js");
    assert.match(api, /freelancer-activation\/live-articles/);
    assert.match(api, /run-auto-assignment/);
    assert.match(api, /release-another/);
  });
});
