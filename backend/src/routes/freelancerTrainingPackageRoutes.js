const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/trainingPackageCheckoutController");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

router.get("/training-packages/me", controller.getMine);
router.post("/training-packages/checkout", controller.createCheckout);
router.post("/training-packages/checkout/cancel", controller.cancelCheckout);

module.exports = router;
