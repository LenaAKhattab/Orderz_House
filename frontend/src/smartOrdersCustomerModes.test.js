/**
 * Smart Orders S1 — frontend contracts: explicit customer mode step, guest payload has no account
 * fields, claim token handling, managed-order read-only views, five-language completeness.
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCustomerPayload,
  emptyCustomerDraft,
  isValidPriceText,
  normalizePhoneE164,
  validateCustomerDraft,
} from "./components/orders/smart/customerDraft.js";
import { canRoleAccessPath } from "./constants/authRoutes.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const json = (rel) => JSON.parse(read(rel));
const LOCALES = ["ar", "en", "de", "nl", "ro"];
const t = (k) => k;

function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

describe("customer draft validation", () => {
  it("mode must be chosen explicitly", () => {
    assert.ok(validateCustomerDraft(emptyCustomerDraft(), t).mode);
    assert.deepStrictEqual(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "internal" }, t), {});
  });
  it("existing needs a selected account; new account needs a valid phone", () => {
    assert.ok(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "existing" }, t).customer);
    assert.ok(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "new_account", phone: "0791234567" }, t).phone);
    assert.deepStrictEqual(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "new_account", phone: "+962791234567" }, t), {});
  });
  it("guest over WhatsApp needs a number, email contact does not", () => {
    assert.ok(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "guest", contactChannel: "whatsapp" }, t).phone);
    assert.deepStrictEqual(validateCustomerDraft({ ...emptyCustomerDraft(), mode: "guest", contactChannel: "email" }, t), {});
  });
  it("prices are decimal text with at most 2 decimals", () => {
    assert.strictEqual(isValidPriceText("120.50"), true);
    assert.strictEqual(isValidPriceText("1e3"), false);
    assert.strictEqual(isValidPriceText("10.123"), false);
    assert.strictEqual(normalizePhoneE164("00971 50 123 4567"), "+971501234567");
  });
});

describe("customer payload", () => {
  it("internal mode sends no customer block (legacy Admin order unchanged)", () => {
    assert.strictEqual(buildCustomerPayload({ ...emptyCustomerDraft(), mode: "internal" }), null);
    assert.strictEqual(buildCustomerPayload(emptyCustomerDraft()), null);
  });
  it("guest payload never carries account identity fields", () => {
    const p = buildCustomerPayload({ ...emptyCustomerDraft(), mode: "guest", phone: "+962791234567", referenceName: "سارة" });
    assert.strictEqual(p.mode, "guest");
    for (const forbidden of ["customerUserId", "email", "password", "otp"]) assert.ok(!(forbidden in p), forbidden);
  });
  it("existing sends only the selected account id", () => {
    const p = buildCustomerPayload({ ...emptyCustomerDraft(), mode: "existing", customer: { id: "42", maskedEmail: "a••@x" } });
    assert.strictEqual(p.customerUserId, "42");
    assert.ok(!("maskedEmail" in p));
  });
});

describe("wizard + pages wiring", () => {
  const wizard = read("components/orders/AdminInternalOrderWizard.jsx");
  it("customer step is first for real Admin orders only", () => {
    assert.match(wizard, /\.\.\.\(showCustomerStep \? \["customer"\] : \[\]\), \.\.\.\(showServiceStep \? \["service"\] : \[\]\), \.\.\.ADMIN_STEP_KEYS/);
    assert.match(wizard, /!isFakePoolMode && !isClientAudience && !isInstitutionalMode/);
    assert.match(wizard, /fd\.append\("customer", JSON\.stringify\(customerPayload\)\)/);
  });
  it("claim page reads the token from the URL fragment and strips it", () => {
    const page = read("pages/ClaimOrderPage.jsx");
    assert.match(page, /location\.hash/);
    assert.match(page, /window\.history\.replaceState/);
    assert.doesNotMatch(page, /searchParams\.get\("t"\)/);
    assert.strictEqual(canRoleAccessPath("/claim-order", "client"), true);
  });
  it("managed orders hide self-service price/actions on the customer side", () => {
    assert.match(read("components/orders/ClientOrderCardCompact.jsx"), /order\?\.managedByAdmin/);
    assert.match(read("pages/dashboard/FreelancerOrderDetailsPage.jsx"), /ManagedOrderNotice/);
  });
  it("WhatsApp messages are copy-only (no automatic sending)", () => {
    const msg = read("components/orders/smart/customerMessages.js") + read("components/orders/smart/CustomerWhatsappMessage.jsx");
    assert.doesNotMatch(msg, /wa\.me|api\.whatsapp|graph\.facebook/);
  });
});

describe("five-language completeness", () => {
  const en = flatten(json("locales/en/smartOrders.json"));
  for (const loc of LOCALES) {
    it(`smartOrders.json ${loc} has every key, non-empty, same placeholders`, () => {
      const m = flatten(json(`locales/${loc}/smartOrders.json`));
      assert.deepStrictEqual(Object.keys(m).sort(), Object.keys(en).sort());
      for (const [k, v] of Object.entries(en)) {
        assert.ok(String(m[k]).trim(), `${loc}:${k} empty`);
        const ph = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort().join(",");
        assert.strictEqual(ph(m[k]), ph(v), `${loc}:${k} placeholders`);
      }
    });
    it(`apiErrors ${loc} has every SMART_ORDER code`, () => {
      const codes = json(`locales/${loc}/apiErrors.json`).codes;
      for (const c of [
        "SMART_ORDER_CUSTOMER_MODE_REQUIRED",
        "SMART_ORDER_CLAIM_INVALID",
        "SMART_ORDER_CLAIM_CLIENT_ONLY",
        "SMART_ORDER_MANAGED_BY_TEAM",
        "SMART_ORDER_PHONE_INVALID",
      ]) {
        assert.ok(String(codes[c] || "").trim(), `${loc}:${c}`);
      }
    });
  }
});
