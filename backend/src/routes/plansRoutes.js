const express = require("express");
const plansController = require("../controllers/plansController");

const router = express.Router();

// Public: show plans (visible + active). Assignment is still super_admin-only.
router.get("/plans", plansController.listPublicPlans);

module.exports = router;

