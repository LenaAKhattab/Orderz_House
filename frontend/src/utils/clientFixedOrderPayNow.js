/** True when the existing `/client/orders/:id/pay-checkout` session can be started. */
export function isClientFixedOrderAwaitingStripeCheckout(order) {
  if (!order || String(order.projectType || "") !== "fixed") return false;
  if (String(order.orderStatus || "") !== "pending_payment") return false;
  const pay = String(order.paymentStatus || "");
  return pay === "unpaid" || pay === "pending";
}
