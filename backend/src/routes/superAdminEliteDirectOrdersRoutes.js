const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const ctrl = require("../controllers/marketplaceEliteDirectOrdersController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

/** Super Admin read/audit + authorized create/cancel (existing order authority). No Token mutation. */
router.get("/elite-direct-offers/:offerId", ...guard, ctrl.adminGetOffer);
router.get("/orders/:orderId/elite-direct-offers", ...guard, ctrl.listOffersForOrder);
router.post("/orders/:orderId/elite-direct-offers", ...guard, ctrl.createOffer);
router.post("/elite-direct-offers/:offerId/cancel", ...guard, ctrl.cancelOffer);

module.exports = router;
