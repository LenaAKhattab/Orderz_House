/**
 * OZ04 frontend contracts — refund ledger Arabic + recycle visibility.
 * Run: node --test src/oz04MinimumNotMetFundRefund.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
function read(rel) {
  return fs.readFileSync(path.join(srcRoot, rel), "utf8");
}

describe("OZ04 frontend — fund refund copy", () => {
  it("shows Arabic refund reason in hub funding ledger", () => {
    const hub = read("pages/dashboard/SuperAdminArticlesHubPage.jsx");
    assert.match(hub, /إرجاع تمويل بسبب عدم اكتمال عدد المتقدمين/);
    assert.match(hub, /articles-fund-ledger/);
    assert.match(hub, /fund-entry-reason-ar/);
  });

  it("ops panel labels daily_allocation_released as fund return", () => {
    const panel = read("components/admin/FreelancerActivationArticleOpsPanel.jsx");
    assert.match(panel, /إرجاع تمويل مقال/);
    assert.match(panel, /minimum_not_met_refund/);
    assert.match(panel, /إرجاع تمويل بسبب عدم اكتمال عدد المتقدمين/);
  });
});
