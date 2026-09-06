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
    assert.match(panel, /إنزال المقالات/);
    assert.match(panel, /activation-release-tab/);
    assert.match(panel, /معاينة الإنزال/);
    assert.match(panel, /تشغيل الإنزال الآن/);
    assert.match(panel, /activation-release-preview-btn/);
    assert.match(panel, /activation-release-run-btn/);
    assert.match(panel, /previewSuperAdminActivationArticleReleaseRequest/);
    assert.match(panel, /runSuperAdminActivationArticleReleaseRequest/);
    assert.match(panel, /عدد المقالات المتوقع إنزالها/);
    assert.match(panel, /الميزانية اليومية/);
    assert.match(panel, /الرصيد المتاح في الصندوق/);
    assert.match(panel, /المخزون الجاهز/);
    assert.match(panel, /إعادة التدوير مفعّلة/);
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
