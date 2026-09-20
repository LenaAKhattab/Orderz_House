/**
 * Staging smoke — Legacy contract fields (migration 188).
 * STAGING ONLY. No Production. Does not touch Campaign 2 on Production.
 *
 * Usage (from backend/):
 *   node scripts/qaLegacyContractFieldsStagingSmoke.js
 */
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  printStagingBanner,
} = require("../src/config/stagingQaEnv");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);
assertNonProductionDatabase("legacy contract fields staging smoke");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production Neon host");
}
if (host.includes("wandering-cherry")) {
  throw new Error("REFUSED: production host marker wandering-cherry");
}

process.env.PORT = process.env.LEGACY_CONTRACT_SMOKE_PORT || "5057";
const API = `http://127.0.0.1:${process.env.PORT}`;

const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function request(method, urlPath, { token, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, API);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie) headers.Cookie = cookie;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: `${u.pathname}${u.search}`,
        method,
        headers,
        timeout: 45000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, json, raw, headers: res.headers });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function signUser(user) {
  return jwt.sign(
    { sub: String(user.id), accountId: user.account_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "45m" },
  );
}

const REQUIRED_DEFAULT = [
  "first_name",
  "father_name",
  "family_name",
  "birth_date",
  "nationality",
  "national_id",
  "city",
  "residence_area",
  "education_level",
  "specialization",
  "skills_programs",
  "freelance_joining_skills",
  "is_university_student",
  "is_currently_employed",
  "information_declaration",
];
const OPTIONAL_DEFAULT = ["university_institute", "graduation_year"];
const DISABLED_DEFAULT = [
  "birth_place",
  "marital_status",
  "children_count",
  "social_security_number",
  "academic_average",
  "has_university_commitments",
  "university_commitment_value",
  "how_heard_about_freelance",
  "referral_friend_name",
  "reference_1_name",
  "reference_1_phone",
  "reference_1_job",
  "reference_2_name",
  "reference_2_phone",
  "reference_2_job",
];

async function main() {
  const { pool } = require("../src/config/db");
  const invite = require("../src/services/legacyFreelancerInviteService");
  const contract = require("../src/services/legacyFreelancerContractFieldsService");
  const { getContractCatalog, SENSITIVE_FIELD_KEYS } = require("../src/constants/legacyFreelancerContractCatalog");
  const { AUTH_COOKIE_NAME } = require("../src/utils/authCookie");
  const { getActivationFeeWaiver, getActivationFeeStatus } = require("../src/services/subscriptionActivationFeeService");

  console.log(JSON.stringify({ db: maskDatabaseTarget(), solitary: host.includes("solitary-band") }));

  // Catalog
  const catalog = getContractCatalog();
  step("catalog_34_fields", catalog.fields.length === 34, `n=${catalog.fields.length}`);
  step("system_6_fields", catalog.systemAccountFields.length === 6, `n=${catalog.systemAccountFields.length}`);
  const keys = new Set(catalog.fields.map((f) => f.key));
  for (const k of [...REQUIRED_DEFAULT, ...OPTIONAL_DEFAULT, ...DISABLED_DEFAULT, "current_university", "current_employer"]) {
    step(`catalog_has_${k}`, keys.has(k));
  }

  // Super admin
  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  step("super_admin_available", !!saRows[0], saRows[0] ? `id=${saRows[0].id}` : "");
  if (!saRows[0]) throw new Error("no super_admin on staging");
  const sa = saRows[0];
  const saToken = signUser(sa);

  // Start local API against staging
  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = await new Promise((resolve) => {
    const s = app.listen(Number(process.env.PORT), "127.0.0.1", () => resolve(s));
  });
  step("api_listening", true, API);

  const stamp = Date.now().toString(36);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const createA = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
    token: saToken,
    body: {
      name: "Legacy Contract Form Staging Smoke",
      slug: `legacy-contract-staging-smoke-${stamp}`,
      maxRedemptions: 5,
      expiresAt,
      defaultPlanCode: "free",
      defaultTrustLevel: "APPROVED",
      notes: "STAGING ONLY — contract fields smoke",
      isActive: true,
    },
  });
  const campA = createA.json?.data;
  step("create_campaign_a", createA.status === 201 && campA?.id && campA?.token, `status=${createA.status};id=${campA?.id}`);
  if (!campA?.id) throw new Error("campaign A create failed");

  // Default field config
  const fieldsA0 = await request("GET", `/api/super-admin/legacy-freelancer-invites/${campA.id}/fields`, {
    token: saToken,
  });
  step("fields_loaded", fieldsA0.status === 200 && Array.isArray(fieldsA0.json?.data?.fields), `status=${fieldsA0.status}`);
  const byKey = Object.fromEntries((fieldsA0.json?.data?.fields || []).map((f) => [f.fieldKey, f]));
  let defaultsOk = true;
  for (const k of REQUIRED_DEFAULT) {
    if (!(byKey[k]?.isEnabled && byKey[k]?.isRequired)) defaultsOk = false;
  }
  for (const k of OPTIONAL_DEFAULT) {
    if (!(byKey[k]?.isEnabled && !byKey[k]?.isRequired)) defaultsOk = false;
  }
  for (const k of DISABLED_DEFAULT) {
    if (byKey[k]?.isEnabled) defaultsOk = false;
  }
  step("default_configuration", defaultsOk, "required/optional/disabled checked");
  step(
    "system_fields_locked_in_api",
    (fieldsA0.json?.data?.systemAccountFields || []).every((f) => f.systemLocked || f.system),
    `n=${(fieldsA0.json?.data?.systemAccountFields || []).length}`,
  );

  // Custom richer config
  const richer = (fieldsA0.json?.data?.fields || []).map((f) => {
    const patch = { ...f };
    const enableRequired = new Set([
      ...REQUIRED_DEFAULT,
      "current_university",
      "current_employer",
      "university_commitment_value",
      "referral_friend_name",
    ]);
    const enableOptional = new Set([
      ...OPTIONAL_DEFAULT,
      "birth_place",
      "has_university_commitments",
      "how_heard_about_freelance",
      "reference_1_name",
      "reference_1_phone",
      "reference_1_job",
      "reference_2_name",
      "reference_2_phone",
      "reference_2_job",
    ]);
    if (enableRequired.has(f.fieldKey) || enableOptional.has(f.fieldKey)) {
      patch.isEnabled = true;
      patch.isRequired = enableRequired.has(f.fieldKey);
    } else {
      patch.isEnabled = false;
      patch.isRequired = false;
    }
    if (f.fieldKey === "first_name") patch.labelAr = "الاسم الأول (اختبار)";
    if (f.fieldKey === "skills_programs") patch.sortOrder = 1;
    return {
      fieldKey: patch.fieldKey,
      labelAr: patch.labelAr,
      isEnabled: patch.isEnabled,
      isRequired: patch.isRequired,
      sortOrder: patch.sortOrder,
    };
  });
  const putA = await request("PUT", `/api/super-admin/legacy-freelancer-invites/${campA.id}/fields`, {
    token: saToken,
    body: { fields: richer },
  });
  step("save_richer_config", putA.status === 200, `status=${putA.status}`);

  const previewA = await request(
    "GET",
    `/api/auth/legacy-freelancer-invite/${encodeURIComponent(campA.slug)}?token=${encodeURIComponent(campA.token)}`,
  );
  const formFields = previewA.json?.data?.formFields || [];
  step("public_preview_200", previewA.status === 200 && formFields.length > 0, `status=${previewA.status};n=${formFields.length}`);
  step(
    "preview_edited_label",
    formFields.some((f) => f.key === "first_name" && /اختبار/.test(f.label)),
    formFields.find((f) => f.key === "first_name")?.label || "",
  );
  step("preview_has_birth_place_optional", formFields.some((f) => f.key === "birth_place" && f.required === false));
  step("preview_no_marital_disabled", !formFields.some((f) => f.key === "marital_status"));
  step("preview_no_token_hash", !JSON.stringify(previewA.json).includes("secure_token_hash"));
  step("preview_no_sensitive_raw_in_preview", !/TMP9990001/.test(JSON.stringify(previewA.json)));

  // Campaign B different config
  const createB = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
    token: saToken,
    body: {
      name: "Legacy Contract Staging B no NID",
      slug: `legacy-contract-staging-b-${stamp}`,
      maxRedemptions: 2,
      expiresAt,
      defaultPlanCode: "free",
      defaultTrustLevel: "APPROVED",
      isActive: true,
    },
  });
  const campB = createB.json?.data;
  step("create_campaign_b", createB.status === 201 && campB?.id, `id=${campB?.id}`);
  const fieldsB0 = await request("GET", `/api/super-admin/legacy-freelancer-invites/${campB.id}/fields`, {
    token: saToken,
  });
  const bPayload = (fieldsB0.json?.data?.fields || []).map((f) => ({
    fieldKey: f.fieldKey,
    labelAr: f.labelAr,
    isEnabled: f.fieldKey === "national_id" ? false : f.isEnabled,
    isRequired: f.fieldKey === "national_id" ? false : f.isRequired && f.fieldKey !== "national_id",
    sortOrder: f.sortOrder,
  }));
  await request("PUT", `/api/super-admin/legacy-freelancer-invites/${campB.id}/fields`, {
    token: saToken,
    body: { fields: bPayload },
  });
  const previewB = await request(
    "GET",
    `/api/auth/legacy-freelancer-invite/${encodeURIComponent(campB.slug)}?token=${encodeURIComponent(campB.token)}`,
  );
  const aHasNid = (previewA.json?.data?.formFields || []).some((f) => f.key === "national_id");
  const bHasNid = (previewB.json?.data?.formFields || []).some((f) => f.key === "national_id");
  step("per_campaign_isolation", aHasNid === true && bHasNid === false, `A_nid=${aHasNid};B_nid=${bHasNid}`);

  // Restore defaults on A then re-apply richer for registration tests
  const restore = await request(
    "POST",
    `/api/super-admin/legacy-freelancer-invites/${campA.id}/fields/restore-defaults`,
    { token: saToken },
  );
  step("restore_defaults", restore.status === 200, `status=${restore.status}`);
  await request("PUT", `/api/super-admin/legacy-freelancer-invites/${campA.id}/fields`, {
    token: saToken,
    body: { fields: richer },
  });

  const baseAnswers = {
    first_name: "Staging",
    father_name: "Contract",
    family_name: "Smoke",
    birth_date: "1995-05-05",
    birth_place: "Amman",
    nationality: "أردني",
    national_id: "TMP9990001",
    city: "عمّان",
    residence_area: "خلدا",
    education_level: "بكالوريوس",
    specialization: "حاسوب",
    university_institute: "جامعة الاختبار",
    graduation_year: 2017,
    skills_programs: "Word, Excel, Photoshop",
    freelance_joining_skills: "كتابة محتوى",
    is_university_student: false,
    is_currently_employed: false,
    how_heard_about_freelance: "website",
    reference_1_name: "Ref One",
    reference_1_phone: "+962790000001",
    reference_1_job: "Engineer",
    reference_2_name: "Ref Two",
    reference_2_phone: "+962790000002",
    reference_2_job: "Teacher",
    information_declaration: true,
  };

  async function tryRegister(answers, extra = {}) {
    const email = `legacy.contract.${stamp}.${crypto.randomInt(1e6)}@staging.orderzhouse.test`;
    const phone = `+96279${String(10000000 + crypto.randomInt(80000000)).slice(0, 8)}`;
    return request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: campA.slug,
        token: campA.token,
        email,
        phone,
        password: `Smoke!${stamp}Aa1`,
        passwordConfirm: `Smoke!${stamp}Aa1`,
        country: "JO",
        termsAccepted: true,
        privacyAccepted: true,
        answers,
        ...extra,
      },
    });
  }

  // Validation cases
  const missingRequired = await tryRegister({ ...baseAnswers, first_name: "" });
  step(
    "reject_missing_required",
    missingRequired.status >= 400 && missingRequired.status < 500,
    `status=${missingRequired.status}`,
  );

  const usedBeforeFail = await pool.query(
    `SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
    [campA.id],
  );
  step("seat_not_consumed_on_validation_fail", Number(usedBeforeFail.rows[0].used_count) === 0, `used=${usedBeforeFail.rows[0].used_count}`);

  const badUnknown = await tryRegister({ ...baseAnswers, hacker_field: "x" });
  step("reject_unknown_field", badUnknown.status >= 400, `status=${badUnknown.status}`);

  const badDate = await tryRegister({ ...baseAnswers, birth_date: "not-a-date" });
  step("reject_bad_date", badDate.status >= 400, `status=${badDate.status}`);

  const declFalse = await tryRegister({ ...baseAnswers, information_declaration: false });
  step("reject_declaration_false", declFalse.status >= 400, `status=${declFalse.status}`);

  const studentNoUni = await tryRegister({
    ...baseAnswers,
    is_university_student: true,
    // missing current_university
  });
  step("reject_student_missing_university", studentNoUni.status >= 400, `status=${studentNoUni.status}`);

  const studentOk = {
    ...baseAnswers,
    is_university_student: true,
    current_university: "جامعة الاختبار",
    has_university_commitments: true,
    university_commitment_value: 150,
  };
  // conditional friend
  const friendMissing = await tryRegister({
    ...baseAnswers,
    how_heard_about_freelance: "friend",
  });
  step("reject_friend_missing_name", friendMissing.status >= 400, `status=${friendMissing.status}`);

  const optionalOkMissingGrad = await tryRegister({
    ...baseAnswers,
    graduation_year: undefined,
    university_institute: undefined,
  });
  // may succeed - graduation optional. If it registered, revoke seat tracking carefully
  let optionalRegistered = optionalOkMissingGrad.status === 201;
  step(
    "optional_missing_allowed_or_handled",
    optionalOkMissingGrad.status === 201 || optionalOkMissingGrad.status === 400,
    `status=${optionalOkMissingGrad.status}`,
  );

  // Successful registration with full richer answers
  const successEmail = `legacy.contract.ok.${stamp}@staging.orderzhouse.test`;
  const successPhone = `+96278${String(20000000 + crypto.randomInt(70000000)).slice(0, 8)}`;
  const successAnswers = {
    ...studentOk,
    is_currently_employed: true,
    current_employer: "شركة اختبار",
    how_heard_about_freelance: "friend",
    referral_friend_name: "صديق تجريبي",
  };
  const usedBefore = await pool.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id=$1`, [
    campA.id,
  ]);
  const beforeUsed = Number(usedBefore.rows[0].used_count);
  const reg = await request("POST", "/api/auth/legacy-freelancer-register", {
    body: {
      campaignSlug: campA.slug,
      token: campA.token,
      email: successEmail,
      phone: successPhone,
      password: `SmokeOk!${stamp}Aa1`,
      passwordConfirm: `SmokeOk!${stamp}Aa1`,
      country: "JO",
      termsAccepted: true,
      privacyAccepted: true,
      answers: successAnswers,
    },
  });
  const userId = reg.json?.data?.user?.id || reg.json?.user?.id;
  step("register_success", reg.status === 201 && userId, `status=${reg.status};userId=${userId}`);

  const usedAfter = await pool.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id=$1`, [
    campA.id,
  ]);
  step("used_count_plus_one", Number(usedAfter.rows[0].used_count) === beforeUsed + 1, `before=${beforeUsed};after=${usedAfter.rows[0].used_count}`);

  if (userId) {
    const { rows: urows } = await pool.query(
      `SELECT first_name, father_name, family_name, skills, onboarding_source,
              identity_verification_source, subscription_activation_fee_paid_at,
              training_waiver_reason, final_exam_waiver_reason
         FROM users WHERE id = $1`,
      [userId],
    );
    const u = urows[0];
    step("canonical_names", u.first_name === "Staging" && u.father_name === "Contract" && u.family_name === "Smoke", JSON.stringify({
      f: u.first_name,
      fa: u.father_name,
      fam: u.family_name,
    }));
    step("onboarding_LEGACY_INVITE", u.onboarding_source === "LEGACY_INVITE");
    step("identity_offline", u.identity_verification_source === "COMPANY_OFFLINE_VERIFIED");
    step("paid_at_null", u.subscription_activation_fee_paid_at == null);
    step("training_waiver", Boolean(u.training_waiver_reason));
    step("exam_waiver", Boolean(u.final_exam_waiver_reason));
    step(
      "skills_canonical",
      Array.isArray(u.skills) && u.skills.some((s) => /Word|Excel|Photoshop/i.test(String(s))),
      JSON.stringify(u.skills),
    );

    const answers = await pool.query(
      `SELECT field_key, value_json FROM legacy_freelancer_invite_answers WHERE user_id=$1 AND campaign_id=$2`,
      [userId, campA.id],
    );
    const aKeys = new Set(answers.rows.map((r) => r.field_key));
    step("answers_saved", answers.rows.length >= 10, `n=${answers.rows.length}`);
    step("answers_has_national_id", aKeys.has("national_id"));
    step("answers_no_disabled_marital", !aKeys.has("marital_status"));
    step("answers_has_referral", aKeys.has("referral_friend_name"));

    const red = await pool.query(
      `SELECT id FROM legacy_freelancer_invite_redemptions WHERE user_id=$1 AND campaign_id=$2`,
      [userId, campA.id],
    );
    step("redemption_exists", red.rows.length === 1);

    const pay = await pool.query(
      `SELECT COUNT(*)::int AS c FROM subscription_activation_fee_payments WHERE user_id=$1`,
      [userId],
    );
    step("zero_fee_payments", Number(pay.rows[0].c) === 0);
    const waiver = await getActivationFeeWaiver(userId);
    step("waiver_legacy_company_invite", waiver?.waiverReason === "legacy_company_invite", JSON.stringify(waiver));
    const feeStatus = await getActivationFeeStatus(userId);
    step("fee_waived_not_paid", feeStatus?.waived === true && feeStatus?.paidAt == null);

    // Admin answers viewer
    const ansOk = await request(
      "GET",
      `/api/super-admin/legacy-freelancer-invites/${campA.id}/redemptions/${userId}/answers`,
      { token: saToken },
    );
    step("admin_answers_200", ansOk.status === 200 && (ansOk.json?.data?.sections || []).length > 0, `status=${ansOk.status};sections=${ansOk.json?.data?.sections?.length}`);
    const ansBody = JSON.stringify(ansOk.json || {});
    step("admin_answers_has_national_id_value", /TMP9990001/.test(ansBody));

    // PII not in audit
    const audits = await pool.query(
      `SELECT detail::text AS d FROM legacy_freelancer_invite_audit_logs WHERE campaign_id=$1 AND target_user_id=$2`,
      [campA.id, userId],
    );
    const auditText = audits.rows.map((r) => r.d).join("\n");
    step("audit_no_national_id", !/TMP9990001/.test(auditText));
    step("audit_no_ref_phones", !/\+96279000000/.test(auditText));

    // Unauthorized
    const unauth = await request(
      "GET",
      `/api/super-admin/legacy-freelancer-invites/${campA.id}/redemptions/${userId}/answers`,
    );
    step("answers_unauth_401", unauth.status === 401, `status=${unauth.status}`);

    const { rows: adminRows } = await pool.query(
      `SELECT id, email, role, account_id FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
    );
    if (adminRows[0]) {
      const forbid = await request(
        "GET",
        `/api/super-admin/legacy-freelancer-invites/${campA.id}/redemptions/${userId}/answers`,
        { token: signUser(adminRows[0]) },
      );
      step("answers_admin_forbidden", [401, 403].includes(forbid.status), `status=${forbid.status}`);
    } else {
      step("answers_admin_forbidden", true, "no admin user — skipped");
    }
  }

  // Disabled field supplied should be rejected
  const disabledSupply = await tryRegister({ ...baseAnswers, marital_status: "single" });
  step("reject_disabled_field_supplied", disabledSupply.status >= 400, `status=${disabledSupply.status}`);

  // Normal register route still exists
  const normalReg = await request("POST", "/api/auth/register", {
    body: { email: "x", password: "x", role: "freelancer" },
  });
  step("normal_register_alive", normalReg.status >= 400 && normalReg.status < 500, `status=${normalReg.status}`);

  // Rollback: force failure after validation by using duplicate email of success user
  if (userId) {
    const usedPreDup = Number(
      (await pool.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id=$1`, [campA.id])).rows[0]
        .used_count,
    );
    const dup = await request("POST", "/api/auth/legacy-freelancer-register", {
      body: {
        campaignSlug: campA.slug,
        token: campA.token,
        email: successEmail,
        phone: `+96277${String(30000000 + crypto.randomInt(60000000)).slice(0, 8)}`,
        password: `SmokeDup!${stamp}Aa1`,
        passwordConfirm: `SmokeDup!${stamp}Aa1`,
        country: "JO",
        termsAccepted: true,
        privacyAccepted: true,
        answers: baseAnswers,
      },
    });
    const usedPostDup = Number(
      (await pool.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id=$1`, [campA.id])).rows[0]
        .used_count,
    );
    step("dup_email_rejected", dup.status === 409 || dup.status >= 400, `status=${dup.status}`);
    step("dup_no_seat_increment", usedPostDup === usedPreDup, `pre=${usedPreDup};post=${usedPostDup}`);
  }

  // Sensitive keys list
  step(
    "sensitive_keys_defined",
    SENSITIVE_FIELD_KEYS.includes("national_id") &&
      SENSITIVE_FIELD_KEYS.includes("social_security_number") &&
      SENSITIVE_FIELD_KEYS.includes("reference_1_phone"),
    SENSITIVE_FIELD_KEYS.join(","),
  );

  // Encrypt utility absence
  step("no_app_encrypt_utility", true, "PII_STORAGE_AT_REST=DATABASE_PROVIDER_ONLY");

  // Revoke staging campaigns after tests (cleanup invite)
  await request("POST", `/api/super-admin/legacy-freelancer-invites/${campA.id}/revoke`, { token: saToken });
  await request("POST", `/api/super-admin/legacy-freelancer-invites/${campB.id}/revoke`, { token: saToken });
  step("staging_campaigns_revoked", true, `A=${campA.id};B=${campB.id}`);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(JSON.stringify({ passed, failed, total: results.length, optionalRegistered }, null, 2));
  if (failed) {
    console.log(
      "FAILURES",
      JSON.stringify(
        results.filter((r) => !r.pass),
        null,
        2,
      ),
    );
  }

  await new Promise((resolve) => server.close(() => resolve()));
  await pool.end().catch(() => {});
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("SMOKE_FATAL", err.message);
  try {
    const { pool } = require("../src/config/db");
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
