const express = require("express");
const { requireAuth, requireRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const freelancerCoursesController = require("../controllers/freelancerCoursesController");
const { courseIdParam, markLessonCompleteValidators } = require("../validators/coursesValidators");

const router = express.Router();

router.use(requireAuth, requireRole("freelancer"));

router.get("/courses", freelancerCoursesController.listMyCourses);
router.get("/courses/:id", courseIdParam, validateRequest, freelancerCoursesController.getMyCourseDetails);
router.post("/courses/:id/lessons/:lessonId/complete", markLessonCompleteValidators, validateRequest, freelancerCoursesController.markLessonComplete);

module.exports = router;
