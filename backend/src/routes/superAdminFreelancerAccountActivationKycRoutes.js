const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/freelancerAccountActivationKycController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

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
