/**
 * Courses-Gating-02 — Staging QA (DB + optional HTTP).
 * Usage:
 *   node scripts/qaCoursesGating02Staging.js
 *   QA_PORT=5000 node scripts/qaCoursesGating02Staging.js --http
 */
const http = require("http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");

loadStagingQaEnv({ fillFromDefaultEnv: true });
assertStagingQaTarget();

const {
  evaluateCoursePlanAccessWithContext,
  buildFreelancerCourseAccessContext,
} = require("../src/services/coursePlanEligibilityService");

const ARTICLE_TITLE = "كيفية إنشاء مقال";
const PORT = Number(process.env.QA_PORT || 5000);
const HOST = "127.0.0.1";
const withHttp = process.argv.includes("--http");

function requestJson({ method, urlPath, token }) {
  return new Promise((resolve) => {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request(
      { host: HOST, port: PORT, path: urlPath, method, headers, timeout: 20000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let body = null;
          const text = Buffer.concat(chunks).toString("utf8");
          try {
            body = JSON.parse(text);
          } catch {
            body = { raw: text.slice(0, 120) };
          }
          resolve({ status: res.statusCode || 0, body });
        });
      },
    );
    req.on("error", (err) => resolve({ status: 0, body: { message: err.message } }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ status: 0, body: { message: "timeout" } });
    });
    req.end();
  });
}

async function findFreelancerByTier(pool, tierCode) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.role
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
  if (!secret || secret.length < 16) throw new Error("JWT_SECRET missing");
  return jwt.sign(
    { sub: String(userRow.id), role: userRow.role, email: userRow.email },
    secret,
    { expiresIn: "20m" },
  );
}

async function main() {
  const target = assertStagingQaTarget();
  printStagingBanner(target);

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 3,
    connectionTimeoutMillis: 20000,
  });

  const { rows: courses } = await pool.query(
    `SELECT id, title, required_tier_code, is_active FROM courses WHERE is_active = TRUE ORDER BY id`,
  );
  const article = courses.find((c) => c.title === ARTICLE_TITLE);
  const premium = courses.find((c) => c.id !== article?.id && c.required_tier_code !== "starter");

  const starter = await findFreelancerByTier(pool, "starter");
  const silver = await findFreelancerByTier(pool, "silver");

  const report = {
    migration184: true,
    articleCourse: article
      ? { id: article.id, title: article.title, required_tier_code: article.required_tier_code }
      : null,
    premiumSample: premium
      ? { id: premium.id, title: premium.title, required_tier_code: premium.required_tier_code }
      : null,
    serviceChecks: {},
    httpChecks: null,
  };

  if (starter && article) {
    const ctx = await buildFreelancerCourseAccessContext(starter.id, { client: pool });
    report.serviceChecks.starterArticle = evaluateCoursePlanAccessWithContext({
      course: article,
      context: ctx,
    });
    if (premium) {
      report.serviceChecks.starterPremium = evaluateCoursePlanAccessWithContext({
        course: premium,
        context: ctx,
      });
    }
  } else if (article) {
    report.serviceChecks.starterArticleSynthetic = evaluateCoursePlanAccessWithContext({
      course: article,
      context: { currentTierCode: "starter", requiredTrainingCourseId: null },
    });
    if (premium) {
      report.serviceChecks.starterPremiumSynthetic = evaluateCoursePlanAccessWithContext({
        course: premium,
        context: { currentTierCode: "starter", requiredTrainingCourseId: null },
      });
    }
    report.serviceChecks.starterUserMissing = true;
  }

  if (silver) {
    const ctx = await buildFreelancerCourseAccessContext(silver.id, { client: pool });
    for (const c of courses) {
      const access = evaluateCoursePlanAccessWithContext({ course: c, context: ctx });
      if (!access.canAccess) {
        report.serviceChecks.silverBlocked = { courseId: c.id, title: c.title };
        break;
      }
    }
    report.serviceChecks.silverAllAccessible =
      !report.serviceChecks.silverBlocked && courses.length > 0;
  }

  if (withHttp && starter && article && premium) {
    const token = mintToken(starter);
    const list = await requestJson({ method: "GET", urlPath: "/api/freelancer/courses", token });
    const listCourses = list.body?.data?.courses || [];
    const articleInList = listCourses.find((c) => String(c.id) === String(article.id));
    const premiumInList = listCourses.find((c) => String(c.id) === String(premium.id));
    const articleDetails = await requestJson({
      method: "GET",
      urlPath: `/api/freelancer/courses/${article.id}`,
      token,
    });
    const premiumDetails = await requestJson({
      method: "GET",
      urlPath: `/api/freelancer/courses/${premium.id}`,
      token,
    });

    report.httpChecks = {
      listStatus: list.status,
      articleInList: articleInList
        ? {
            canAccess: articleInList.canAccess,
            isLockedByPlan: articleInList.isLockedByPlan,
          }
        : null,
      premiumInList: premiumInList
        ? {
            canAccess: premiumInList.canAccess,
            isLockedByPlan: premiumInList.isLockedByPlan,
            lockReason: premiumInList.lockReason,
            upgradePath: premiumInList.upgradePath,
          }
        : null,
      articleDetailsStatus: articleDetails.status,
      premiumDetailsStatus: premiumDetails.status,
      premiumDetailsCode: premiumDetails.body?.code || null,
    };

    if (silver) {
      const sToken = mintToken(silver);
      const sList = await requestJson({ method: "GET", urlPath: "/api/freelancer/courses", token: sToken });
      const sCourses = sList.body?.data?.courses || [];
      report.httpChecks.silverLockedCount = sCourses.filter((c) => c.isLockedByPlan).length;
      report.httpChecks.silverAllUnlocked = report.httpChecks.silverLockedCount === 0;
    }
  }

  report.pass =
    article?.required_tier_code === "starter" &&
    (report.serviceChecks.starterArticle?.canAccess === true ||
      report.serviceChecks.starterArticleSynthetic?.canAccess === true) &&
    (report.serviceChecks.starterPremium?.canAccess === false ||
      report.serviceChecks.starterPremiumSynthetic?.canAccess === false) &&
    report.serviceChecks.silverAllAccessible === true;

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("QA_ERROR:", err.message);
  process.exit(1);
});
