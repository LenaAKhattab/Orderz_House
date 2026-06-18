const express = require("express");
const { listCategories, listCategoryTree, getCategoryImage } = require("../controllers/categoriesController");
const { listSubcategoriesByCategory } = require("../controllers/subcategoriesController");
const { listSubSubcategoriesByCategory, listSubSubcategoriesBySubcategory } = require("../controllers/subSubcategoriesController");
const validateRequest = require("../middleware/validateRequest");
const { categoryIdParam, subcategoryIdParam, categorySlugParam } = require("../validators/categoriesValidators");

const router = express.Router();

// Public: categories shown on landing page
router.get("/categories/tree", listCategoryTree);
router.get("/categories", listCategories);
router.get("/categories/images/:slug", categorySlugParam, validateRequest, getCategoryImage);
router.get("/categories/:categoryId/subcategories", categoryIdParam, validateRequest, listSubcategoriesByCategory);
router.get(
  "/categories/:categoryId/sub-subcategories",
  categoryIdParam,
  validateRequest,
  listSubSubcategoriesByCategory,
);
router.get(
  "/subcategories/:subcategoryId/sub-subcategories",
  subcategoryIdParam,
  validateRequest,
  listSubSubcategoriesBySubcategory,
);

module.exports = router;

