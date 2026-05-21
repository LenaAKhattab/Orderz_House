const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const freelancerDashboardController = require("../controllers/freelancerDashboardController");
const freelancerReviewsController = require("../controllers/freelancerReviewsController");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

router.get("/dashboard-summary", freelancerDashboardController.getDashboardSummary);

router.get("/reviews", freelancerReviewsController.listMyFreelancerReviews);
router.get("/reviews/summary", freelancerReviewsController.getMyFreelancerReviewsSummary);

module.exports = router;
