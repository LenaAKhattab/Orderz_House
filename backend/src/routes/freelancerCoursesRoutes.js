const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const freelancerCoursesController = require("../controllers/freelancerCoursesController");
const { uploadCourseAuditResponseFile, uploadCompletedExamFile } = require("../middleware/courseUploadMiddleware");
const {
  courseIdParam,
  courseFileStreamValidators,
  markLessonCompleteValidators,
  submitCourseCompletionValidators,
} = require("../validators/coursesValidators");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

router.get("/courses", freelancerCoursesController.listMyCourses);
router.get(
  "/courses/:id/files/:fileKind",
  courseFileStreamValidators,
  validateRequest,
  freelancerCoursesController.streamCourseFile,
);
router.get("/courses/:id", courseIdParam, validateRequest, freelancerCoursesController.getMyCourseDetails);
router.post(
  "/courses/:id/completed-exam-file",
  courseIdParam,
  validateRequest,
  uploadCompletedExamFile,
  freelancerCoursesController.uploadCompletedExamFile,
);
router.post(
  "/courses/:id/complete",
  courseIdParam,
  uploadCourseAuditResponseFile,
  submitCourseCompletionValidators,
  validateRequest,
  freelancerCoursesController.submitCourseCompletion,
);
router.post("/courses/:id/lessons/:lessonId/complete", markLessonCompleteValidators, validateRequest, freelancerCoursesController.markLessonComplete);

module.exports = router;
