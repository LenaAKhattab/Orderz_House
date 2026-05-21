/** User-facing message when marketplace participation is disabled for showcase pool rows. */
const SHOWCASE_POOL_UNAVAILABLE_AR = "هذا الطلب غير متاح حالياً";

function isShowcasePoolKind(kind) {
  return String(kind || "").trim() === "fake";
}

function isShowcasePoolOrderLike(order) {
  if (!order || typeof order !== "object") return false;
  if (order.isDisplayOnly === true) return true;
  if (String(order.orderSource || "").trim() === "fake") return true;
  return false;
}

function showcasePoolParticipationError() {
  const err = new Error(SHOWCASE_POOL_UNAVAILABLE_AR);
  err.statusCode = 409;
  err.exposeToClient = true;
  return err;
}

function assertShowcasePoolParticipationAllowed(resolved) {
  if (!resolved) return;
  if (isShowcasePoolKind(resolved.kind) || isShowcasePoolOrderLike(resolved.order)) {
    throw showcasePoolParticipationError();
  }
}

module.exports = {
  SHOWCASE_POOL_UNAVAILABLE_AR,
  isShowcasePoolKind,
  isShowcasePoolOrderLike,
  showcasePoolParticipationError,
  assertShowcasePoolParticipationAllowed,
};
