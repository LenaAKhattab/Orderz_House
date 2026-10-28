import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as paymentReturn from "./clientMyOrdersPaymentReturn.js";

const { getBidPaymentConfirmFailureToast, parseConfirmPaymentAxiosError } = paymentReturn;

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

  it("no stale 'project creation failed' copy (a Stripe return never discards the order)", () => {
    assert.equal(paymentReturn.getFixedPaymentConfirmFailureToast, undefined);
    assert.equal(paymentReturn.getFixedCheckoutCancelledToast, undefined);
    assert.ok(!/فشل إنشاء المشروع|Project creation failed/.test(readFileSync(join(__dirname, "clientMyOrdersPaymentReturn.js"), "utf8")));
  });

  it("parseConfirmPaymentAxiosError reads axios shape", () => {
    const p = parseConfirmPaymentAxiosError({
      response: { status: 402, data: { code: "PAYMENT_NOT_COMPLETED", message: "x" } },
    });
    assert.equal(p.status, 402);
    assert.equal(p.code, "PAYMENT_NOT_COMPLETED");
    assert.equal(p.message, "x");
  });

  it("bid generic failure copy never shows the raw server message", () => {
    const bid = getBidPaymentConfirmFailureToast(false, { status: 500, message: "internal" });
    assert.notEqual(bid.message, "internal");
  });
});

describe("ClientMyOrdersPage payment-return wiring", () => {
  it("a Stripe return never discards the order (pay-cancel is an explicit client action only)", () => {
    assert.equal((clientMyOrdersPageSource.match(/cancelClientFixedOrderPaymentRequest/g) || []).length, 0);
  });

  it("fixed payment confirm failure keeps the order and explains it is confirming", () => {
    const paidBlock = clientMyOrdersPageSource.indexOf('if (paid === "1")');
    const catchStart = clientMyOrdersPageSource.indexOf("} catch (e) {", paidBlock);
    const catchEnd = clientMyOrdersPageSource.indexOf("} finally {", catchStart);
    const fixedBranch = clientMyOrdersPageSource.slice(catchStart, catchEnd).split("} else if (orderId)")[1] || "";
    assert.match(fixedBranch, /paymentConfirmingMessage/);
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
