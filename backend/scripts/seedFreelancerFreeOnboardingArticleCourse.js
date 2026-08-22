/**
 * Seed the free onboarding single-video course for Starter/Trial freelancers.
 *
 * Usage (from backend/):
 *   node scripts/seedFreelancerFreeOnboardingArticleCourse.js
 *
 * Safe to re-run — upserts by course title.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { guardQaOrSeed } = require("./lib/assertScriptDatabaseAllowed");
guardQaOrSeed(path.basename(__filename));

const { pool } = require("../src/config/db");
const { importYoutubeSource } = require("../src/utils/youtubeImport");
const { FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE } = require("../src/constants/freelancerCoursesAccess");

async function resolveCreatorUserId(client) {
  const { rows } = await client.query(
    `SELECT id FROM users
     WHERE is_active = TRUE AND role IN ('admin', 'super_admin')
     ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END, id ASC
     LIMIT 1`,
  );
  if (!rows[0]?.id) {
    throw new Error("No admin user found. Create one with: npm run db:create-admin");
  }
  return Number(rows[0].id);
}

async function main() {
  const spec = FREELANCER_FREE_ONBOARDING_ARTICLE_COURSE;
  const imported = await importYoutubeSource(spec.youtubeUrl);
  if (!imported.lessons?.length) {
    throw new Error("Could not import YouTube video for free onboarding course.");
  }
  const lesson = imported.lessons[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const creatorId = await resolveCreatorUserId(client);

    const { rows: existing } = await client.query(
      `SELECT id FROM courses WHERE title = $1 ORDER BY id DESC LIMIT 1`,
      [spec.title],
    );

    let courseId;
    if (existing[0]?.id) {
      courseId = Number(existing[0].id);
      await client.query(
        `UPDATE courses
            SET description = $2,
                youtube_source_url = $3,
                is_active = TRUE,
                is_visible_to_all_freelancers = TRUE,
                requires_paid_membership = FALSE,
                updated_at = NOW()
          WHERE id = $1`,
        [courseId, spec.description, spec.youtubeUrl],
      );
    } else {
      const ins = await client.query(
        `INSERT INTO courses (
           title, description, youtube_source_url, is_active,
           is_visible_to_all_freelancers, requires_paid_membership,
           is_testing_enabled, created_by, created_at, updated_at
         ) VALUES ($1,$2,$3,TRUE,TRUE,FALSE,FALSE,$4,NOW(),NOW())
         RETURNING id`,
        [spec.title, spec.description, spec.youtubeUrl, creatorId],
      );
      courseId = Number(ins.rows[0].id);
    }

    await client.query(`DELETE FROM course_lessons WHERE course_id = $1`, [courseId]);
    await client.query(
      `INSERT INTO course_lessons (
         course_id, title, youtube_video_id, youtube_url, sort_order,
         duration_seconds, is_active, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,1,$5,TRUE,NOW(),NOW())`,
      [courseId, spec.lessonTitle, lesson.youtubeVideoId, lesson.youtubeUrl, lesson.durationSeconds],
    );

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        {
          ok: true,
          courseId,
          title: spec.title,
          lessonVideoId: lesson.youtubeVideoId,
          requiresPaidMembership: false,
          isVisibleToAllFreelancers: true,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
