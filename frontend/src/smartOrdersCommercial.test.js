/**
 * Smart Orders S3 — frontend contracts: guest page token handling, server-truth payment states, privacy of the
 * customer/freelancer views, routes, five-language completeness.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canRoleAccessPath } from "./constants/authRoutes.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const LOCALES = ["ar", "en", "de", "nl", "ro"];

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

describe("guest quote page", () => {
  const page = read("pages/GuestQuotePage.jsx");
  it("token only from the URL fragment, then stripped; no login", () => {
    assert.match(page, /location\.hash/);
    assert.match(page, /window\.history\.replaceState/);
    assert.doesNotMatch(page, /searchParams\.get\("t"\)|useAuth/);
  });
  it("success return never claims paid on its own (server status decides)", () => {
    assert.match(page, /quote\.paymentStatus === "paid"/);
    assert.match(page, /successPending/);
  });
  it("public route, staff routes protected", () => {
    assert.strictEqual(canRoleAccessPath("/pay-quote", "client"), true);
    assert.strictEqual(canRoleAccessPath("/dashboard/freelancer/assignment-offers", "client"), false);
    assert.strictEqual(canRoleAccessPath("/dashboard/freelancer/assignment-offers", "freelancer"), true);
  });
});

describe("privacy", () => {
  it("customer quote UI never renders freelancer pay", () => {
    const card = read("components/orders/smart/CustomerQuoteCard.jsx");
    assert.doesNotMatch(card, /freelancerBudget|compensation|budget/i);
  });
  it("freelancer offers page shows no customer contact data", () => {
    const page = read("pages/dashboard/FreelancerAssignmentOffersPage.jsx");
    assert.doesNotMatch(page, /phone|guest|customerUser|maskedEmail/i);
  });
  it("work-before-payment permission is explicit and assignable", () => {
    const perms = read("constants/dashboardPermissions.js");
    assert.match(perms, /commercialOverride: "dashboard\.admin\.commercial_override"/);
    assert.match(perms, /ADMIN_PAGE_PERMISSIONS\.commercialOverride,/);
  });
});

describe("five-language S3 strings", () => {
  const en = flatten(json("locales/en/smartOrders.json"));
  const s3 = Object.keys(en).filter((k) => /^(commercial|customerQuote|guestPay|offers)\./.test(k));
  for (const loc of LOCALES) {
    it(`${loc}: every S3 key translated with matching placeholders`, () => {
      const m = flatten(json(`locales/${loc}/smartOrders.json`));
      for (const key of s3) {
        assert.ok(String(m[key] || "").trim(), `${loc}:${key}`);
        const ph = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort().join(",");
        assert.strictEqual(ph(m[key]), ph(en[key]), `${loc}:${key}`);
      }
      const codes = json(`locales/${loc}/apiErrors.json`).codes;
      for (const c of ["SMART_ORDER_WORK_NOT_AUTHORIZED", "SMART_ORDER_OFFER_EXPIRED", "SMART_ORDER_QUOTE_LINK_INVALID", "SMART_ORDER_QUOTE_PAID_LOCKED"]) {
        assert.ok(String(codes[c] || "").trim(), `${loc}:${c}`);
      }
    });
  }
});
