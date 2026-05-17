/**
 * Create or refresh a training course from a YouTube playlist (all videos as lessons).
 *
 * Usage (from backend/):
 *   node scripts/seedYoutubePlaylistCourse.js
 *   node scripts/seedYoutubePlaylistCourse.js --url="https://www.youtube.com/playlist?list=..."
 *   node scripts/seedYoutubePlaylistCourse.js --append
 *
 * Default playlist: دورة 2024 - كتابة المحتوى باللغة الانجليزية
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { pool } = require("../src/config/db");
const { importYoutubeSource } = require("../src/utils/youtubeImport");

const DEFAULT_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLmZeVyIgORSsC_YpijcoIReX1n4A_rIQ5";

const DEFAULT_TITLE = "دورة 2024 - كتابة المحتوى باللغة الانجليزية";
const DEFAULT_DESCRIPTION =
  "دورة تدريبية مستوردة من قائمة تشغيل يوتيوب — كتابة المحتوى باللغة الإنجليزية (جميع الدروس).";

function parseArgs(argv) {
  const out = { url: DEFAULT_PLAYLIST_URL, title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION, replace: true };
  for (const raw of argv.slice(2)) {
    if (raw === "--append") {
      out.replace = false;
      continue;
    }
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (!m) continue;
    const k = m[1];
    const v = m[2];
    if (k === "url") out.url = v.trim();
    if (k === "title") out.title = v.trim();
    if (k === "description") out.description = v.trim();
  }
  return out;
}

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

async function findCourseByPlaylistUrl(client, playlistUrl) {
  const { rows } = await client.query(
    `SELECT id, title FROM courses WHERE youtube_source_url = $1 ORDER BY id DESC LIMIT 1`,
    [playlistUrl],
  );
  return rows[0] || null;
}

async function insertLessons(client, courseId, lessons, { replace }) {
  if (replace) {
    await client.query(`DELETE FROM course_lessons WHERE course_id = $1`, [courseId]);
  }
  const { rows: countRows } = await client.query(
    `SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM course_lessons WHERE course_id = $1`,
    [courseId],
  );
  let sortBase = replace ? 0 : Number(countRows[0]?.max_order || 0);
  let inserted = 0;
  let skipped = 0;

  for (const lesson of lessons) {
    sortBase += 1;
    const res = await client.query(
      `INSERT INTO course_lessons (course_id, title, youtube_video_id, youtube_url, sort_order, duration_seconds, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW(),NOW())
       ON CONFLICT (course_id, youtube_video_id) DO NOTHING
       RETURNING id`,
      [
        courseId,
        lesson.title,
        lesson.youtubeVideoId,
        lesson.youtubeUrl,
        replace ? Number(lesson.sortOrder) : sortBase,
        lesson.durationSeconds,
      ],
    );
    if (res.rowCount > 0) inserted += 1;
    else skipped += 1;
  }

  return { inserted, skipped };
}

async function main() {
  const args = parseArgs(process.argv);
  const playlistUrl = String(args.url || "").trim();
  if (!playlistUrl) {
    console.error("Missing playlist URL.");
    process.exit(1);
  }

  console.log("Fetching playlist from YouTube…");
  const imported = await importYoutubeSource(playlistUrl);
  if (!imported.lessons?.length) {
    console.error("No lessons found in playlist.");
    process.exit(1);
  }
  console.log(`Found ${imported.lessons.length} videos.`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const creatorId = await resolveCreatorUserId(client);
    let course = await findCourseByPlaylistUrl(client, playlistUrl);

    if (course) {
      console.log(`Updating existing course #${course.id}: ${course.title}`);
      await client.query(
        `UPDATE courses
         SET title = $2, description = $3, youtube_source_url = $4, is_active = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [Number(course.id), args.title, args.description, playlistUrl],
      );
    } else {
      const { rows } = await client.query(
        `INSERT INTO courses (title, description, cover_image, youtube_source_url, is_active, is_testing_enabled, test_file_url, created_by, created_at, updated_at)
         VALUES ($1,$2,NULL,$3,TRUE,FALSE,NULL,$4,NOW(),NOW())
         RETURNING id, title`,
        [args.title, args.description, playlistUrl, creatorId],
      );
      course = rows[0];
      console.log(`Created course #${course.id}: ${course.title}`);
    }

    const { inserted, skipped } = await insertLessons(client, Number(course.id), imported.lessons, {
      replace: args.replace,
    });

    await client.query("COMMIT");

    const { rows: totalRows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM course_lessons WHERE course_id = $1 AND is_active = TRUE`,
      [Number(course.id)],
    );

    console.log("\nDone.");
    console.log(`  Course ID: ${course.id}`);
    console.log(`  Title: ${args.title}`);
    console.log(`  Playlist: ${playlistUrl}`);
    console.log(`  Lessons in DB: ${totalRows[0]?.n ?? 0}`);
    console.log(`  Newly inserted: ${inserted}${skipped ? `, skipped (duplicate): ${skipped}` : ""}`);
    if (totalRows[0]?.n < imported.lessons.length) {
      console.warn(`\nWarning: DB has ${totalRows[0]?.n} lessons but playlist has ${imported.lessons.length}. Re-run without --append.`);
    }
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err?.message || err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
