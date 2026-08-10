/**
 * Frontend wiring smoke for Marketplace Membership Phase 3 (read-only card).
 * Run from frontend/: node --test src/components/freelancer/freelancerMarketplaceMembershipCard.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("FreelancerMarketplaceMembershipCard wiring", () => {
  it("is mounted on FreelancerPlansPage and uses read API only", () => {
    const page = fs.readFileSync(
      path.join(__dirname, "../../pages/dashboard/FreelancerPlansPage.jsx"),
      "utf8",
    );
    const card = fs.readFileSync(
      path.join(__dirname, "FreelancerMarketplaceMembershipCard.jsx"),
      "utf8",
    );
    const api = fs.readFileSync(path.join(__dirname, "../../services/api.js"), "utf8");

    assert.match(page, /FreelancerMarketplaceMembershipCard/);
    assert.match(card, /getFreelancerMarketplaceMembershipRequest/);
    assert.doesNotMatch(card, /consumePriority|auction entry|bid now/i);
    assert.match(api, /getFreelancerMarketplaceMembershipRequest/);
    assert.match(api, /\/freelancer\/marketplace-membership/);
  });
});
