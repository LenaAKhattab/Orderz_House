const coursesService = require("../services/coursesService");
const courseFileDeliveryService = require("../services/courseFileDeliveryService");

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

function parseQuestionMarksFromRequest(body) {
  const raw = body?.questionMarks;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

async function submitCourseCompletion(req, res, next) {
  try {
    const data = await coursesService.submitCourseCompletion({
      freelancerUserId: req.auth.userId,
      courseId: req.params.id,
      auditNotes: req.body?.auditNotes,
      auditResponseText: req.body?.auditResponseText,
      auditResponseFileUrl: req.body?.auditResponseFileUrl,
      auditResponseFile: req.file || null,
      questionMarks: parseQuestionMarksFromRequest(req.body),
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function uploadCompletedExamFile(req, res, next) {
  try {
    const data = await coursesService.uploadCompletedExamFile({
      freelancerUserId: req.auth.userId,
      courseId: req.params.id,
      file: req.file,
    });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

async function streamCourseFile(req, res, next) {
  try {
    const download = req.query.download === "1" || req.query.download === "true";
    await courseFileDeliveryService.streamCourseFileForFreelancer({
      freelancerUserId: req.auth.userId,
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
  listMyCourses,
  getMyCourseDetails,
  markLessonComplete,
  uploadCompletedExamFile,
  submitCourseCompletion,
  streamCourseFile,
};
