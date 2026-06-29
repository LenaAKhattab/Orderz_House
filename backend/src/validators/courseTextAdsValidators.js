const { body, param, query } = require("express-validator");

const adBodyValidators = [
  body("enabled").optional().isBoolean().withMessage("enabled must be a boolean"),
  body("textAr").optional().isString().withMessage("textAr must be a string"),
  body("textEn").optional().isString().withMessage("textEn must be a string"),
  body("url").optional({ nullable: true }).isString().withMessage("url must be a string"),
  body("placement")
    .optional()
    .isIn(["courses_list", "all_course_details", "both", "specific_course"])
    .withMessage("invalid placement"),
  body("courseId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("invalid courseId"),
  body("direction").optional().isIn(["horizontal", "vertical"]).withMessage("invalid direction"),
  body("speed").optional().isIn(["slow", "normal", "fast"]).withMessage("invalid speed"),
  body("textColor").optional().isIn(["blue", "black", "red"]).withMessage("invalid textColor"),
];

const adIdParam = [param("id").isInt({ min: 1 }).withMessage("invalid ad id")];

const freelancerReadValidators = [
  query("context").isIn(["courses_list", "course_details"]).withMessage("invalid context"),
  query("courseId").optional().isInt({ min: 1 }).withMessage("invalid courseId"),
];

module.exports = {
  adBodyValidators,
  adIdParam,
  freelancerReadValidators,
};
