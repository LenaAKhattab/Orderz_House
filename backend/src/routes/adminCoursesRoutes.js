const express = require("express");
const { requireAuth, requireAnyRole, requirePermission } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const adminCoursesController = require("../controllers/adminCoursesController");
const {
  uploadCourseTestFile: uploadCourseTestFileMw,
  uploadCoursePromptFile: uploadCoursePromptFileMw,
  uploadCourseModelAnswerFile: uploadCourseModelAnswerFileMw,
} = require("../middleware/courseUploadMiddleware");
const {
  createCourseValidators,
  importLessonsValidators,
  updateCourseValidators,
  updateLessonsValidators,
  publishCourseValidators,
  archiveCourseValidators,
  assignCourseValidators,
  assignOneFreelancerValidators,
  listCoursesValidators,
  courseIdParam,
  courseFileStreamValidators,
} = require("../validators/coursesValidators");
const courseTextAdsController = require("../controllers/courseTextAdsController");
const { adBodyValidators, adIdParam } = require("../validators/courseTextAdsValidators");
const { adminWriteLimiter } = require("../middleware/orderWriteRateLimiters");

const router = express.Router();

// Scope guards to /courses routes only — avoid blocking other /api/admin/* routers mounted on the same prefix.
const coursesGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission("dashboard.admin.courses"),
];

router.get("/courses/freelancers", ...coursesGuard, adminCoursesController.listFreelancers);
router.get("/course-text-ads", ...coursesGuard, courseTextAdsController.listAds);
router.post(
  "/course-text-ads",
  ...coursesGuard,
  adminWriteLimiter,
  adBodyValidators,
  validateRequest,
  courseTextAdsController.createAd,
);
router.patch(
  "/course-text-ads/:id",
  ...coursesGuard,
  adminWriteLimiter,
  adIdParam,
  adBodyValidators,
  validateRequest,
  courseTextAdsController.updateAd,
);
router.delete(
  "/course-text-ads/:id",
  ...coursesGuard,
  adminWriteLimiter,
  adIdParam,
  validateRequest,
  courseTextAdsController.deleteAd,
);
router.get("/courses", ...coursesGuard, listCoursesValidators, validateRequest, adminCoursesController.listCourses);
router.post(
  "/courses",
  ...coursesGuard,
  adminWriteLimiter,
  createCourseValidators,
  validateRequest,
  adminCoursesController.createCourse,
);
router.get(
  "/courses/:id/files/:fileKind",
  ...coursesGuard,
  courseFileStreamValidators,
  validateRequest,
  adminCoursesController.streamCourseFile,
);
router.get("/courses/:id", ...coursesGuard, courseIdParam, validateRequest, adminCoursesController.getCourseById);
router.patch(
  "/courses/:id",
  ...coursesGuard,
  adminWriteLimiter,
  updateCourseValidators,
  validateRequest,
  adminCoursesController.updateCourse,
);
router.post(
  "/courses/:id/test-file",
  ...coursesGuard,
  adminWriteLimiter,
  courseIdParam,
  validateRequest,
  uploadCourseTestFileMw,
  adminCoursesController.uploadCourseTestFile,
);
router.post(
  "/courses/:id/prompt-file",
  ...coursesGuard,
  adminWriteLimiter,
  courseIdParam,
  validateRequest,
  uploadCoursePromptFileMw,
  adminCoursesController.uploadCoursePromptFile,
);
router.post(
  "/courses/:id/model-answer-file",
  ...coursesGuard,
  adminWriteLimiter,
  courseIdParam,
  validateRequest,
  uploadCourseModelAnswerFileMw,
  adminCoursesController.uploadCourseModelAnswerFile,
);
router.post(
  "/courses/:id/publish",
  ...coursesGuard,
  adminWriteLimiter,
  publishCourseValidators,
  validateRequest,
  adminCoursesController.publishCourse,
);
router.post(
  "/courses/:id/archive",
  ...coursesGuard,
  adminWriteLimiter,
  archiveCourseValidators,
  validateRequest,
  adminCoursesController.archiveCourse,
);
router.delete(
  "/courses/:id",
  ...coursesGuard,
  adminWriteLimiter,
  courseIdParam,
  validateRequest,
  adminCoursesController.deleteCourse,
);
router.post(
  "/courses/:id/import-lessons",
  ...coursesGuard,
  adminWriteLimiter,
  importLessonsValidators,
  validateRequest,
  adminCoursesController.importLessons,
);
router.patch(
  "/courses/:id/lessons",
  ...coursesGuard,
  adminWriteLimiter,
  updateLessonsValidators,
  validateRequest,
  adminCoursesController.updateLessons,
);
router.post(
  "/courses/:id/assign-one",
  ...coursesGuard,
  adminWriteLimiter,
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.assignOneFreelancer,
);
router.post(
  "/courses/:id/unassign-one",
  ...coursesGuard,
  adminWriteLimiter,
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.unassignOneFreelancer,
);
router.post(
  "/courses/:id/assign",
  ...coursesGuard,
  adminWriteLimiter,
  assignCourseValidators,
  validateRequest,
  adminCoursesController.assignFreelancers,
);

module.exports = router;
