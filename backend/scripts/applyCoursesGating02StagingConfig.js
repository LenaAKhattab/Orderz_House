/**
 * Courses-Gating-02 — Staging-only: set article course to starter tier.
 * Usage: node scripts/applyCoursesGating02StagingConfig.js
 */
const { Pool } = require("pg");
const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  assertDatabaseWritable,
  assertStagingWriteProbe,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

const ARTICLE_TITLE_PATTERN = "%كيفية إنشاء مقال%";

async function main() {
  loadStagingQaEnv();
  const target = assertStagingQaTarget();
  printStagingBanner(target);
  await assertDatabaseWritable();
  await assertStagingWriteProbe();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const client = await pool.connect();
  try {
    const before = await client.query(
      `SELECT id, title, required_tier_code
         FROM courses
        WHERE title ILIKE $1
        ORDER BY id
        LIMIT 1`,
      [ARTICLE_TITLE_PATTERN],
    );
    const course = before.rows[0];
    if (!course) {
      throw new Error(`Article course not found (title ILIKE ${ARTICLE_TITLE_PATTERN})`);
    }

    const { rows: updated } = await client.query(
      `UPDATE courses
          SET required_tier_code = 'starter',
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, title, required_tier_code`,
      [course.id],
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          courseId: course.id,
          title: course.title,
          requiredTierCodeBefore: course.required_tier_code,
          requiredTierCodeAfter: updated[0]?.required_tier_code,
        },
        null,
        2,
      ),
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("CONFIG_ERROR:", err.message);
  process.exit(1);
});
