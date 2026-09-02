/**
 * Courses-Gating-02 — read-only Staging/local course audit.
 * Usage: node scripts/auditCoursesGating02.js
 */
const { Pool } = require("pg");
const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

async function main() {
  loadStagingQaEnv();
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 20000,
    statement_timeout: 25000,
  });

  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");

    const mig184 = await client.query(
      `SELECT version FROM schema_migrations
        WHERE version ILIKE '%184%'
        ORDER BY version`,
    );

    const { rows: articleRows } = await client.query(
      `SELECT id, title, required_tier_code, is_active, is_visible_to_all_freelancers
         FROM courses
        WHERE title ILIKE $1
        ORDER BY id`,
      ["%كيفية إنشاء مقال%"],
    );

    const { rows: allCourses } = await client.query(
      `SELECT id, title, required_tier_code, is_active
         FROM courses
        ORDER BY id`,
    );

    let requiredCourseId = null;
    try {
      const { rows } = await client.query(
        `SELECT marketplace_membership_required_course_id AS course_id
           FROM marketplace_economy_settings
          WHERE id = 1
          LIMIT 1`,
      );
      requiredCourseId = rows[0]?.course_id ?? null;
    } catch (err) {
      requiredCourseId = { error: err.message };
    }

    const article = articleRows[0] || null;
    const idMatch =
      article &&
      requiredCourseId != null &&
      Number(requiredCourseId) === Number(article.id);

    const report = {
      migration184Applied: mig184.rows.length > 0,
      migration184Versions: mig184.rows.map((r) => r.version),
      articleCourse: article,
      articleCourseMatches: articleRows,
      marketplaceMembershipRequiredCourseId: requiredCourseId,
      requiredCourseMatchesArticle: idMatch,
      allCourses: allCourses.map((r) => ({
        id: r.id,
        title: r.title,
        required_tier_code: r.required_tier_code,
        is_active: r.is_active,
      })),
      rootCause:
        article?.required_tier_code === "silver"
          ? "required_tier_code=silver from migration 184 backfill"
          : article
            ? `required_tier_code=${article.required_tier_code}`
            : "article course not found",
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("AUDIT_ERROR:", err.message);
  process.exit(1);
});
