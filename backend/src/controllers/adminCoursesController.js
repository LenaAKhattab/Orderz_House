const coursesService = require("../services/coursesService");
const courseFileDeliveryService = require("../services/courseFileDeliveryService");

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
    const assignAll = req.body.assignAll === true || req.body.assignAll === 1;
    const out = await coursesService.assignCourseFreelancers({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      freelancerIds: Array.isArray(req.body.freelancerIds) ? req.body.freelancerIds : [],
      assignAll,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function assignOneFreelancer(req, res, next) {
  try {
    const out = await coursesService.addCourseFreelancer({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      freelancerUserId: req.body.freelancerUserId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function unassignOneFreelancer(req, res, next) {
  try {
    const out = await coursesService.removeCourseFreelancer({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      freelancerUserId: req.body.freelancerUserId,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function publishCourse(req, res, next) {
  try {
    const out = await coursesService.publishCourse({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    if (err.code === "COURSE_PUBLISH_INCOMPLETE") {
      return res.status(400).json({
        success: false,
        message: err.message,
        missing: err.missing || [],
        missingLabels: err.missingLabels || [],
      });
    }
    return next(err);
  }
}

async function archiveCourse(req, res, next) {
  try {
    const out = await coursesService.archiveCourse({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function deleteCourse(req, res, next) {
  try {
    const out = await coursesService.deleteCourse({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
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

async function uploadCourseTestFile(req, res, next) {
  try {
    const out = await coursesService.uploadCourseTestFile({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      file: req.file,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function uploadCoursePromptFile(req, res, next) {
  try {
    const out = await coursesService.uploadCoursePromptFile({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      file: req.file,
    });
    return res.status(200).json({ success: true, data: out });
  } catch (err) {
    return next(err);
  }
}

async function streamCourseFile(req, res, next) {
  try {
    const download = req.query.download === "1" || req.query.download === "true";
    await courseFileDeliveryService.streamCourseFileForAdmin({
      actorUserId: req.auth.userId,
      courseId: req.params.id,
      fileKind: req.params.fileKind,
      download,
      res,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCourses,
  createCourse,
  getCourseById,
  updateCourse,
  publishCourse,
  archiveCourse,
  importLessons,
  updateLessons,
  assignFreelancers,
  assignOneFreelancer,
  unassignOneFreelancer,
  deleteCourse,
  listFreelancers,
  uploadCourseTestFile,
  uploadCoursePromptFile,
  streamCourseFile,
};
