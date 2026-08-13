const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const ctrl = require("../controllers/marketplacePriorityAuctionController");

const router = express.Router();
router.use(requireAuth, requireRole("freelancer"));

/**
 * GET /api/freelancer/priority-auctions/:auctionId
 * Own bid + anonymous highest + remaining PB uses. Engines OFF → service rejects mutations;
 * read still returns auction if present.
 */
router.get("/priority-auctions/:auctionId", ctrl.getMyAuctionView);

/**
 * POST /api/freelancer/priority-auctions/:auctionId/bids
 * Body: { bidTokens }
 */
router.post("/priority-auctions/:auctionId/bids", ctrl.submitMyPriorityBid);

/**
 * POST /api/freelancer/priority-auctions/:auctionId/bids/increase
 * Body: { bidTokens }
 */
router.post("/priority-auctions/:auctionId/bids/increase", ctrl.increaseMyPriorityBid);

module.exports = router;
