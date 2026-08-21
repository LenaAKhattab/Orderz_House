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
    assert.match(panel, /متابعة المقالات/);
    assert.match(panel, /activation-monitor-tab/);
    assert.match(panel, /activation-monitor-summary/);
    assert.match(panel, /المقالات المنزلة/);
    assert.match(panel, /بانتظار المتقدمين/);
    assert.match(panel, /جاهزة للتوزيع/);
    assert.match(panel, /تم إسنادها تلقائيًا/);
    assert.match(panel, /منشورة على Bildazo/);
    assert.match(panel, /activation-monitor-filters/);
    assert.match(panel, /activation-monitor-list/);
    assert.match(panel, /عدد المتقدمين/);
    assert.match(panel, /العدد المطلوب/);
    assert.match(panel, /تشغيل التوزيع الآن/);
    assert.match(panel, /فتح التفاصيل/);
    assert.match(panel, /عرض المتقدمين/);
    assert.match(panel, /runSuperAdminActivationLiveArticleAutoAssignmentRequest/);
    assert.match(panel, /activation-monitor-privacy-note/);
  });

  it("existing A9.1–A9.3 tabs remain", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    assert.match(panel, /صندوق المقالات/);
    assert.match(panel, /توزيع الخطط/);
    assert.match(panel, /مخزن المقالات/);
    assert.match(panel, /إنزال المقالات/);
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
