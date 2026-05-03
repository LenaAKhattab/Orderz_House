const express = require("express");
const { requireAuth, requireAnyRole } = require("../middleware/rbacMiddleware");
const validateRequest = require("../middleware/validateRequest");
const adminCoursesController = require("../controllers/adminCoursesController");
const {
  createCourseValidators,
  importLessonsValidators,
  updateCourseValidators,
  updateLessonsValidators,
  assignCourseValidators,
  assignOneFreelancerValidators,
  listCoursesValidators,
  courseIdParam,
} = require("../validators/coursesValidators");

const router = express.Router();

router.use(requireAuth, requireAnyRole(["admin", "super_admin"]));

router.get("/courses/freelancers", adminCoursesController.listFreelancers);
router.get("/courses", listCoursesValidators, validateRequest, adminCoursesController.listCourses);
router.post("/courses", createCourseValidators, validateRequest, adminCoursesController.createCourse);
router.get("/courses/:id", courseIdParam, validateRequest, adminCoursesController.getCourseById);
router.patch("/courses/:id", updateCourseValidators, validateRequest, adminCoursesController.updateCourse);
router.delete("/courses/:id", courseIdParam, validateRequest, adminCoursesController.deleteCourse);
router.post("/courses/:id/import-lessons", importLessonsValidators, validateRequest, adminCoursesController.importLessons);
router.patch("/courses/:id/lessons", updateLessonsValidators, validateRequest, adminCoursesController.updateLessons);
router.post(
  "/courses/:id/assign-one",
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.assignOneFreelancer,
);
router.post(
  "/courses/:id/unassign-one",
  assignOneFreelancerValidators,
  validateRequest,
  adminCoursesController.unassignOneFreelancer,
);
router.post("/courses/:id/assign", assignCourseValidators, validateRequest, adminCoursesController.assignFreelancers);

module.exports = router;
