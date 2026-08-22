import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

describe("Freelancer courses paid gate UI", () => {
  it("renders locked premium card copy and upgrade CTA", () => {
    const page = fs.readFileSync(path.join(srcRoot, "pages/dashboard/FreelancerCoursesPage.jsx"), "utf8");
    assert.match(page, /fc-course-card--locked/);
    assert.match(page, /isLocked/);
    assert.match(page, /lockedBadge/);
    assert.match(page, /lockedMessage/);
    assert.match(page, /lockedCta/);
    assert.match(page, /PLAN_UPGRADE_DEFAULT_ROUTE/);
  });

  it("excludes locked courses from accessible summary counts", () => {
    const page = fs.readFileSync(path.join(srcRoot, "pages/dashboard/FreelancerCoursesPage.jsx"), "utf8");
    assert.match(page, /accessibleCourses/);
    assert.match(page, /filter\(\(c\) => !c\?\.isLocked\)/);
  });
});
