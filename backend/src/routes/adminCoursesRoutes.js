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

const router = express.Router();

// Scope guards to /courses routes only — avoid blocking other /api/admin/* routers mounted on the same prefix.
const coursesGuard = [
  requireAuth,
  requireAnyRole(["admin", "super_admin"]),
  requirePermission("dashboard.admin.courses"),
];

router.get("/courses/freelancers", ...coursesGuard, adminCoursesController.listFreelancers);
router.get("/course-text-ads", ...coursesGuard, courseTextAdsController.listAds);
router.post("/course-text-ads", ...coursesGuard, adBodyValidators, validateRequest, courseTextAdsController.createAd);
router.patch(
  "/course-text-ads/:id",
  ...coursesGuard,
  adIdParam,
  adBodyValidators,
  validateRequest,
  courseTextAdsController.updateAd,
);
router.delete(
  "/course-text-ads/:id",
  ...coursesGuard,
  adIdParam,
  validateRequest,
  courseTextAdsController.deleteAd,
);
router.get("/courses", ...coursesGuard, listCoursesValidators, validateRequest, adminCoursesController.listCourses);
router.post("/courses", ...coursesGuard, createCourseValidators, validateRequest, adminCoursesController.createCourse);
router.get(
  "/courses/:id/files/:fileKind",
  ...coursesGuard,
  courseFileStreamValidators,
  validateRequest,
  adminCoursesController.streamCourseFile,
);
router.get("/courses/:id", ...coursesGuard, courseIdParam, validateRequest, adminCoursesController.getCourseById);
router.patch("/courses/:id", ...coursesGuard, updateCourseValidators, validateRequest, adminCoursesController.updateCourse);
router.post(
  "/courses/:id/test-file",
  ...coursesGuard,
  courseIdParam,
  validateRequest,
  uploadCourseTestFileMw,
  adminCoursesController.uploadCourseTestFile,
);
router.post(
  "/courses/:id/prompt-file",
  ...coursesGuard,
  courseIdParam,
  validateRequest,
  uploadCoursePromptFileMw,
  adminCoursesController.uploadCoursePromptFile,
);
router.post(
  "/courses/:id/model-answer-file",
  ...coursesGuard,
  courseIdParam,
  validateRequest,
  uploadCourseModelAnswerFileMw,
  adminCoursesController.uploadCourseModelAnswerFile,
);
router.post("/courses/:id/publish", ...coursesGuard, publishCourseValidators, validateRequest, adminCoursesController.publishCourse);
router.post("/courses/:id/archive", ...coursesGuard, archiveCourseValidators, validateRequest, adminCoursesController.archiveCourse);
router.delete("/courses/:id", ...coursesGuard, courseIdParam, validateRequest, adminCoursesController.deleteCourse);
router.post("/courses/:id/import-lessons", ...coursesGuard, importLessonsValidators, validateRequest, adminCoursesController.importLessons);
router.patch("/courses/:id/lessons", ...coursesGuard, updateLessonsValidators, validateRequest, adminCoursesController.updateLessons);
router.post(
  "/courses/:id/assign-one",
  ...coursesGuard,
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.assignOneFreelancer,
);
router.post(
  "/courses/:id/unassign-one",
  ...coursesGuard,
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.unassignOneFreelancer,
);
router.post("/courses/:id/assign", ...coursesGuard, assignCourseValidators, validateRequest, adminCoursesController.assignFreelancers);

module.exports = router;
