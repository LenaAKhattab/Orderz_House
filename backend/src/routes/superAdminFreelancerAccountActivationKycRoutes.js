const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/freelancerAccountActivationKycController");

const router = express.Router();
/** Web-Admin-A1: identity KYC queue — admin + super_admin (Flutter Super Admin parity). */
const guard = [requireAuth, requireAdmin];

router.get("/freelancer-activation-requests", ...guard, controller.listActivationRequests);
router.get("/freelancer-activation-requests/:id", ...guard, controller.getActivationRequest);
router.post(
  "/freelancer-activation-requests/:id/approve",
  ...guard,
  controller.approveActivationRequest,
);
router.post(
  "/freelancer-activation-requests/:id/reject",
  ...guard,
  controller.rejectActivationRequest,
);
router.get(
  "/freelancer-activation-requests/:id/files/:side",
  ...guard,
  controller.downloadActivationRequestFile,
);

module.exports = router;
