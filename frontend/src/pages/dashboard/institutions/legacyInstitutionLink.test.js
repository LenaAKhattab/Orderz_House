/**
 * Source guards: Legacy admin institutionId wiring (campaign + manual create).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "../../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("legacy institution link UI", () => {
  it("campaign panel sends institutionId on create and lists active institutions", () => {
    const src = read("src/pages/dashboard/legacyFreelancerAdmin/LegacyCampaignsPanel.jsx");
    assert.match(src, /institutionId:\s*""/);
    assert.match(src, /adminListInstitutionsRequest\(\{\s*status:\s*["']active["'],\s*limit:\s*100\s*\}/);
    assert.match(src, /institutionId:\s*form\.institutionId/);
    assert.match(src, /updateLegacyFreelancerInviteRequest/);
    assert.match(src, /resolveInstitutionLabel/);
    assert.match(src, /بدون مؤسسة/);
    assert.match(src, /oh-legacy-campaign-card/);
  });

  it("manual legacy create form includes optional institutionId", () => {
    const src = read("src/pages/dashboard/legacyFreelancerAdmin/LegacyFreelancersPanel.jsx");
    assert.match(src, /institutionId:\s*""/);
    assert.match(src, /ربط بمؤسسة/);
    assert.match(src, /institutionId:\s*createForm\.institutionId/);
    assert.match(src, /adminListInstitutionsRequest/);
  });
});
