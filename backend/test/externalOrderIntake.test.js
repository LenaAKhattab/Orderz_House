/**
 * Unit + source-contract tests: external (WhatsApp) order intake.
 * Real-Postgres lifecycle lives in externalOrderIntake.integration.test.js.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const svc = require("../src/services/externalOrderIntakeService");

const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
const RLM = String.fromCharCode(0x200f);
const ZWSP = String.fromCharCode(0x200b);
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const ARABIC_FIVE = String.fromCharCode(0x0665);
const PERSIAN_SEVEN = String.fromCharCode(0x06f7);
const FULLWIDTH_A = String.fromCharCode(0xff21);

test("normalizeExternalOrderId: trims, strips invisible marks and leading #, keeps visible case", () => {
  assert.deepStrictEqual(svc.normalizeExternalOrderId("  WA-1001 "), { display: "WA-1001", normalized: "WA-1001" });
  assert.deepStrictEqual(svc.normalizeExternalOrderId(`${RLM}#wa-1001${ZWSP}`), { display: "wa-1001", normalized: "WA-1001" });
  assert.deepStrictEqual(svc.normalizeExternalOrderId(`${LRI}12345${PDI}`), { display: "12345", normalized: "12345" });
  assert.deepStrictEqual(svc.normalizeExternalOrderId(12345), { display: "12345", normalized: "12345" });
  assert.deepStrictEqual(svc.normalizeExternalOrderId("ord_2026/11.09#7"), { display: "ord_2026/11.09#7", normalized: "ORD_2026/11.09#7" });
});

test("normalizeExternalOrderId: Arabic-Indic / Persian digits and full-width letters fold to ASCII", () => {
  assert.strictEqual(svc.normalizeExternalOrderId(`A${ARABIC_FIVE}${PERSIAN_SEVEN}`).normalized, "A57");
  assert.strictEqual(svc.normalizeExternalOrderId(`${FULLWIDTH_A}1`).normalized, "A1");
});

test("normalizeExternalOrderId: rejects invalid / malicious values", () => {
  for (const bad of [
    undefined,
    null,
    "",
    "   ",
    "#",
    "12 34",
    "<b>1</b>",
    "1'; DROP TABLE orders;--",
    "../etc/passwd",
    "-123",
    "طلب١٢",
    "a".repeat(65),
    "x".repeat(300),
    { id: 1 },
    ["1"],
    "abc\u0000",
  ]) {
    assert.strictEqual(svc.normalizeExternalOrderId(bad), null, `should reject ${JSON.stringify(bad)}`);
  }
  assert.ok(svc.normalizeExternalOrderId("a".repeat(64)));
});

test("parseApprovalPrice: exact decimal strings, no floats, > 0, ≤ 2 decimals", () => {
  assert.strictEqual(svc.parseApprovalPrice("37.5"), "37.50");
  assert.strictEqual(svc.parseApprovalPrice("37.50"), "37.50");
  assert.strictEqual(svc.parseApprovalPrice(" 0012 "), "12.00");
  assert.strictEqual(svc.parseApprovalPrice(41), "41.00");
  assert.strictEqual(svc.parseApprovalPrice("0.01"), "0.01");
  assert.strictEqual(svc.parseApprovalPrice("999999.99"), "999999.99");
  for (const bad of ["0", "0.00", "-1", "1.234", "1e3", "abc", "", null, undefined, "1,5", "1000000", NaN, Infinity]) {
    assert.throws(
      () => svc.parseApprovalPrice(bad),
      (err) => err.publicCode === "EXTERNAL_ORDER_PRICE_INVALID" && err.statusCode === 400,
      `should reject ${String(bad)}`,
    );
  }
});

test("mapIntakeForFreelancer never exposes reviewer, internal note, other freelancers or pending price", () => {
  const base = {
    id: "9",
    external_order_id: "WA-1",
    source: "whatsapp",
    submitted_at: new Date(),
    reviewed_at: new Date(),
    approved_price: "12.00",
    currency_code: "JOD",
    order_id: "77",
    order_code: "OC",
    order_status: "in_progress",
    reviewed_by_user_id: "5",
    reviewed_by_role: "admin",
    internal_note: "secret",
    freelancer_user_id: "3",
    rejection_reason_code: null,
  };
  const pending = svc.mapIntakeForFreelancer({ ...base, status: "pending_review", approved_price: null, order_id: null });
  assert.strictEqual(pending.price, null);
  assert.strictEqual(pending.orderId, null);
  const approved = svc.mapIntakeForFreelancer({ ...base, status: "approved" });
  assert.strictEqual(approved.price, "12.00");
  assert.strictEqual(approved.orderId, "77");
  const rejected = svc.mapIntakeForFreelancer({ ...base, status: "rejected", rejection_reason_code: "invalid_id", approved_price: null, order_id: null });
  assert.strictEqual(rejected.rejectionReasonCode, "invalid_id");
  for (const out of [pending, approved, rejected]) {
    const json = JSON.stringify(out);
    assert.ok(!json.includes("secret"));
    assert.deepStrictEqual(
      Object.keys(out).sort(),
      ["currency", "externalOrderId", "id", "orderCode", "orderId", "orderStatus", "price", "rejectionReasonCode", "reviewedAt", "source", "status", "submittedAt"],
    );
  }
});

test("routes: freelancer id from auth only; role guards; approval needs create-order permission + limiter", () => {
  const routes = read("src/routes/externalOrderIntakeRoutes.js");
  assert.match(routes, /freelancerRouter\.post\(\s*"\/external-order-intakes",\s*requireAuth,\s*requireRole\("freelancer"\),\s*externalOrderIntakeSubmitLimiter/);
  assert.match(routes, /requireAnyRole\(\["super_admin", "admin"\]\)/);
  assert.match(routes, /"\/external-order-intakes\/:id\/approve",\s*\.\.\.adminGuard,\s*ordersPerm,\s*createOrderPerm,\s*adminOrderCreateLimiter/);
  const ctrl = read("src/controllers/externalOrderIntakeController.js");
  assert.match(ctrl, /freelancerUserId: req\.auth\.userId/);
  assert.doesNotMatch(ctrl, /body\.freelancer/i);
  const app = read("src/app.js");
  assert.match(app, /app\.use\("\/api\/freelancer", externalOrderIntakeRoutes\.freelancerRouter\)/);
  assert.match(app, /app\.use\("\/api\/admin", externalOrderIntakeRoutes\.adminRouter\)/);
});

test("approval reuses the canonical internal-order service inside one transaction (no wallet / ledger writes)", () => {
  const src = read("src/services/externalOrderIntakeService.js");
  assert.match(src, /FOR UPDATE/);
  assert.match(src, /ordersService\.createInternalOrderInTransaction\(client,/);
  assert.match(src, /skipFreelancerBroadcast: true/);
  assert.match(src, /projectType: "fixed"/);
  assert.doesNotMatch(src, /freelancer_cash_|creditAvailableBalance|INSERT INTO financial_/);
  const orders = read("src/services/ordersService.js");
  assert.match(orders, /async function createInternalOrderInTransaction\(\s*client,/);
  // The standalone wrapper still owns BEGIN/COMMIT/ROLLBACK and post-commit translation.
  const wrapper = orders.slice(orders.indexOf("async function createInternalOrder({"));
  assert.match(wrapper.slice(0, 2500), /BEGIN[\s\S]*createInternalOrderInTransaction[\s\S]*COMMIT[\s\S]*scheduleRealOrderTranslation[\s\S]*ROLLBACK/);
});

test("migration 215: live-ID partial unique index, one order per intake, state consistency check", () => {
  const sql = read("sql/migrations/215_external_order_intakes.sql");
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS external_order_intakes_live_id_uidx[\s\S]*WHERE status IN \('pending_review', 'approved'\)/);
  assert.match(sql, /external_order_intakes_order_uidx[\s\S]*approved_order_id/);
  assert.match(sql, /external_order_intakes_state_chk/);
  assert.match(sql, /'215_external_order_intakes'/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test("rejection notifies only the freelancer; submission creates no Admin notification fan-out", () => {
  const src = read("src/services/externalOrderIntakeService.js");
  assert.match(src, /type: "external_order_intake\.rejected"/);
  assert.match(src, /recipientRole: "freelancer"/);
  assert.doesNotMatch(src, /notifyAdmins|notifySuperAdmins|getRoleUserIds/);
});
