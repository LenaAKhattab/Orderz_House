const { param, query } = require("express-validator");

const categoryIdParam = [param("categoryId").isInt({ min: 1 }).withMessage("Invalid category id.")];
const subcategoryIdParam = [param("subcategoryId").isInt({ min: 1 }).withMessage("Invalid subcategory id.")];
const categorySlugParam = [
  param("slug")
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("Invalid category slug."),
];

const publicSubSubcategoriesListValidators = [
  query("page").optional().isInt({ min: 1, max: 100000 }).withMessage("page must be >= 1."),
  query("limit").optional().isInt({ min: 1, max: 64 }).withMessage("limit must be 1..64."),
];

module.exports = {
  categoryIdParam,
  subcategoryIdParam,
  categorySlugParam,
  publicSubSubcategoriesListValidators,
};

