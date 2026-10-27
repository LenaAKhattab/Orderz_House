/** True when the existing `/client/orders/:id/pay-checkout` session can be started. */
export function isClientFixedOrderAwaitingStripeCheckout(order) {
  if (!order || String(order.projectType || "") !== "fixed") return false;
  if (String(order.orderStatus || "") !== "pending_payment") return false;
  const pay = String(order.paymentStatus || "");
  return pay === "unpaid" || pay === "pending";
}

/** Priced-bidding order whose selected offer awaits payment: «Continue payment» resumes that offer's checkout. */
export function isClientOrderAwaitingSelectedBidPayment(order) {
  if (!order || String(order.orderStatus || "") !== "awaiting_payment_after_bid_selection") return false;
  if (!order.selectedBidId) return false;
  return String(order.paymentStatus || "") !== "paid";
}
