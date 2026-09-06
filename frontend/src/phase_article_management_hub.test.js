import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(...parts) {
  return fs.readFileSync(path.join(srcRoot, ...parts), "utf8");
}

/** Legacy hub file now redirects — keep smoke coverage for redirects. */
describe("Super Admin article management hub UX (legacy redirect)", () => {
  it("legacy article-management page redirects to articles", () => {
    const hub = read("pages/dashboard/SuperAdminArticleManagementPage.jsx");
    assert.match(hub, /Navigate/);
    assert.match(hub, /\/dashboard\/super-admin\/articles/);
  });
});
