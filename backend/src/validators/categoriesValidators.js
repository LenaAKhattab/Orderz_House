const { param } = require("express-validator");

const categoryIdParam = [param("categoryId").isInt({ min: 1 }).withMessage("Invalid category id.")];
const subcategoryIdParam = [param("subcategoryId").isInt({ min: 1 }).withMessage("Invalid subcategory id.")];

module.exports = {
  categoryIdParam,
  subcategoryIdParam,
};

