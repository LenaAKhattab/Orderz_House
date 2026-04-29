const coursesService = require("../services/coursesService");

async function listMyCourses(req, res, next) {
  try {
    const courses = await coursesService.listAssignedCoursesForFreelancer({
      freelancerUserId: req.auth.userId,
    });
    return res.status(200).json({ success: true, data: { courses } });
  } catch (err) {
    return next(err);
  }
}

async function getMyCourseDetails(req, res, next) {
  try {
    const out = await coursesService.getCourseDetailsForFreelancer({
      freelancerUserId: req.auth.userId,
      courseId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function markLessonComplete(req, res, next) {
  try {
    const progress = await coursesService.markLessonComplete({
      freelancerUserId: req.auth.userId,
      courseId: req.params.id,
      lessonId: req.params.lessonId,
    });
    return res.status(200).json({ success: true, data: { progress } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listMyCourses,
  getMyCourseDetails,
  markLessonComplete,
};
