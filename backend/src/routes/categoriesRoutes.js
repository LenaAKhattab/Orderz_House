const express = require("express");
const { listCategories } = require("../controllers/categoriesController");

const router = express.Router();

// Public: categories shown on landing page
router.get("/categories", listCategories);

module.exports = router;

