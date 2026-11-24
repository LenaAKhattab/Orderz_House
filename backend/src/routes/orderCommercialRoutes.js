/**
 * Smart Orders S3 — commercial routes.
 *  adminRouter      (/api/admin)      quotes, guest link, acceptance record, offers, work authorization, pay changes
 *  clientRouter     (/api)            linked customer: accept / pay own quote
 *  guestRouter      (/api)            guest quote page + checkout (token only, IP rate-limited)
 *  freelancerRouter (/api/freelancer) offers: list / accept / reject; respond to pay changes
 */
const express = require("express");
const rateLimit = require("express-rate-limit");
const { param } = require("express-validator");
const validateRequest = require("../middleware/validateRequest");
const { requireAuth, requireRole, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");
const { rateLimitJsonHandler, userOrIpKey } = require("../middleware/rateLimitHelpers");
const svc = require("../services/orderCommercialService");

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};
const actor = (req) => ({
  actorUserId: req.auth.userId,
  actorRole: req.auth?.primaryRole || req.auth?.legacyRole || req.user?.role || "admin",
});
const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const idParam = (name = "id") => [param(name).isInt({ min: 1 }).withMessage("Invalid id."), validateRequest];
const limiter = (name, max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => userOrIpKey(name, req),
    handler: rateLimitJsonHandler(name, "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.", { windowMsFallback: 15 * 60 * 1000 }),
  });

// ---- Admin ----
const adminRouter = express.Router();
const staff = [requireAuth, requireAnyRole(["super_admin", "admin"])];
const ordersPerm = requirePermission("dashboard.admin.orders");
const createPerm = requirePermission("dashboard.admin.create_order");
const overridePerm = requirePermission("dashboard.admin.commercial_override");

adminRouter.get(
  "/orders/:id/commercial",
  ...staff,
  ordersPerm,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.getAdminCommercial(req.params.id))),
);
adminRouter.post(
  "/orders/:id/quotes",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.issueQuote({ orderId: req.params.id, input: req.body || {}, ...actor(req) }), 201)),
);
adminRouter.post(
  "/orders/:id/quotes/cancel",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.cancelQuote({ orderId: req.params.id, reason: req.body?.reason, ...actor(req) }))),
);
adminRouter.post(
  "/orders/:id/quotes/guest-link",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    ok(res, await svc.regenerateGuestLink({ orderId: req.params.id, ...actor(req) }), 201);
  }),
);
adminRouter.post(
  "/orders/:id/quotes/record-acceptance",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.recordQuoteAcceptance({ orderId: req.params.id, evidence: req.body?.evidence, ...actor(req) }))),
);
adminRouter.post(
  "/orders/:id/assignment-offers",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.createOffer({ orderId: req.params.id, input: req.body || {}, ...actor(req) }), 201)),
);
adminRouter.post(
  "/orders/:id/assignment-offers/cancel",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.cancelOffer({ orderId: req.params.id, reason: req.body?.reason, ...actor(req) }))),
);
adminRouter.post(
  "/orders/:id/work-authorizations",
  ...staff,
  overridePerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.authorizeWork({ orderId: req.params.id, reason: req.body?.reason, ...actor(req) }), 201)),
);
adminRouter.post(
  "/orders/:id/compensation-changes",
  ...staff,
  createPerm,
  adminWriteLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await svc.requestCompensationChange({
        orderId: req.params.id,
        newAmount: req.body?.newAmount,
        newDueAt: req.body?.newDueAt,
        reason: req.body?.reason,
        ...actor(req),
      }),
      201,
    ),
  ),
);

// ---- Linked customer ----
const clientRouter = express.Router();
const clientGuard = [requireAuth, requireRole("client")];
const payLimiter = limiter("order_quote_pay", 20);
clientRouter.post(
  "/client/orders/:id/quote/accept",
  ...clientGuard,
  payLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(res, await svc.customerAcceptQuote({ clientUserId: req.auth.userId, orderId: req.params.id, channel: req.body?.channel })),
  ),
);
clientRouter.post(
  "/client/orders/:id/quote/checkout",
  ...clientGuard,
  payLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(
      res,
      await svc.createQuoteCheckout({
        orderId: req.params.id,
        clientUserId: req.auth.userId,
        channel: req.body?.channel === "mobile" ? "mobile" : "web",
      }),
    ),
  ),
);

// ---- Guest (no account) ----
const guestRouter = express.Router();
const guestView = limiter("guest_quote_view", 60);
const guestPay = limiter("guest_quote_pay", 15);
guestRouter.post(
  "/guest-quotes/view",
  guestView,
  wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    ok(res, { quote: await svc.guestQuoteView({ token: String(req.body?.token || ""), funnelEvent: req.body?.event || null }) });
  }),
);
guestRouter.post(
  "/guest-quotes/checkout",
  guestPay,
  wrap(async (req, res) => {
    res.set("Cache-Control", "no-store");
    ok(res, await svc.createQuoteCheckout({ guestToken: String(req.body?.token || ""), channel: "web" }));
  }),
);

// ---- Freelancer ----
const freelancerRouter = express.Router();
const fGuard = [requireAuth, requireRole("freelancer")];
const fLimiter = limiter("assignment_offer_action", 40);
freelancerRouter.get(
  "/assignment-offers",
  ...fGuard,
  wrap(async (req, res) => ok(res, { offers: await svc.listFreelancerOffers({ freelancerUserId: req.auth.userId }) })),
);
freelancerRouter.post(
  "/assignment-offers/:id/accept",
  ...fGuard,
  fLimiter,
  ...idParam(),
  wrap(async (req, res) => ok(res, await svc.acceptOffer({ freelancerUserId: req.auth.userId, offerId: req.params.id }))),
);
freelancerRouter.post(
  "/assignment-offers/:id/reject",
  ...fGuard,
  fLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(res, await svc.rejectOffer({ freelancerUserId: req.auth.userId, offerId: req.params.id, reasonCode: req.body?.reasonCode })),
  ),
);
freelancerRouter.post(
  "/commercial-changes/:id/respond",
  ...fGuard,
  fLimiter,
  ...idParam(),
  wrap(async (req, res) =>
    ok(res, await svc.respondToChange({ freelancerUserId: req.auth.userId, changeId: req.params.id, approve: req.body?.approve === true })),
  ),
);

module.exports = { adminRouter, clientRouter, guestRouter, freelancerRouter };
