const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const { requireClientOwnsOrderParam } = require("../middleware/orderAuthMiddleware");
const ctrl = require("../controllers/marketplaceEliteDirectOrdersController");

const router = express.Router();

/**
 * Client Elite Direct Offer routes (dormant when elite_engine_enabled=false —
 * service rejects mutations with ELITE_ENGINE_OFF).
 */
router.get("/client/elite-direct-orders/status", requireAuth, requireRole("client"), ctrl.engineStatus);

router.get(
  "/client/orders/:id/elite-direct-offers",
  requireAuth,
  requireRole("client"),
  requireClientOwnsOrderParam,
  ctrl.listOffersForOrder,
);

router.post(
  "/client/orders/:id/elite-direct-offers",
  requireAuth,
  requireRole("client"),
  requireClientOwnsOrderParam,
  ctrl.createOffer,
);

router.post(
  "/client/elite-direct-offers/:offerId/cancel",
  requireAuth,
  requireRole("client"),
  ctrl.cancelOffer,
);

module.exports = router;
