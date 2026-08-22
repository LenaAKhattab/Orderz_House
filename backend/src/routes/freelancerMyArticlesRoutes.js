const express = require("express");
const { requireAuth, requireFreelancer } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { query } = require("express-validator");
const controller = require("../controllers/freelancerMyArticlesController");

const router = express.Router();
const guard = [requireAuth, requireFreelancer];

const listMyArticlesValidators = [
  query("status").optional().isString().trim().isLength({ max: 64 }),
  query("limit").optional().isInt({ min: 1, max: 200 }),
  query("offset").optional().isInt({ min: 0 }),
];

router.get(
  "/my-articles",
  ...guard,
  listMyArticlesValidators,
  validateRequest,
  controller.listMyArticles,
);

module.exports = router;
