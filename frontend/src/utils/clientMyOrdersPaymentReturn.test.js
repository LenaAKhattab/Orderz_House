import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getBidPaymentConfirmFailureToast,
  getFixedPaymentConfirmFailureToast,
  parseConfirmPaymentAxiosError,
} from "./clientMyOrdersPaymentReturn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientMyOrdersPageSource = readFileSync(join(__dirname, "../pages/dashboard/ClientMyOrdersPage.jsx"), "utf8");

describe("clientMyOrdersPaymentReturn", () => {
  it("maps 402 + PAYMENT_NOT_COMPLETED to bid pending-verify copy", () => {
    const t = getBidPaymentConfirmFailureToast(false, {
      status: 402,
      code: "PAYMENT_NOT_COMPLETED",
      message: "Payment is not completed yet.",
    });
    assert.match(t.message, /refresh/i);
    assert.equal(t.variant, "pending_verify");
  });

  it("maps 409 state errors for bid", () => {
    const t = getBidPaymentConfirmFailureToast(true, {
      status: 409,
      code: "CONFLICT",
      message: "Order is not awaiting selected-bid payment.",
    });
    assert.match(t.title, /حالة/);
    assert.equal(t.variant, "state");
  });

  it("fixed payment failure copy is unchanged (project creation framing)", () => {
    const t = getFixedPaymentConfirmFailureToast(false);
    assert.match(t.message, /Project creation failed/i);
  });

  it("parseConfirmPaymentAxiosError reads axios shape", () => {
    const p = parseConfirmPaymentAxiosError({
      response: { status: 402, data: { code: "PAYMENT_NOT_COMPLETED", message: "x" } },
    });
    assert.equal(p.status, 402);
    assert.equal(p.code, "PAYMENT_NOT_COMPLETED");
    assert.equal(p.message, "x");
  });

  it("bid generic failure copy is not the fixed-order ‘project creation’ message", () => {
    const bid = getBidPaymentConfirmFailureToast(false, { status: 500, message: "internal" });
    const fixed = getFixedPaymentConfirmFailureToast(false);
    assert.notEqual(bid.message, fixed.message);
  });
});

describe("ClientMyOrdersPage payment-return wiring", () => {
  it("pay-cancel is only invoked for fixed-order branches (two await call sites)", () => {
    const n = (clientMyOrdersPageSource.match(/await cancelClientFixedOrderPaymentRequest/g) || []).length;
    assert.equal(n, 2);
  });

  it("fixed payment confirm failure still triggers pay-cancel (regression)", () => {
    assert.match(
      clientMyOrdersPageSource,
      /else if \(orderId\) \{\s*\n\s*try \{\s*\n\s*await cancelClientFixedOrderPaymentRequest/s,
    );
  });

  it("bid payment confirm failure uses bid toast helper, not pay-cancel", () => {
    const paidBlock = clientMyOrdersPageSource.indexOf('if (paid === "1")');
    const catchStart = clientMyOrdersPageSource.indexOf("} catch (e) {", paidBlock);
    const catchEnd = clientMyOrdersPageSource.indexOf("} finally {", catchStart);
    const paidCatch = clientMyOrdersPageSource.slice(catchStart, catchEnd);
    const bidBranch = paidCatch.split("if (orderId && bidId)")[1]?.split("} else if (orderId)")[0] || "";
    assert.match(bidBranch, /getBidPaymentConfirmFailureToast/);
    assert.doesNotMatch(bidBranch, /cancelClientFixedOrderPaymentRequest/);
  });
});
