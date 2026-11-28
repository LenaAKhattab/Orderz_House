/**
 * Unit — Smart Orders S1 customer input validation, phone normalisation, money parsing, projection.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { INTEGRATION_DISABLED_DATABASE_URL } = require("./helpers/integrationEnv");

process.env.DATABASE_URL = process.env.DATABASE_URL || INTEGRATION_DISABLED_DATABASE_URL;
const svc = require("../src/services/orderCustomerService");

describe("orderCustomerService.normalizePhoneE164", () => {
  it("accepts international formats and Arabic-Indic digits", () => {
    assert.equal(svc.normalizePhoneE164("+962 79-123 4567"), "+962791234567");
    assert.equal(svc.normalizePhoneE164("00971501234567"), "+971501234567");
    assert.equal(svc.normalizePhoneE164("+٩٦٢٧٩١٢٣٤٥٦٧"), "+962791234567");
  });
  it("rejects local / malformed numbers", () => {
    for (const bad of ["0791234567", "+0123", "abc", "", null, "+96279123456789012"]) {
      assert.equal(svc.normalizePhoneE164(bad), null, String(bad));
    }
  });
});

describe("orderCustomerService.parseCustomerInput", () => {
  it("absent / internal → legacy order (null)", () => {
    assert.equal(svc.parseCustomerInput(undefined), null);
    assert.equal(svc.parseCustomerInput(""), null);
    assert.equal(svc.parseCustomerInput(JSON.stringify({ mode: "internal" })), null);
  });
  it("mode is mandatory and never inferred from a phone number", () => {
    assert.throws(() => svc.parseCustomerInput({ phone: "+962791234567" }), (e) => e.publicCode === "SMART_ORDER_CUSTOMER_MODE_REQUIRED");
  });
  it("new_account requires a valid phone", () => {
    assert.throws(() => svc.parseCustomerInput({ mode: "new_account", phone: "079" }), (e) => e.publicCode === "SMART_ORDER_PHONE_INVALID");
    assert.equal(svc.parseCustomerInput({ mode: "new_account", phone: "+962791234567" }).phone, "+962791234567");
  });
  it("guest: WhatsApp channel needs a phone; email channel does not", () => {
    assert.throws(() => svc.parseCustomerInput({ mode: "guest", contactChannel: "whatsapp" }), (e) => e.publicCode === "SMART_ORDER_PHONE_INVALID");
    const g = svc.parseCustomerInput({ mode: "guest", contactChannel: "email", referenceName: "  سارة   " });
    assert.equal(g.guest.phone, null);
    assert.equal(g.guest.referenceName, "سارة");
    assert.equal(g.pricing.status, "pending_pricing");
  });
  it("existing requires a customer id", () => {
    assert.throws(() => svc.parseCustomerInput({ mode: "existing" }), (e) => e.publicCode === "SMART_ORDER_CUSTOMER_NOT_ELIGIBLE");
  });
  it("rejects unknown channels", () => {
    assert.throws(() => svc.parseCustomerInput({ mode: "existing", customerUserId: 5, channel: "app" }), (e) => e.publicCode === "SMART_ORDER_CUSTOMER_INVALID");
  });
});

describe("orderCustomerService.parsePrice (no float money)", () => {
  it("keeps exact 2-dp decimal text", () => {
    assert.deepEqual(svc.parsePrice("120.5", "aed"), { status: "priced", amount: "120.50", currency: "AED" });
    assert.deepEqual(svc.parsePrice("٣٠٠", "JOD"), { status: "priced", amount: "300.00", currency: "JOD" });
    assert.deepEqual(svc.parsePrice("", "JOD"), { status: "pending_pricing", amount: null, currency: null });
  });
  it("rejects invalid amounts and currencies", () => {
    for (const [a, c] of [["0", "JOD"], ["-1", "JOD"], ["1e3", "JOD"], ["10.123", "JOD"], ["10", "USD"]]) {
      assert.throws(() => svc.parsePrice(a, c), (e) => e.publicCode === "SMART_ORDER_PRICE_INVALID");
    }
  });
});

describe("orderCustomerService claim tokens", () => {
  it("only accepts 43-char base64url tokens and builds a fragment link", () => {
    assert.equal(svc.isWellFormedClaimToken("a".repeat(43)), true);
    assert.equal(svc.isWellFormedClaimToken("a".repeat(42)), false);
    assert.equal(svc.isWellFormedClaimToken("../../etc/passwd" + "a".repeat(27)), false);
    assert.match(svc.buildClaimUrl("a".repeat(43)), /\/claim-order#t=a{43}$/);
  });
});

describe("projectManagedOrderForCustomer", () => {
  const order = {
    id: "7",
    orderCode: "ORD-1",
    title: "t",
    description: "d",
    orderStatus: "pending_client_review",
    budget: 25,
    assignedFreelancerId: "99",
    bidUsers: [{ user: { email: "f@x" } }],
    files: [
      { id: "1", purpose: "brief", secureUrl: "https://r2/secret" },
      { id: "2", purpose: "delivery" },
      { id: "3", purpose: "revision_request" },
    ],
    clientRevisionNote: "internal",
  };
  it("never exposes freelancer pay, freelancer identity, URLs or undelivered files", () => {
    const p = svc.projectManagedOrderForCustomer(order, { customer_pricing_status: "pending_pricing" });
    assert.equal(p.budget, null);
    assert.equal(p.orderStatus, "in_progress");
    assert.equal(p.managedByAdmin, true);
    assert.equal(p.customerActionsAllowed, false);
    assert.equal(p.assignedFreelancerId, undefined);
    assert.deepEqual(p.bidUsers, []);
    assert.deepEqual(p.files.map((f) => f.id), ["1"]);
    assert.equal(p.files[0].secureUrl, undefined);
    assert.equal(p.clientRevisionNote, null);
  });
  it("shows the delivery once completed and the customer price when priced", () => {
    const p = svc.projectManagedOrderForCustomer(
      { ...order, orderStatus: "completed" },
      { customer_pricing_status: "priced", customer_price_amount: "99.90", customer_price_currency: "AED" },
    );
    assert.deepEqual(p.files.map((f) => f.id), ["1", "2"]);
    assert.equal(p.budget, 99.9);
    assert.equal(p.currencyCode, "AED");
  });
});

describe("deriveManagedCustomerState (execution separate from payment)", () => {
  const unpaid = { status: "accepted", paymentStatus: "unpaid" };
  const paid = { status: "accepted", paymentStatus: "paid" };
  const st = (orderStatus, customerQuote = null, workAuthorized = false) =>
    svc.deriveManagedCustomerState({ orderStatus, customerQuote, workAuthorized });

  it("accepted offer + unpaid quote without override → awaiting quote payment (never in progress)", () => {
    assert.deepEqual(st("assigned", unpaid), { display: "awaiting_quote_payment", paymentStatus: "pending" });
    assert.deepEqual(st("draft", { status: "issued", paymentStatus: "unpaid" }), {
      display: "awaiting_quote_payment",
      paymentStatus: "pending",
    });
  });
  it("paid but freelancer not yet engaged → awaiting assignment", () => {
    assert.deepEqual(st("draft", paid), { display: "awaiting_assignment", paymentStatus: "paid" });
    assert.deepEqual(st("assigned", paid), { display: "awaiting_assignment", paymentStatus: "paid" });
  });
  it("work started → in progress; an override keeps payment visibly pending", () => {
    assert.deepEqual(st("in_progress", paid), { display: "in_progress", paymentStatus: "paid" });
    assert.deepEqual(st("in_progress", unpaid, true), { display: "in_progress", paymentStatus: "pending" });
    assert.deepEqual(st("pending_client_review", unpaid, true), { display: "in_progress", paymentStatus: "pending" });
  });
  it("authorized but not yet started → awaiting assignment, payment still pending", () => {
    assert.deepEqual(st("assigned", unpaid, true), { display: "awaiting_assignment", paymentStatus: "pending" });
  });
  it("no quote: assigned is still being prepared; payment not required; never 'paid'", () => {
    assert.deepEqual(st("assigned"), { display: "draft", paymentStatus: "not_required" });
    assert.deepEqual(st("published"), { display: "published", paymentStatus: "not_required" });
  });
  it("expired unpaid quote is not payable → preparing, payment pending (not paid)", () => {
    assert.deepEqual(st("assigned", { status: "expired", paymentStatus: "unpaid" }), {
      display: "draft",
      paymentStatus: "pending",
    });
  });
  it("completed / cancelled pass through", () => {
    assert.equal(st("completed", paid).display, "completed");
    assert.equal(st("cancelled", unpaid).display, "cancelled");
  });
  it("projection never offers the legacy checkout", () => {
    const p = svc.projectManagedOrderForCustomer(
      { id: "1", orderStatus: "assigned", customerQuote: unpaid, files: [] },
      { customer_pricing_status: "priced", customer_price_amount: "10", customer_price_currency: "JOD" },
    );
    assert.equal(p.orderStatus, "awaiting_quote_payment");
    assert.equal(p.paymentStatus, "pending");
    assert.equal(p.requiresPayment, false);
    assert.equal(p.canPayNow, false);
  });
});
