const express = require("express");
const { requireAuth, requireSuperAdmin } = require("../middleware/rbacMiddleware");
const ctrl = require("../controllers/marketplacePriorityAuctionController");

const router = express.Router();
const guard = [requireAuth, requireSuperAdmin];

router.get("/priority-auctions/:auctionId", ...guard, ctrl.adminGetAuction);
router.post("/priority-auctions", ...guard, ctrl.adminCreateAuction);

module.exports = router;
