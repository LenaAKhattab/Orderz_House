const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const controller = require("../controllers/freelancerActivationEngineController");

const router = express.Router();
router.use(requireAuth, requireFreelancer);

router.get("/activation-trial", controller.getMyTrial);
router.get("/activation/earned-balance", controller.getMyEarnedBalance);
router.get("/activation/conversion", controller.getMyConversion);
router.post("/activation/conversion/cta-viewed", controller.postCtaViewed);
router.post("/activation/conversion/start-silver-checkout", controller.postStartSilverCheckout);
router.post("/activation-trial/activate", controller.activateMyTrial);

module.exports = router;
