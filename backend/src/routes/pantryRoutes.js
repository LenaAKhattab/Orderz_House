const express = require("express");
const { requireAuth, requireAdmin, requireRole } = require("../middleware/rbacMiddleware");
const pantryController = require("../controllers/pantryController");

const adminPantryRouter = express.Router();
const freelancerPantryRouter = express.Router();

/** Web-Admin-A1: pantry review actions — admin + super_admin (Flutter Super Admin parity). */
const pantryAdminGuard = [requireAuth, requireAdmin];

adminPantryRouter.get("/pantry/requests", ...pantryAdminGuard, pantryController.listAdminRequests);
adminPantryRouter.post("/pantry/requests", ...pantryAdminGuard, pantryController.createRequest);
adminPantryRouter.get("/pantry/requests/:id", ...pantryAdminGuard, pantryController.getAdminRequest);
adminPantryRouter.patch("/pantry/requests/:id", ...pantryAdminGuard, pantryController.patchRequest);
adminPantryRouter.post("/pantry/requests/:id/publish", ...pantryAdminGuard, pantryController.publishRequest);
adminPantryRouter.post(
  "/pantry/requests/:id/relist-bid-collection",
  ...pantryAdminGuard,
  pantryController.relistBidCollection,
);
adminPantryRouter.get("/pantry/requests/:id/bids", ...pantryAdminGuard, pantryController.listBids);
adminPantryRouter.get(
  "/pantry/requests/:id/fair-ranking",
  ...pantryAdminGuard,
  pantryController.getFairRanking,
);
adminPantryRouter.post(
  "/pantry/requests/:id/bids/:bidId/accept",
  ...pantryAdminGuard,
  pantryController.acceptBid,
);
adminPantryRouter.post(
  "/pantry/requests/:id/bids/:bidId/reject",
  ...pantryAdminGuard,
  pantryController.rejectBid,
);
adminPantryRouter.get("/pantry/deliveries", ...pantryAdminGuard, pantryController.listDeliveries);
adminPantryRouter.post(
  "/pantry/deliveries/:deliveryId/approve",
  ...pantryAdminGuard,
  pantryController.approveDelivery,
);
adminPantryRouter.post(
  "/pantry/deliveries/:deliveryId/request-revision",
  ...pantryAdminGuard,
  pantryController.requestRevision,
);

freelancerPantryRouter.get(
  "/pantry/requests",
  requireAuth,
  requireRole("freelancer"),
  pantryController.listOpenForFreelancer,
);
freelancerPantryRouter.get(
  "/pantry/requests/:id",
  requireAuth,
  requireRole("freelancer"),
  pantryController.getFreelancerRequest,
);
freelancerPantryRouter.post(
  "/pantry/requests/:id/bids",
  requireAuth,
  requireRole("freelancer"),
  pantryController.submitBid,
);
freelancerPantryRouter.get(
  "/pantry/my-work",
  requireAuth,
  requireRole("freelancer"),
  pantryController.listMyWork,
);
freelancerPantryRouter.post(
  "/pantry/requests/:id/deliveries",
  requireAuth,
  requireRole("freelancer"),
  pantryController.submitDelivery,
);

module.exports = {
  adminPantryRouter,
  freelancerPantryRouter,
};
