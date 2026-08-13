const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const ctrl = require("../controllers/marketplaceEliteDirectOrdersController");

const router = express.Router();
router.use(requireAuth, requireRole("freelancer"));

router.get("/elite-direct-offers", ctrl.listMyTargetOffers);
router.get("/elite-direct-offers/:offerId", ctrl.getOffer);
router.post("/elite-direct-offers/:offerId/accept", ctrl.acceptOffer);
router.post("/elite-direct-offers/:offerId/decline", ctrl.declineOffer);

module.exports = router;
