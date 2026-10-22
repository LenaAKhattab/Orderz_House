const express = require("express");
const { requireAuth } = require("../middleware/rbacMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");
const { ROLES } = require("../constants/roles");
const controller = require("../controllers/referralController");

const router = express.Router();

router.post("/capture", controller.capture);
router.get("/me", requireAuth, authorizeRoles(ROLES.CLIENT, ROLES.FREELANCER), controller.me);
router.post("/withdrawals", requireAuth, authorizeRoles(ROLES.CLIENT, ROLES.FREELANCER), controller.withdraw);
router.post(
  "/withdrawals/:id/cancel",
  requireAuth,
  authorizeRoles(ROLES.CLIENT, ROLES.FREELANCER),
  controller.cancelWithdrawal,
);

module.exports = router;
