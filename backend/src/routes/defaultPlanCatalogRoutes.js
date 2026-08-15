const express = require("express");
const defaultPlanCatalogController = require("../controllers/defaultPlanCatalogController");

const router = express.Router();

/** Public/read-safe: which existing catalog /plans and freelancer plans should display. */
router.get("/default-plan-catalog", defaultPlanCatalogController.getPublic);

module.exports = router;
