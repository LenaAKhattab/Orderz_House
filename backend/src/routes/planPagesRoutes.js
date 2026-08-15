const express = require("express");
const planPagesController = require("../controllers/planPagesController");

const router = express.Router();

router.get("/plan-pages/default", planPagesController.getPublicDefaultPlanPage);
router.get("/plan-pages/special-catalog", planPagesController.getPublicSpecialPageCatalog);
router.get("/plan-pages/:slug", planPagesController.getPublicPlanPageBySlug);

module.exports = router;
