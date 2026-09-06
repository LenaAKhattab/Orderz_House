/**
 * Courses-Gating-01 — Staging post-migration verification + HTTP QA.
 * Loads backend/.env.staging only. Refuses Production.
 *
 * Usage: node scripts/qaCoursesGatingStagingPostMigrate.js
 * Optional: QA_PORT=5018 node scripts/qaCoursesGatingStagingPostMigrate.js --http-only
 */
const http = require("http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  countPendingMigrations,
} = require("../src/config/stagingQaEnv");

const PORT = Number(process.env.QA_PORT || 5018);
const HOST = "127.0.0.1";
const httpOnly = process.argv.includes("--http-only");

function requestJson({ method, urlPath, token, body, formData }) {
  return new Promise((resolve) => {
    let payload = null;
    let headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (formData) {
      payload = formData.buffer;
      headers = { ...headers, ...formData.headers };
    } else if (body != null) {
      payload = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    const req = http.request(
      { host: HOST, port: PORT, path: urlPath, method, headers, timeout: 30000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let parsed = null;
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = { raw: text.slice(0, 200) };
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on("error", (err) => resolve({ status: 0, body: { message: String(err.message || err) } }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: { message: "timeout" } });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function findFreelancerByTier(pool, tierCode) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role, p.tier_code
       FROM users u
       JOIN freelancer_marketplace_memberships m ON m.freelancer_user_id = u.id AND m.is_current = TRUE
       JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
      WHERE u.role = 'freelancer'
        AND COALESCE(u.is_active, TRUE) = TRUE
        AND LOWER(TRIM(p.tier_code)) = LOWER($1)
      ORDER BY u.id ASC
      LIMIT 1`,
    [tierCode],
  );
  return rows[0] || null;
}

function mintToken(userRow) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET missing after staging env load");
  return jwt.sign(
    { sub: String(userRow.id), role: userRow.role, email: userRow.email },
    secret,
    { expiresIn: "20m" },
  );
}

async function verifySchema(pool) {
  const client = await pool.connect();
  try {
    const col = await client.query(
      `SELECT column_name, data_type, column_default
         FROM information_schema.columns
        WHERE table_name = 'courses' AND column_name = 'required_tier_code'`,
    );
    const stats = await client.query(
      `SELECT required_tier_code, COUNT(*)::int AS n
         FROM courses
        GROUP BY required_tier_code
        ORDER BY required_tier_code`,
    );
    const nonSilver = await client.query(
      `SELECT COUNT(*)::int AS n FROM courses WHERE required_tier_code IS DISTINCT FROM 'silver'`,
    );
    const chk = await client.query(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'courses'::regclass AND conname = 'courses_required_tier_code_check'`,
    );
    const applied184 = await client.query(
      `SELECT 1 FROM schema_migrations WHERE version = '184_courses_required_tier_code' LIMIT 1`,
    );
    return {
      columnExists: col.rows.length > 0,
      columnDefault: col.rows[0]?.column_default || null,
      tierDistribution: stats.rows,
      nonSilverCount: nonSilver.rows[0]?.n ?? null,
      checkConstraintExists: chk.rows.length > 0,
      migration184Applied: applied184.rows.length > 0,
    };
  } finally {
    client.release();
  }
}

async function pickPremiumCourse(pool, freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.required_tier_code, c.is_active, c.is_visible_to_all_freelancers,
            EXISTS(SELECT 1 FROM course_assignments a WHERE a.course_id = c.id AND a.freelancer_id = $1) AS assigned
       FROM courses c
      WHERE c.is_active = TRUE
        AND c.required_tier_code IN ('silver', 'pro', 'elite')
        AND (c.is_visible_to_all_freelancers = TRUE
             OR EXISTS(SELECT 1 FROM course_assignments a WHERE a.course_id = c.id AND a.freelancer_id = $1))
      ORDER BY CASE c.required_tier_code WHEN 'silver' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END, c.id DESC
      LIMIT 1`,
    [Number(freelancerUserId)],
  );
  return rows[0] || null;
}

async function pickTrainingCourse(pool) {
  const { rows: cfg } = await pool.query(
    `SELECT marketplace_membership_required_course_id AS course_id
       FROM marketplace_economy_settings WHERE id = 1 LIMIT 1`,
  );
  const courseId = cfg[0]?.course_id != null ? Number(cfg[0].course_id) : null;
  if (!courseId) return null;
  const { rows } = await pool.query(
    `SELECT id, title, required_tier_code FROM courses WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [courseId],
  );
  return rows[0] ? { ...rows[0], configuredId: courseId } : null;
}

async function pickLesson(pool, courseId) {
  const { rows } = await pool.query(
    `SELECT id FROM course_lessons WHERE course_id = $1 AND is_active = TRUE ORDER BY sort_order ASC LIMIT 1`,
    [Number(courseId)],
  );
  return rows[0]?.id || null;
}

async function runHttpQa(pool) {
  const starter = await findFreelancerByTier(pool, "starter");
  if (!starter) throw new Error("No STARTER freelancer found on Staging");

  const premium = await pickPremiumCourse(pool, starter.id);
  if (!premium) throw new Error("No visible premium course for STARTER on Staging");

  const training = await pickTrainingCourse(pool);
  const lessonId = await pickLesson(pool, premium.id);
  const token = mintToken(starter);
  const results = {};

  const list = await requestJson({ method: "GET", urlPath: "/api/freelancer/courses", token });
  results.listStatus = list.status;
  const courses = list.body?.data?.courses || [];
  const locked = courses.filter((c) => c.isLockedByPlan === true);
  const premiumInList = courses.find((c) => String(c.id) === String(premium.id));
  results.listLockedCount = locked.length;
  results.premiumInList = premiumInList
    ? {
        canAccess: premiumInList.canAccess,
        isLockedByPlan: premiumInList.isLockedByPlan,
        upgradeRequired: premiumInList.upgradeRequired,
        upgradePath: premiumInList.upgradePath,
        lockReason: premiumInList.lockReason,
      }
    : null;

  const details = await requestJson({
    method: "GET",
    urlPath: `/api/freelancer/courses/${premium.id}`,
    token,
  });
  results.detailsStatus = details.status;
  results.detailsCode = details.body?.code || null;

  if (lessonId) {
    const complete = await requestJson({
      method: "POST",
      urlPath: `/api/freelancer/courses/${premium.id}/lessons/${lessonId}/complete`,
      token,
      body: {},
    });
    results.lessonCompleteStatus = complete.status;
    results.lessonCompleteCode = complete.body?.code || null;
  }

  const file = await requestJson({
    method: "GET",
    urlPath: `/api/freelancer/courses/${premium.id}/files/test`,
    token,
  });
  results.fileStatus = file.status;
  results.fileCode = file.body?.code || null;

  const completeCourse = await requestJson({
    method: "POST",
    urlPath: `/api/freelancer/courses/${premium.id}/complete`,
    token,
    body: {},
  });
  results.completeStatus = completeCourse.status;
  results.completeCode = completeCourse.body?.code || null;

  const exam = await requestJson({
    method: "POST",
    urlPath: `/api/freelancer/courses/${premium.id}/completed-exam-file`,
    token,
    formData: {
      headers: {
        "Content-Type": "multipart/form-data; boundary=qa",
        "Content-Length": "2",
      },
      buffer: Buffer.from("--\r\n"),
    },
  });
  results.examUploadStatus = exam.status;
  results.examUploadCode = exam.body?.code || null;

  if (training) {
    const trainDetails = await requestJson({
      method: "GET",
      urlPath: `/api/freelancer/courses/${training.id}`,
      token,
    });
    results.trainingCourseId = training.id;
    results.trainingRequiredTier = training.required_tier_code;
    results.trainingDetailsStatus = trainDetails.status;
    results.trainingCanAccessInList = courses.find((c) => String(c.id) === String(training.id))?.canAccess ?? null;
  }

  const tierChecks = {};
  for (const tier of ["silver", "pro", "elite"]) {
    const user = await findFreelancerByTier(pool, tier);
    if (!user) {
      tierChecks[tier] = { skipped: true, reason: "no user" };
      continue;
    }
    const tToken = mintToken(user);
    const silverCourse = await pool.query(
      `SELECT id FROM courses WHERE is_active = TRUE AND required_tier_code = 'silver' LIMIT 1`,
    );
    const proCourse = await pool.query(
      `SELECT id FROM courses WHERE is_active = TRUE AND required_tier_code = 'pro' LIMIT 1`,
    );
    const eliteCourse = await pool.query(
      `SELECT id FROM courses WHERE is_active = TRUE AND required_tier_code = 'elite' LIMIT 1`,
    );
    const checkOne = async (courseId) => {
      if (!courseId) return { skipped: true };
      const res = await requestJson({
        method: "GET",
        urlPath: `/api/freelancer/courses/${courseId}`,
        token: tToken,
      });
      return { status: res.status, code: res.body?.code || null };
    };
    tierChecks[tier] = {
      userId: user.id,
      silver: await checkOne(silverCourse.rows[0]?.id),
      pro: await checkOne(proCourse.rows[0]?.id),
      elite: await checkOne(eliteCourse.rows[0]?.id),
    };
  }

  results.tierChecks = tierChecks;
  results.premiumCourseId = premium.id;
  results.starterUserId = starter.id;
  return results;
}

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  const target = assertStagingQaTarget();
  const mig = await countPendingMigrations();
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
  });

  const schema = await verifySchema(pool);
  const out = {
    phase: httpOnly ? "courses-gating-http-qa" : "courses-gating-staging-verify",
    appEnv: target.appEnv,
    maskedTarget: target.maskedTarget,
    classification: target.db.classification,
    pendingCount: mig.pendingCount,
    schema,
  };

  if (!httpOnly) {
    console.log(JSON.stringify(out, null, 2));
    await pool.end();
    return;
  }

  out.http = await runHttpQa(pool);
  await pool.end();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
