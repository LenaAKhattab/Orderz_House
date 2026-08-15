const { body } = require("express-validator");
const { PLAN_CATALOG_VALUES } = require("../constants/planCatalogs");

const updateDefaultPlanCatalogValidators = [
  body("catalog")
    .exists()
    .withMessage("catalog is required.")
    .bail()
    .isString()
    .trim()
    .isIn(PLAN_CATALOG_VALUES)
    .withMessage("قسم الباقات المحدد غير موجود."),
];

module.exports = {
  updateDefaultPlanCatalogValidators,
};
