const express = require("express");
const marketplaceMembershipPlansController = require("../controllers/marketplaceMembershipPlansController");

const router = express.Router();

/** Public catalog for future /plans cutover — Phase 1: independent read API only. */
router.get(
  "/marketplace-membership-plans",
  marketplaceMembershipPlansController.listPublic,
);

module.exports = router;
