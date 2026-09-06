/**
 * Extended Staging QA: admin tier toggle + valid exam upload probe + training course.
 */
const http = require("http");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { loadStagingQaEnv, assertStagingQaTarget } = require("../src/config/stagingQaEnv");

const PORT = Number(process.env.QA_PORT || 5018);
const HOST = "127.0.0.1";

function request({ method, urlPath, token, headers = {}, body = null }) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: HOST, port: PORT, path: urlPath, method, headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, timeout: 30000 },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          let bodyOut = null;
          const text = Buffer.concat(chunks).toString("utf8");
          try { bodyOut = JSON.parse(text); } catch { bodyOut = { raw: text.slice(0, 300) }; }
          resolve({ status: res.statusCode || 0, body: bodyOut });
        });
      },
    );
    req.on("error", (e) => resolve({ status: 0, body: { message: e.message } }));
    if (body) req.write(body);
    req.end();
  });
}

function mint(user) {
  return jwt.sign({ sub: String(user.id), role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: "20m" });
}

function buildPdfMultipart(boundary) {
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="completedExamFile"; filename="qa.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  return Buffer.concat([Buffer.from(head), pdf, Buffer.from(tail)]);
}

async function main() {
  loadStagingQaEnv({ fillFromDefaultEnv: true });
  assertStagingQaTarget();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  const cfg = await pool.query("SELECT marketplace_membership_required_course_id AS course_id FROM marketplace_economy_settings WHERE id = 1");
  const trainingId = cfg.rows[0]?.course_id != null ? Number(cfg.rows[0].course_id) : null;

  const { rows: starterRows } = await pool.query(
    `SELECT u.id, u.email, u.role FROM users u
     JOIN freelancer_marketplace_memberships m ON m.freelancer_user_id = u.id AND m.is_current = TRUE
     JOIN marketplace_membership_plans p ON p.id = m.marketplace_plan_id
     WHERE LOWER(p.tier_code) = 'starter' AND u.role = 'freelancer' ORDER BY u.id LIMIT 1`,
  );
  const starter = starterRows[0];
  const { rows: adminRows } = await pool.query(
    `SELECT id, email, role FROM users WHERE role IN ('admin','super_admin') AND COALESCE(is_active,TRUE)=TRUE ORDER BY id LIMIT 1`,
  );
  const admin = adminRows[0];
  const courseId = 8;
  const starterToken = mint(starter);
  const adminToken = mint(admin);

  const out = { trainingConfigured: trainingId, adminRole: admin?.role || null };

  if (trainingId) {
    const trainList = await request({ method: "GET", urlPath: "/api/freelancer/courses", token: starterToken });
    const trainItem = (trainList.body?.data?.courses || []).find((c) => String(c.id) === String(trainingId));
    const trainDetails = await request({ method: "GET", urlPath: `/api/freelancer/courses/${trainingId}`, token: starterToken });
    out.training = {
      inListCanAccess: trainItem?.canAccess ?? null,
      isLockedByPlan: trainItem?.isLockedByPlan ?? null,
      detailsStatus: trainDetails.status,
      detailsCode: trainDetails.body?.code || null,
    };
  } else {
    out.training = { skipped: true, reason: "marketplace_membership_required_course_id not set on Staging" };
  }

  const boundary = "qagatingboundary";
  const multipart = buildPdfMultipart(boundary);
  const examBefore = await request({
    method: "POST",
    urlPath: `/api/freelancer/courses/${courseId}/completed-exam-file`,
    token: starterToken,
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": String(multipart.length) },
    body: multipart,
  });
  out.examUploadLockedPremium = { status: examBefore.status, code: examBefore.body?.code || null, message: examBefore.body?.message || null };

  const boundary2 = "qaexam2";
  const multipart2 = buildPdfMultipart(boundary2);
  const examTestingCourse = await request({
    method: "POST",
    urlPath: `/api/freelancer/courses/3/completed-exam-file`,
    token: starterToken,
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary2}`, "Content-Length": String(multipart2.length) },
    body: multipart2,
  });
  out.examUploadLockedPremiumTestingCourse = {
    courseId: 3,
    status: examTestingCourse.status,
    code: examTestingCourse.body?.code || null,
    message: examTestingCourse.body?.message || null,
  };

  const patchStarter = await request({
    method: "PATCH",
    urlPath: `/api/admin/courses/${courseId}`,
    token: adminToken,
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(JSON.stringify({ requiredTierCode: "starter" }))) },
    body: Buffer.from(JSON.stringify({ requiredTierCode: "starter" })),
  });
  out.adminPatchStarter = { status: patchStarter.status, ok: patchStarter.status >= 200 && patchStarter.status < 300 };

  const detailsStarterTier = await request({ method: "GET", urlPath: `/api/freelancer/courses/${courseId}`, token: starterToken });
  out.starterAccessAfterTierDowngrade = { status: detailsStarterTier.status, code: detailsStarterTier.body?.code || null };

  const patchSilver = await request({
    method: "PATCH",
    urlPath: `/api/admin/courses/${courseId}`,
    token: adminToken,
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(JSON.stringify({ requiredTierCode: "silver" }))) },
    body: Buffer.from(JSON.stringify({ requiredTierCode: "silver" })),
  });
  out.adminPatchSilverRestore = { status: patchSilver.status, ok: patchSilver.status >= 200 && patchSilver.status < 300 };

  const detailsLockedAgain = await request({ method: "GET", urlPath: `/api/freelancer/courses/${courseId}`, token: starterToken });
  out.starterLockedAfterRestore = { status: detailsLockedAgain.status, code: detailsLockedAgain.body?.code || null };

  const adminGet = await request({ method: "GET", urlPath: `/api/admin/courses/${courseId}`, token: adminToken });
  out.adminCourseHasRequiredTier = adminGet.body?.data?.course?.requiredTierCode || adminGet.body?.data?.course?.required_tier_code || null;

  await pool.end();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
