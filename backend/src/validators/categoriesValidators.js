const { param } = require("express-validator");

const categoryIdParam = [param("categoryId").isInt({ min: 1 }).withMessage("Invalid category id.")];
const subcategoryIdParam = [param("subcategoryId").isInt({ min: 1 }).withMessage("Invalid subcategory id.")];
const categorySlugParam = [
  param("slug")
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage("Invalid category slug."),
];

module.exports = {
  categoryIdParam,
  subcategoryIdParam,
  categorySlugParam,
};

