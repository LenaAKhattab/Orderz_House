import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isClientFixedOrderAwaitingStripeCheckout,
  isClientOrderAwaitingSelectedBidPayment,
} from "./utils/clientFixedOrderPayNow.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(here, p), "utf8");
const json = (p) => JSON.parse(read(p));

describe("selected-bid payment can always be continued", () => {
  it("an order awaiting payment for its selected offer offers «Continue payment»", () => {
    const awaiting = { projectType: "bidding", orderStatus: "awaiting_payment_after_bid_selection", paymentStatus: "pending", selectedBidId: "77" };
    assert.equal(isClientOrderAwaitingSelectedBidPayment(awaiting), true);
    assert.equal(isClientFixedOrderAwaitingStripeCheckout(awaiting), false);
    assert.equal(isClientOrderAwaitingSelectedBidPayment({ ...awaiting, paymentStatus: "paid" }), false);
    assert.equal(isClientOrderAwaitingSelectedBidPayment({ ...awaiting, selectedBidId: null }), false);
    assert.equal(isClientOrderAwaitingSelectedBidPayment({ ...awaiting, orderStatus: "open_for_bids" }), false);
  });

  it("the button resumes the selected offer's checkout (same order, same Session)", () => {
    const btn = read("components/orders/ClientFixedOrderPayNowButton.jsx");
    assert.ok(btn.includes("await selectClientOrderBidRequest(order.id, order.selectedBidId)"));
    assert.ok(btn.includes("CLIENT_ORDER_PAYMENT_REVIEW_REQUIRED"));
    assert.ok(btn.includes("usePageRestore("));
  });

  it("the order card keeps the offers reachable while awaiting payment («Choose another offer»)", () => {
    const card = read("components/orders/ClientOrderCardCompact.jsx");
    assert.ok(card.includes('(order?.orderStatus === "open_for_bids" || awaitingSelectedBidPayment)'));
    assert.ok(card.includes("t(`${oc}.chooseAnotherOffer`)"));
  });

  it("offers modal: BFCache-safe busy state, «Continue payment» for the selected offer, safe error codes", () => {
    const modal = read("components/orders/ClientBiddingOffersModal.jsx");
    assert.ok(modal.includes("usePageRestore("));
    assert.ok(modal.includes('bid.status === "selected_pending_payment"'));
    assert.ok(modal.includes("t(`${b}.continuePayment`)"));
    assert.ok(modal.includes("if (data.alreadyPaid) {"));
    assert.ok(modal.includes("if (!redirecting) {"));
  });

  it("Stripe return without payment: actionable info, never an error / login / network message", () => {
    const page = read("pages/dashboard/ClientMyOrdersPage.jsx");
    assert.ok(page.includes("t(`${m}.paymentNotCompletedBidMessage`)"));
    assert.ok(!page.includes("getBidCheckoutCancelledToast"));
  });

  it("AR/EN copy suggests another card or the bank after a decline", () => {
    for (const l of ["ar", "en"]) {
      const ca = json(`locales/${l}/clientArea.json`);
      const fd = json(`locales/${l}/freelancerDashboard.json`);
      for (const text of [ca.myOrders.paymentNotCompletedMessage, ca.myOrders.paymentNotCompletedBidMessage, fd.marketplaceMembership.checkoutCancelledMessage]) {
        assert.ok(l === "ar" ? text.includes("بطاقة أخرى") : /another card/.test(text), text);
      }
      assert.ok(ca.payNow.reviewRequired && ca.payNow.bidPaidMessage && ca.biddingOffers.continuePayment && ca.orderCard.chooseAnotherOffer);
    }
    assert.equal(json("locales/ar/clientArea.json").biddingOffers.continuePayment, "متابعة الدفع");
  });
});
