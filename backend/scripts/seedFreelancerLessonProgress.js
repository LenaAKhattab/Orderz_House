/**
 * Mark course lessons complete for a freelancer up to N lessons (by sort_order).
 * Usage: node scripts/seedFreelancerLessonProgress.js --email=user@example.com --courseId=4 --through=90
 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { pool } = require("../src/config/db");

function parseArgs() {
  const out = {};
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const email = String(args.email || "").trim().toLowerCase();
  const courseId = Number(args.courseId);
  const through = Number(args.through);
  if (!email || !Number.isInteger(courseId) || courseId < 1 || !Number.isInteger(through) || through < 1) {
    console.error("Usage: node scripts/seedFreelancerLessonProgress.js --email=... --courseId=... --through=90");
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const { rows: users } = await client.query(
      `SELECT id, email, first_name, family_name FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [email],
    );
    const user = users[0];
    if (!user) {
      console.error(`No user found for email: ${email}`);
      process.exit(1);
    }

    const { rows: assign } = await client.query(
      `SELECT 1 FROM course_assignments WHERE course_id = $1 AND freelancer_id = $2 LIMIT 1`,
      [courseId, user.id],
    );
    if (!assign.length) {
      console.error(`User ${email} (id=${user.id}) is not assigned to course ${courseId}.`);
      process.exit(1);
    }

    const { rows: lessons } = await client.query(
      `SELECT id, title, sort_order
       FROM course_lessons
       WHERE course_id = $1 AND is_active = TRUE
       ORDER BY sort_order ASC, id ASC
       LIMIT $2`,
      [courseId, through],
    );

    if (!lessons.length) {
      console.error(`No active lessons found for course ${courseId}.`);
      process.exit(1);
    }

    await client.query("BEGIN");
    let inserted = 0;
    for (const lesson of lessons) {
      const res = await client.query(
        `INSERT INTO course_lesson_progress (course_id, lesson_id, freelancer_id, completed_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (freelancer_id, course_id, lesson_id) DO NOTHING`,
        [courseId, lesson.id, user.id],
      );
      if (res.rowCount > 0) inserted += 1;
    }

    const { rows: courseRows } = await client.query(`SELECT is_testing_enabled FROM courses WHERE id = $1`, [courseId]);
    const testingOn = Boolean(courseRows[0]?.is_testing_enabled);
    if (!testingOn) {
      const { rows: counts } = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM course_lessons WHERE course_id = $1 AND is_active = TRUE) AS total,
           (SELECT COUNT(*)::int FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2) AS done`,
        [courseId, user.id],
      );
      const total = Number(counts[0]?.total || 0);
      const done = Number(counts[0]?.done || 0);
      if (total > 0 && done >= total) {
        await client.query(
          `UPDATE course_assignments
           SET completed_at = COALESCE(completed_at, NOW())
           WHERE course_id = $1 AND freelancer_id = $2 AND completed_at IS NULL`,
          [courseId, user.id],
        );
      }
    }

    await client.query("COMMIT");

    const { rows: after } = await client.query(
      `SELECT COUNT(*)::int AS done FROM course_lesson_progress WHERE course_id = $1 AND freelancer_id = $2`,
      [courseId, user.id],
    );

    console.log(
      JSON.stringify(
        {
          email: user.email,
          userId: String(user.id),
          courseId: String(courseId),
          lessonsMarkedThisRun: inserted,
          lessonsTargeted: lessons.length,
          totalCompletedNow: after[0]?.done,
          testingEnabled: testingOn,
          note: testingOn
            ? "Course not auto-completed (audit step required)."
            : "Course may auto-complete when all lessons are done.",
        },
        null,
        2,
      ),
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
