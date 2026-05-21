const { body, param } = require("express-validator");

const orderIdParam = [param("id").isInt({ min: 1 }).withMessage("معرّف الطلب غير صالح.")];

const submitClientReviewValidators = [
  ...orderIdParam,
  body("rating").isInt({ min: 1, max: 5 }).withMessage("التقييم يجب أن يكون بين 1 و 5."),
  body("reviewText").optional({ nullable: true }).isString().isLength({ max: 2000 }),
  body("professionalismRating").optional({ nullable: true }).isInt({ min: 1, max: 5 }),
  body("communicationRating").optional({ nullable: true }).isInt({ min: 1, max: 5 }),
  body("deliveryRating").optional({ nullable: true }).isInt({ min: 1, max: 5 }),
  body("wouldRecommend").optional({ nullable: true }).isBoolean(),
];

const updateClientReviewValidators = submitClientReviewValidators;

module.exports = {
  submitClientReviewValidators,
  updateClientReviewValidators,
};
