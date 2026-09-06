const { body, param, query } = require("express-validator");

const articleIdParam = [
  param("id").isInt({ min: 1 }).withMessage("Invalid article id."),
];

const applicationIdParam = [
  param("applicationId").isInt({ min: 1 }).withMessage("Invalid application id."),
];

const submitArticleApplicationValidators = [
  ...articleIdParam,
  body("proposalMessage")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 5000 })
    .withMessage("proposalMessage must be at most 5000 characters."),
];

const submitFinalArticleManuscriptValidators = [
  ...applicationIdParam,
  body("title").isString().trim().isLength({ min: 3, max: 120 }).withMessage("title is required."),
  body("content")
    .isString()
    .isLength({ min: 50, max: 200000 })
    .withMessage("content is required."),
  body("termsAccepted")
    .custom((value) => value === true || value === "true" || value === 1 || value === "1")
    .withMessage("termsAccepted is required."),
];

const requestArticleRevisionValidators = [
  ...applicationIdParam,
  body("reviewerNotes")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 2000 })
    .withMessage("reviewerNotes must be at most 2000 characters."),
];

const editArticleApplicationValidators = [
  ...applicationIdParam,
  body("proposalMessage")
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 5000 })
    .withMessage("proposalMessage must be at most 5000 characters."),
];

const listApplicationsValidators = [
  query("limit").optional().isInt({ min: 1, max: 500 }),
  query("offset").optional().isInt({ min: 0 }),
];

module.exports = {
  articleIdParam,
  applicationIdParam,
  submitArticleApplicationValidators,
  editArticleApplicationValidators,
  submitFinalArticleManuscriptValidators,
  requestArticleRevisionValidators,
  listApplicationsValidators,
};
