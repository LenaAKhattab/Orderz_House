const { body, param, query } = require("express-validator");

const courseIdParam = [param("id").isInt({ min: 1 }).withMessage("معرف الدورة غير صالح.")];
const lessonIdParam = [param("lessonId").isInt({ min: 1 }).withMessage("معرف الدرس غير صالح.")];

const createCourseValidators = [
  body("title").isString().trim().isLength({ min: 2, max: 255 }).withMessage("عنوان الدورة مطلوب."),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("coverImage").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("youtubeSourceUrl").isString().trim().isLength({ min: 10, max: 2000 }).withMessage("رابط يوتيوب مطلوب."),
  body("isActive").optional().isBoolean(),
  body("isTestingEnabled").optional().isBoolean(),
  body("testFileUrl").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
];

const importLessonsValidators = [
  ...courseIdParam,
  body("youtubeSourceUrl").isString().trim().isLength({ min: 10, max: 2000 }).withMessage("رابط يوتيوب مطلوب."),
  body("replaceExisting").optional().isBoolean(),
];

const updateCourseValidators = [
  ...courseIdParam,
  body("title").optional().isString().trim().isLength({ min: 2, max: 255 }),
  body("description").optional({ nullable: true }).isString().trim().isLength({ max: 5000 }),
  body("coverImage").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body("youtubeSourceUrl").optional().isString().trim().isLength({ min: 10, max: 2000 }),
  body("isActive").optional().isBoolean(),
  body("isTestingEnabled").optional().isBoolean(),
  body("testFileUrl").optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
];

const updateLessonsValidators = [
  ...courseIdParam,
  body("lessons").isArray({ min: 1 }).withMessage("قائمة الدروس مطلوبة."),
  body("lessons.*.id").isInt({ min: 1 }),
  body("lessons.*.title").optional().isString().trim().isLength({ min: 1, max: 255 }),
  body("lessons.*.sortOrder").optional().isInt({ min: 1 }),
  body("lessons.*.isActive").optional().isBoolean(),
];

const assignCourseValidators = [
  ...courseIdParam,
  body("assignAll").optional().isBoolean(),
  body("freelancerIds").optional().isArray(),
  body("freelancerIds.*").optional().isInt({ min: 1 }),
];

const assignOneFreelancerValidators = [
  ...courseIdParam,
  body("freelancerUserId").isInt({ min: 1 }).withMessage("معرف المستقل مطلوب."),
];

const listCoursesValidators = [
  query("q").optional().isString().trim().isLength({ max: 200 }),
  query("isActive").optional().isBoolean(),
];

const markLessonCompleteValidators = [...courseIdParam, ...lessonIdParam];

const submitCourseCompletionValidators = [
  ...courseIdParam,
  body("auditConfirmed").optional().isBoolean(),
  body("auditNotes").optional({ nullable: true }).isString().trim().isLength({ max: 8000 }),
];

module.exports = {
  courseIdParam,
  lessonIdParam,
  createCourseValidators,
  importLessonsValidators,
  updateCourseValidators,
  updateLessonsValidators,
  assignCourseValidators,
  assignOneFreelancerValidators,
  listCoursesValidators,
  markLessonCompleteValidators,
  submitCourseCompletionValidators,
};
