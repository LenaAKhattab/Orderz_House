import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

describe("Phase A9.2 release engine UI", () => {
  it("release tab renders preview/run and capacity stats", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    const ar = JSON.parse(read("locales/ar/articles.json"));
    assert.match(panel, /activationOps\.tabs\.release/);
    assert.match(ar.activationOps.tabs.release, /إنزال المقالات/);
    assert.match(panel, /activation-release-tab/);
    assert.match(panel, /activationOps\.release\.preview/);
    assert.match(ar.activationOps.release.preview, /معاينة الإنزال/);
    assert.match(panel, /activationOps\.release\.runNow/);
    assert.match(ar.activationOps.release.runNow, /تشغيل الإنزال الآن/);
    assert.match(panel, /activation-release-preview-btn/);
    assert.match(panel, /activation-release-run-btn/);
    assert.match(panel, /previewSuperAdminActivationArticleReleaseRequest/);
    assert.match(panel, /runSuperAdminActivationArticleReleaseRequest/);
    assert.match(panel, /activationOps\.release\.plannedRelease/);
    assert.match(ar.activationOps.release.plannedRelease, /عدد المقالات المتوقع إنزالها/);
    assert.match(panel, /activationOps\.release\.dailyBudget/);
    assert.match(ar.activationOps.release.dailyBudget, /الميزانية اليومية/);
    assert.match(panel, /activationOps\.release\.fundAvailable/);
    assert.match(ar.activationOps.release.fundAvailable, /الرصيد المتاح في الصندوق/);
    assert.match(panel, /activationOps\.release\.readyStock/);
    assert.match(ar.activationOps.release.readyStock, /المخزون الجاهز/);
    assert.match(panel, /activationOps\.release\.recycleEnabled/);
    assert.match(ar.activationOps.release.recycleEnabled, /إعادة التدوير مفعّلة/);
    assert.match(panel, /activation-release-runs/);
    assert.match(panel, /activation-release-no-auto-assign/);
    assert.doesNotMatch(panel, /تشغيل تعيين الفائز|autoAssignWinner|weighted.?winner/i);
  });

  it("api helpers expose preview/run/runs endpoints", () => {
    const api = read("services/api.js");
    assert.match(api, /article-release\/preview/);
    assert.match(api, /article-release\/run/);
    assert.match(api, /article-release\/runs/);
  });
});
