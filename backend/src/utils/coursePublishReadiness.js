const MISSING_LABELS = {
  title: "العنوان",
  description: "الوصف",
  lessons: "الدروس",
  lessonTitles: "عناوين الدروس",
  lessonVideos: "فيديوهات الدروس",
};

function isMeaningfulDescription(text) {
  return String(text || "").trim().length >= 10;
}

function hasValidYoutubeLesson(lesson) {
  const videoId = String(lesson.youtube_video_id || lesson.youtubeVideoId || "").trim();
  const url = String(lesson.youtube_url || lesson.youtubeUrl || "").trim();
  return videoId.length >= 6 || url.length >= 10;
}

/**
 * Assess whether a course can be published (is_active = true for freelancers).
 * @param {{ title?: string, description?: string|null, youtube_source_url?: string }} course
 * @param {Array<{ title?: string, youtube_video_id?: string, youtube_url?: string, is_active?: boolean }>} lessons
 */
function assessCoursePublishReadiness(course, lessons) {
  const missing = [];
  const activeLessons = (Array.isArray(lessons) ? lessons : []).filter((l) => l.is_active !== false);

  const title = String(course?.title || "").trim();
  if (title.length < 2) missing.push("title");

  if (!isMeaningfulDescription(course?.description)) missing.push("description");

  if (activeLessons.length === 0) missing.push("lessons");

  const missingTitles = activeLessons.some((l) => String(l.title || "").trim().length < 1);
  if (activeLessons.length > 0 && missingTitles) missing.push("lessonTitles");

  const missingVideos = activeLessons.some((l) => !hasValidYoutubeLesson(l));
  if (activeLessons.length > 0 && missingVideos) missing.push("lessonVideos");

  return {
    ok: missing.length === 0,
    missing,
    missingLabels: missing.map((k) => MISSING_LABELS[k] || k),
  };
}

module.exports = {
  MISSING_LABELS,
  isMeaningfulDescription,
  assessCoursePublishReadiness,
};
