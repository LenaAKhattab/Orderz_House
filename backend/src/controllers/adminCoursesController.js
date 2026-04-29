const coursesService = require("../services/coursesService");

async function listCourses(req, res, next) {
  try {
    const courses = await coursesService.listCoursesForAdmin({
      actorUserId: req.auth.userId,
      q: req.query.q,
      isActive: req.query.isActive,
    });
    return res.status(200).json({ success: true, data: { courses } });
  } catch (err) {
    return next(err);
  }
}

async function createCourse(req, res, next) {
  try {
    const out = await coursesService.createCourse({
      actorUserId: req.auth.userId,
      payload: req.body,
    });
    return res.status(201).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function getCourseById(req, res, next) {
  try {
    const out = await coursesService.getCourseDetailsForAdmin({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
    });
    if (!out) return res.status(404).json({ success: false, message: "الدورة غير موجودة." });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function updateCourse(req, res, next) {
  try {
    const out = await coursesService.updateCourse({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      patch: req.body,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function importLessons(req, res, next) {
  try {
    const out = await coursesService.importCourseLessons({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      youtubeSourceUrl: req.body.youtubeSourceUrl,
      replaceExisting: req.body.replaceExisting,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function updateLessons(req, res, next) {
  try {
    const out = await coursesService.updateCourseLessons({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      lessons: req.body.lessons,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function assignFreelancers(req, res, next) {
  try {
    const out = await coursesService.assignCourseFreelancers({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      freelancerIds: req.body.freelancerIds || [],
      assignAll: req.body.assignAll,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function listFreelancers(req, res, next) {
  try {
    const freelancers = await coursesService.listFreelancerIds({
      query: req.query.q,
      limit: req.query.limit,
    });
    return res.status(200).json({ success: true, data: { freelancers } });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCourses,
  createCourse,
  getCourseById,
  updateCourse,
  importLessons,
  updateLessons,
  assignFreelancers,
  listFreelancers,
};
