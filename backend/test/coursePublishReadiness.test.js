const test = require("node:test");
const assert = require("node:assert/strict");
const { assessCoursePublishReadiness, isMeaningfulDescription } = require("../src/utils/coursePublishReadiness");

test("isMeaningfulDescription requires at least 10 trimmed characters", () => {
  assert.equal(isMeaningfulDescription("short"), false);
  assert.equal(isMeaningfulDescription("  ten chars!  "), true);
});

test("assessCoursePublishReadiness passes for complete course", () => {
  const result = assessCoursePublishReadiness(
    { title: "دورة الاختبار", description: "وصف كافٍ للدورة التدريبية هنا" },
    [{ title: "الدرس الأول", youtube_video_id: "abc12345", youtube_url: "https://youtu.be/abc12345", is_active: true }],
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("assessCoursePublishReadiness fails when description or lessons missing", () => {
  const result = assessCoursePublishReadiness({ title: "دورة", description: "قصير" }, []);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("description"));
  assert.ok(result.missing.includes("lessons"));
  assert.ok(result.missingLabels.includes("الوصف"));
  assert.ok(result.missingLabels.includes("الدروس"));
});

test("assessCoursePublishReadiness flags lessons without video", () => {
  const result = assessCoursePublishReadiness(
    { title: "دورة كاملة", description: "وصف مناسب للنشر في النظام" },
    [{ title: "درس", youtube_video_id: "", youtube_url: "", is_active: true }],
  );
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes("lessonVideos"));
});
