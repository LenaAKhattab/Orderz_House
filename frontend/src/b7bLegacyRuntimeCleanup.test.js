/**
 * Phase B7B frontend cleanup gate.
 * Run: node --test src/b7bLegacyRuntimeCleanup.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

describe("B7B dead WT frontend removed", () => {
  it("Work Token wallet card is deleted", () => {
    assert.equal(exists("components/freelancer/FreelancerWorkTokenWalletCard.jsx"), false);
    assert.equal(exists("components/freelancer/freelancerWorkTokenWalletCard.test.js"), false);
  });

  it("api.js has no WT wallet or token-quote helpers", () => {
    const api = read("services/api.js");
    assert.doesNotMatch(api, /getFreelancerWorkTokenWalletRequest/);
    assert.doesNotMatch(api, /listAdminWorkTokenWalletsRequest/);
    assert.doesNotMatch(api, /getPoolOrderNormalApplicationTokenQuoteRequest/);
    assert.match(api, /getFreelancerBidCreditsRequest/);
    assert.match(api, /getPoolOrderNormalApplicationBidQuoteRequest/);
  });

  it("workTokenWallet i18n keys removed", () => {
    const en = JSON.parse(read("locales/en/freelancerDashboard.json"));
    const ar = JSON.parse(read("locales/ar/freelancerDashboard.json"));
    assert.equal(en.workTokenWallet, undefined);
    assert.equal(ar.workTokenWallet, undefined);
  });

  it("freelancer nav has no WT routes", () => {
    const nav = read("constants/freelancerNav.js");
    assert.doesNotMatch(nav, /work-token|workToken|Work Token/i);
    assert.doesNotMatch(nav, /priority-auction/i);
  });

  it("public /plans skips legacy main-plan fetch", () => {
    const hook = read("hooks/usePlansPage.js");
    assert.match(hook, /fetchPublicPlans:\s*Boolean\(slug\)/);
    assert.match(hook, /listPublicMarketplaceMembershipPlansRequest/);
  });

  it("economy Admin hides verification WT amount controls", () => {
    const page = read("pages/dashboard/SuperAdminMarketplaceEconomyPage.jsx");
    assert.match(page, /Verification Work Token bonuses — DEPRECATED/);
    assert.doesNotMatch(page, /id="mes-id-bonus"/);
    assert.doesNotMatch(page, /id="mes-payout-bonus"/);
  });
});
