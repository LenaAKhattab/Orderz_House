/**
 * Phase B7A focused product cutover gate (static + constant assertions).
 * Run from frontend/: node --test src/b7aActiveProductCutover.test.js
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

describe("B7A Freelancer economy UX", () => {
  it("plans page mounts Membership; not Bid Credits summary or Work Token wallet", () => {
    const page = read("pages/dashboard/FreelancerPlansPage.jsx");
    assert.match(page, /FreelancerMarketplaceMembershipCard/);
    assert.doesNotMatch(page, /FreelancerBidCreditsCard/);
    assert.doesNotMatch(page, /FreelancerWorkTokenWalletCard/);
    assert.doesNotMatch(page, /العروض المتاحة/);
  });
});

describe("B7A application UX copy", () => {
  it("orders locales use Bid costs; no Work Token apply copy", () => {
    const en = read("locales/en/orders.json");
    const ar = read("locales/ar/orders.json");
    assert.match(en, /1 Bid|Bid/);
    assert.match(ar, /عرض/);
    assert.doesNotMatch(en, /Work Token/);
    assert.doesNotMatch(ar, /Work Token/);
  });
});

describe("B7A navigation", () => {
  it("freelancer nav has no Work Token wallet/purchase entries", () => {
    const nav = read("constants/freelancerNav.js");
    assert.doesNotMatch(nav, /work-token|workToken|Work Token/i);
    assert.doesNotMatch(nav, /priority-auction|priorityAuction/i);
  });
});

describe("B7A localization orphans", () => {
  it("workTokenWallet locale keys are removed from active Freelancer dashboard copy", () => {
    const en = JSON.parse(read("locales/en/freelancerDashboard.json"));
    const ar = JSON.parse(read("locales/ar/freelancerDashboard.json"));
    assert.equal(en.workTokenWallet, undefined);
    assert.equal(ar.workTokenWallet, undefined);
  });
});

describe("B7A public plans marketing", () => {
  it("plans hero describes Bids, daily limits, and project caps", () => {
    const en = JSON.parse(read("locales/en/plans.json"));
    const ar = JSON.parse(read("locales/ar/plans.json"));
    assert.match(en.hero.subtitle, /Bids/);
    assert.match(en.hero.subtitle, /daily limits/i);
    assert.match(en.hero.subtitle, /project caps/i);
    assert.match(ar.hero.subtitle, /عروض/);
    assert.match(ar.hero.subtitle, /الحد اليومي/);
    assert.match(ar.hero.subtitle, /سقف المشاريع/);
    assert.doesNotMatch(en.hero.subtitle, /Work Token/i);
    assert.doesNotMatch(ar.hero.subtitle, /Work Token/i);
  });
});
