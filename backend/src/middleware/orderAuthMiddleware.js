const { resolvedRoleNames } = require("./rbacMiddleware");
const orderAuthz = require("../services/orderAuthorizationService");

function sendAuthzError(res, err) {
  const status = Number(err?.statusCode) || 500;
  const message =
    status >= 500
      ? "حدث خطأ غير متوقع."
      : err?.exposeToClient === false && status === 404
        ? "Order not found."
        : err?.message || (status === 401 ? "يجب تسجيل الدخول." : "ليس لديك صلاحية لهذا الإجراء.");
  return res.status(status).json({
    success: false,
    message,
    code: status === 401 ? "UNAUTHORIZED" : status === 404 ? "NOT_FOUND" : "FORBIDDEN",
    ...(err?.reason && status === 403 ? { reason: err.reason } : {}),
  });
}

function asyncAuthz(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
      if (!res.headersSent) return next();
    } catch (err) {
      if (err?.statusCode && err.statusCode < 500) return sendAuthzError(res, err);
      return next(err);
    }
  };
}

/** Pool marketplace: authenticated freelancers only (no guest/client scraping). */
function requireFreelancerPoolViewer(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "يجب تسجيل الدخول.", code: "UNAUTHORIZED" });
  }
  const roles = resolvedRoleNames(req);
  if (roles.includes("freelancer")) return next();
  if (roles.some((r) => orderAuthz.STAFF_ORDER_ROLES.includes(r))) return next();
  return res.status(403).json({ success: false, message: "ليس لديك صلاحية لهذا الإجراء.", code: "FORBIDDEN" });
}

const requireClientOwnsOrderParam = asyncAuthz(async (req) => {
  const uid = orderAuthz.requireAuthenticatedUserId(req.auth);
  await orderAuthz.assertClientOwnsOrder(uid, req.params.id);
});

const requireFreelancerAssignedOrderParam = asyncAuthz(async (req) => {
  const uid = orderAuthz.requireAuthenticatedUserId(req.auth);
  await orderAuthz.assertFreelancerAssignedToOrder(uid, req.params.id);
});

const requireFreelancerPoolOrderAccess = asyncAuthz(async (req) => {
  const uid = orderAuthz.requireAuthenticatedUserId(req.auth);
  await orderAuthz.assertFreelancerCanAccessPoolOrder(uid, req.params.id);
});

const requireFreelancerCanClaimOrderParam = asyncAuthz(async (req) => {
  const uid = orderAuthz.requireAuthenticatedUserId(req.auth);
  await orderAuthz.assertFreelancerCanClaimOrder(uid, req.params.id);
});

const requireFreelancerCanBidOrderParam = asyncAuthz(async (req) => {
  const uid = orderAuthz.requireAuthenticatedUserId(req.auth);
  await orderAuthz.assertFreelancerCanBidOrder(uid, req.params.id);
});

const requireOrderParticipantParam = asyncAuthz(async (req) => {
  await orderAuthz.assertOrderParticipant({ auth: req.auth, orderId: req.params.id });
});

const requireOrderFileAccess = asyncAuthz(async (req) => {
  await orderAuthz.assertCanAccessOrderFile({
    auth: req.auth,
    orderId: req.params.id,
    fileId: req.params.fileId,
  });
});

module.exports = {
  sendAuthzError,
  requireFreelancerPoolViewer,
  requireClientOwnsOrderParam,
  requireFreelancerAssignedOrderParam,
  requireFreelancerPoolOrderAccess,
  requireFreelancerCanClaimOrderParam,
  requireFreelancerCanBidOrderParam,
  requireOrderParticipantParam,
  requireOrderFileAccess,
};
