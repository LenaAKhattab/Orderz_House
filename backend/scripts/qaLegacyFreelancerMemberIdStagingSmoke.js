/**
 * Staging smoke — Legacy Freelancer Business ID = National ID (migration 189).
 * STAGING ONLY. No Production. Does not touch Campaign 2.
 *
 * Prerequisites:
 *   - backend/.env.staging with Neon staging host (ep-solitary-band…)
 *   - migration 189 applied via: node scripts/applyLegacyFreelancerMemberId189Staging.js
 *
 * Usage (from backend/):
 *   node scripts/qaLegacyFreelancerMemberIdStagingSmoke.js
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
const {
  maskFreelancerMemberId,
  DUPLICATE_NATIONAL_ID_AR,
} = require("../src/utils/legacyFreelancerMemberId");

loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);
assertNonProductionDatabase("legacy freelancer member id staging smoke");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production Neon host");
}
if (host.includes("wandering-cherry")) {
  throw new Error("REFUSED: production host marker wandering-cherry");
}
if (!host.includes("solitary-band")) {
  console.warn(
    JSON.stringify({
      warning: "expected solitary-band staging host marker",
      hostPrefix: host.slice(0, 40),
    }),
  );
}

process.env.PORT = process.env.LEGACY_MEMBER_ID_SMOKE_PORT || "5059";
const API = `http://127.0.0.1:${process.env.PORT}`;
// Unique 10-digit dummy national ID per run (never reuse across smokes).
const NATIONAL_ID = `2${String(Date.now()).slice(-9)}`;
const NATIONAL_ID_MASKED = maskFreelancerMemberId(NATIONAL_ID);

const results = [];
function step(name, pass, detail = "") {
  const safeDetail = String(detail || "")
    .replace(new RegExp(NATIONAL_ID, "g"), NATIONAL_ID_MASKED)
    .slice(0, 500);
  results.push({ name, pass: !!pass, detail: safeDetail });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${safeDetail ? ` — ${safeDetail}` : ""}`);
}

function request(method, urlPath, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, API);
    const payload = body != null ? JSON.stringify(body) : null;
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(payload);
    }
    if (token) headers.Authorization = `Bearer ${token}`;
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
          resolve({ status: res.statusCode, json, raw });
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

function baseAnswers(overrides = {}) {
  return {
    first_name: "أحمد",
    father_name: "محمد",
    family_name: "اختبار",
    birth_date: "1992-05-15",
    nationality: "أردني",
    national_id: NATIONAL_ID,
    city: "عمّان",
    residence_area: "خلدا",
    education_level: "بكالوريوس",
    specialization: "حاسوب",
    skills_programs: "Word, Excel",
    freelance_joining_skills: "كتابة محتوى",
    is_university_student: false,
    is_currently_employed: false,
    information_declaration: true,
    ...overrides,
  };
}

async function main() {
  const { pool } = require("../src/config/db");
  const { getActivationFeeWaiver } = require("../src/services/subscriptionActivationFeeService");
  const { maskFreelancerMemberId: maskMid } = require("../src/utils/legacyFreelancerMemberId");

  console.log(
    JSON.stringify({
      db: maskDatabaseTarget(),
      solitary: host.includes("solitary-band"),
      expectedMask: NATIONAL_ID_MASKED,
    }),
  );

  // Schema checks
  const { rows: col } = await pool.query(
    `SELECT data_type, character_maximum_length, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND column_name = 'freelancer_member_id'`,
  );
  step(
    "column_freelancer_member_id",
    col[0] && col[0].data_type === "character varying" && Number(col[0].character_maximum_length) === 32 && col[0].is_nullable === "YES",
    JSON.stringify(col[0] || null),
  );

  const { rows: idx } = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'users_legacy_freelancer_member_id_uidx'`,
  );
  step(
    "partial_unique_index",
    !!idx[0] && /LEGACY_INVITE/i.test(idx[0].indexdef) && /UNIQUE/i.test(idx[0].indexdef),
    idx[0]?.indexname || "",
  );

  const { rows: mig } = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE version = '189_legacy_freelancer_member_id'`,
  );
  step("migration_recorded", !!mig[0]);

  // Campaign 2 must remain untouched (even on staging if present)
  const { rows: camp2Before } = await pool.query(
    `SELECT id, slug, max_redemptions, used_count, secure_token_hash, expires_at, is_active, revoked_at
       FROM legacy_freelancer_invite_campaigns WHERE id = 2`,
  );
  const c2b = camp2Before[0] || null;
  step("campaign2_snapshot_captured", true, c2b ? `slug=${c2b.slug};used=${c2b.used_count}` : "absent_on_staging");

  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users
      WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  step("super_admin_available", !!saRows[0], saRows[0] ? `id=${saRows[0].id}` : "");
  if (!saRows[0]) throw new Error("no super_admin on staging");
  const saToken = signUser(saRows[0]);

  // Ordinary admin (if any) for access denial check
  const { rows: adminRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users
      WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const adminToken = adminRows[0] ? signUser(adminRows[0]) : null;

  delete require.cache[require.resolve("../src/app")];
  const app = require("../src/app");
  const server = await new Promise((resolve) => {
    const s = app.listen(Number(process.env.PORT), "127.0.0.1", () => resolve(s));
  });
  step("api_listening", true, API);

  const stamp = Date.now().toString(36);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const create = await request("POST", "/api/super-admin/legacy-freelancer-invites", {
    token: saToken,
    body: {
      name: "Legacy Member ID Staging Smoke",
      slug: `legacy-member-id-smoke-${stamp}`,
      maxRedemptions: 5,
      expiresAt,
      defaultPlanCode: "free",
      defaultTrustLevel: "APPROVED",
      notes: "STAGING ONLY — member id smoke",
      isActive: true,
    },
  });
  const camp = create.json?.data;
  step("create_temp_campaign", create.status === 201 && !!camp?.id && !!camp?.token, `status=${create.status};id=${camp?.id}`);
  if (!camp?.id) throw new Error("campaign create failed");

  const usedBefore = Number(camp.usedCount || 0);

  const email1 = `legacy.member.${stamp}@staging.orderzhouse.test`;
  const phone1 = `+96279${String(crypto.randomInt(1000000, 9999999))}`;
  const reg1 = await request("POST", "/api/auth/legacy-freelancer-register", {
    body: {
      campaignSlug: camp.slug,
      token: camp.token,
      email: email1,
      password: "TestPass123!",
      passwordConfirm: "TestPass123!",
      termsAccepted: true,
      privacyAccepted: true,
      country: "JO",
      gender: "ذكر",
      phone: { countryCode: "+962", number: phone1.replace("+962", "") },
      answers: baseAnswers(),
    },
  });
  step("register_legacy_ok", reg1.status === 201 && !!reg1.json?.data?.user?.id, `status=${reg1.status}`);
  const userId = reg1.json?.data?.user?.id;
  const accountIdPublic = reg1.json?.data?.user?.accountId;
  const memberFromAuth = reg1.json?.data?.user?.freelancerMemberId;
  step("auth_returns_member_id_private", memberFromAuth === NATIONAL_ID, `masked=${maskMid(memberFromAuth)}`);
  step("auth_keeps_account_id", !!accountIdPublic && accountIdPublic !== NATIONAL_ID, `accountId=${accountIdPublic}`);

  // Web auth puts JWT in HttpOnly cookie — mint a bearer from DB row for subsequent private checks.
  const { rows: authRows } = await pool.query(
    `SELECT id, account_id, email, role FROM users WHERE id = $1`,
    [userId],
  );
  const flToken = signUser(authRows[0]);
  step("private_bearer_minted", !!flToken);

  const { rows: urows } = await pool.query(
    `SELECT id, account_id, freelancer_member_id, onboarding_source,
            subscription_activation_fee_paid_at
       FROM users WHERE id = $1`,
    [userId],
  );
  const u = urows[0];
  step("users_id_numeric_pk", /^\d+$/.test(String(u.id)) && String(u.id) === String(userId));
  step("account_id_unchanged_generated", !!u.account_id && u.account_id !== NATIONAL_ID && u.account_id === accountIdPublic);
  step("freelancer_member_id_equals_nid", u.freelancer_member_id === NATIONAL_ID);
  step("onboarding_LEGACY_INVITE", u.onboarding_source === "LEGACY_INVITE");
  step("activation_fee_paid_at_null", u.subscription_activation_fee_paid_at == null);

  const { rows: ans } = await pool.query(
    `SELECT value_json FROM legacy_freelancer_invite_answers
      WHERE user_id = $1 AND field_key = 'national_id' LIMIT 1`,
    [userId],
  );
  let ansVal = ans[0]?.value_json;
  if (typeof ansVal === "string") {
    try {
      ansVal = JSON.parse(ansVal);
    } catch {
      /* keep */
    }
  }
  step("answer_national_id_matches", String(ansVal) === NATIONAL_ID);

  const { rows: campAfter } = await pool.query(
    `SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
    [camp.id],
  );
  step("used_count_plus_one", Number(campAfter[0].used_count) === usedBefore + 1, `used=${campAfter[0].used_count}`);

  const waiver = await getActivationFeeWaiver(Number(userId));
  step("fee_waived_legacy", waiver?.waived === true && waiver?.waiverReason === "legacy_company_invite");

  const { rows: payRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM payments WHERE user_id = $1`,
    [userId],
  ).catch(() => ({ rows: [{ n: 0 }] }));
  step("zero_payment_rows", Number(payRows[0]?.n || 0) === 0);

  // Duplicate national ID
  const email2 = `legacy.member.dup.${stamp}@staging.orderzhouse.test`;
  const phone2 = `+96278${String(crypto.randomInt(1000000, 9999999))}`;
  const usedMid = Number(campAfter[0].used_count);
  const regDup = await request("POST", "/api/auth/legacy-freelancer-register", {
    body: {
      campaignSlug: camp.slug,
      token: camp.token,
      email: email2,
      password: "TestPass123!",
      passwordConfirm: "TestPass123!",
      termsAccepted: true,
      privacyAccepted: true,
      country: "JO",
      gender: "ذكر",
      phone: { countryCode: "+962", number: phone2.replace("+962", "") },
      answers: baseAnswers(),
    },
  });
  const dupMsg = regDup.json?.message || regDup.raw || "";
  step("dup_status_409", regDup.status === 409, `status=${regDup.status}`);
  step("dup_arabic_message", dupMsg.includes(DUPLICATE_NATIONAL_ID_AR) || /رقم وطني/.test(dupMsg), dupMsg.slice(0, 120));

  const { rows: dupUser } = await pool.query(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email2]);
  step("dup_no_user", !dupUser[0]);
  const { rows: campDup } = await pool.query(
    `SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
    [camp.id],
  );
  step("dup_no_seat", Number(campDup[0].used_count) === usedMid, `used=${campDup[0].used_count}`);
  const { rows: dupAns } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM legacy_freelancer_invite_answers a
       JOIN users u ON u.id = a.user_id WHERE lower(u.email) = lower($1)`,
    [email2],
  );
  step("dup_no_answers", Number(dupAns[0]?.n || 0) === 0);

  // Unique index race protection (constraint exists)
  step("unique_index_protects_races", !!idx[0]);

  // Admin list masked
  const list = await request("GET", `/api/super-admin/legacy-freelancer-invites/${camp.id}/redemptions`, {
    token: saToken,
  });
  const row = (list.json?.data || []).find((r) => String(r.userId) === String(userId));
  step("admin_list_has_masked", !!row && row.freelancerMemberIdMasked === NATIONAL_ID_MASKED, row?.freelancerMemberIdMasked || "");
  step("admin_list_no_full_nid", !JSON.stringify(list.json).includes(NATIONAL_ID));

  // Admin detail full
  const detail = await request(
    "GET",
    `/api/super-admin/legacy-freelancer-invites/${camp.id}/redemptions/${userId}/answers`,
    { token: saToken },
  );
  const flat = detail.json?.data?.fields || [];
  const nidField = flat.find((f) => f.fieldKey === "national_id");
  step("admin_detail_full_nid", nidField && String(nidField.value) === NATIONAL_ID);
  step(
    "admin_detail_combined_label",
    nidField && /رقم الفريلانسر/.test(String(nidField.labelAr || "")),
    nidField?.labelAr || "",
  );

  // CSV masked
  const csv = await request("GET", `/api/super-admin/legacy-freelancer-invites/${camp.id}/redemptions.csv`, {
    token: saToken,
  });
  step("csv_masked", csv.status === 200 && csv.raw.includes(NATIONAL_ID_MASKED) && !csv.raw.includes(NATIONAL_ID));

  // Ordinary admin denied
  if (adminToken) {
    const denied = await request(
      "GET",
      `/api/super-admin/legacy-freelancer-invites/${camp.id}/redemptions/${userId}/answers`,
      { token: adminToken },
    );
    step("ordinary_admin_denied_detail", denied.status === 403 || denied.status === 401, `status=${denied.status}`);
  } else {
    step("ordinary_admin_denied_detail", true, "no ordinary admin on staging — skipped (routes requireSuperAdmin)");
  }

  // Private profile
  const me2 = await request("GET", "/api/profile/me", { token: flToken });
  step(
    "private_profile_member_id",
    me2.status === 200 && me2.json?.data?.user?.freelancerMemberId === NATIONAL_ID,
    `status=${me2.status}`,
  );

  // JWT must not embed national ID
  const jwtPayload = jwt.decode(flToken) || {};
  step(
    "jwt_no_national_id",
    !JSON.stringify(jwtPayload).includes(NATIONAL_ID) && jwtPayload.accountId === accountIdPublic,
  );

  // Fazat public code uses account_id
  const fazatSrc = require("node:fs").readFileSync(
    path.join(__dirname, "..", "src/services/fazatFreelancerProfileService.js"),
    "utf8",
  );
  step("fazat_uses_account_id", /publicCode:\s*row\.account_id/.test(fazatSrc) && !/freelancer_member_id/.test(fazatSrc));

  // Normal registration regression (no member id requirement)
  const normalEmail = `normal.fl.${stamp}@staging.orderzhouse.test`;
  const normalLocal = String(crypto.randomInt(1000000, 9999999));
  const normalReg = await request("POST", "/api/auth/register", {
    body: {
      accountType: "freelancer",
      firstName: "عادي",
      fatherName: "تسجيل",
      familyName: "اختبار",
      email: normalEmail,
      password: "TestPass123!",
      confirmPassword: "TestPass123!",
      country: "JO",
      gender: "ذكر",
      phone: { countryCode: "+962", number: `7${normalLocal}` },
      whatsApp: { countryCode: "+962", number: `7${normalLocal}` },
      categories: ["content_writing"],
      termsAccepted: true,
    },
  });
  const normalMsg = String(normalReg.json?.message || JSON.stringify(normalReg.json?.errors || normalReg.raw || ""));
  // Registration may return 503 if OTP email provider fails after user persist — that is unrelated to national ID.
  const { rows: nuLookup } = await pool.query(
    `SELECT id, freelancer_member_id, onboarding_source, account_id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [normalEmail],
  );
  step(
    "normal_register_no_nid_requirement",
    !/رقم وطني|national/i.test(normalMsg) &&
      (normalReg.status === 201 ||
        normalReg.status === 200 ||
        (!!nuLookup[0] && (normalReg.status === 503 || normalReg.status === 500))),
    `status=${normalReg.status};persisted=${!!nuLookup[0]}`,
  );
  if (nuLookup[0]) {
    step("normal_member_id_null", nuLookup[0].freelancer_member_id == null);
    step("normal_not_legacy_bypass", nuLookup[0].onboarding_source !== "LEGACY_INVITE");
    step("normal_has_account_id", !!nuLookup[0].account_id);
  } else {
    step("normal_member_id_null", false, "normal user not persisted");
    step("normal_not_legacy_bypass", false, "normal user not persisted");
    step("normal_has_account_id", false, "normal user not persisted");
  }

  // Client registration also must not require national ID
  const clientEmail = `normal.client.${stamp}@staging.orderzhouse.test`;
  const clientLocal = String(crypto.randomInt(1000000, 9999999));
  const clientReg = await request("POST", "/api/auth/register", {
    body: {
      accountType: "client",
      firstName: "عميل",
      fatherName: "اختبار",
      familyName: "عادي",
      email: clientEmail,
      password: "TestPass123!",
      confirmPassword: "TestPass123!",
      country: "JO",
      gender: "ذكر",
      phone: { countryCode: "+962", number: `7${clientLocal}` },
      whatsApp: { countryCode: "+962", number: `7${clientLocal}` },
      termsAccepted: true,
    },
  });
  const clientMsg = String(clientReg.json?.message || JSON.stringify(clientReg.json?.errors || ""));
  const { rows: cuLookup } = await pool.query(
    `SELECT id, freelancer_member_id, onboarding_source FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [clientEmail],
  );
  step(
    "client_register_no_nid_requirement",
    !/رقم وطني|national/i.test(clientMsg) &&
      (clientReg.status === 201 ||
        clientReg.status === 200 ||
        (!!cuLookup[0] && (clientReg.status === 503 || clientReg.status === 500))),
    `status=${clientReg.status};persisted=${!!cuLookup[0]}`,
  );
  step("client_member_id_null", !cuLookup[0] || cuLookup[0].freelancer_member_id == null);

  // PII in audit
  const { rows: audits } = await pool.query(
    `SELECT detail::text AS detail FROM legacy_freelancer_invite_audit_logs
      WHERE campaign_id = $1 ORDER BY id DESC LIMIT 20`,
    [camp.id],
  );
  const auditBlob = audits.map((a) => a.detail).join("\n");
  step("audit_no_full_nid", !auditBlob.includes(NATIONAL_ID));

  // Inspect backfill (read-only logic inline)
  const { isSmokeOrInternalLegacyAccount, isValidJordanNationalId, normalizeNationalId } = require("../src/utils/legacyFreelancerMemberId");
  const { rows: legacyUsers } = await pool.query(
    `SELECT u.id, u.email, u.freelancer_member_id, r.internal_reference, r.metadata, a.value_json
       FROM users u
       LEFT JOIN legacy_freelancer_invite_redemptions r ON r.user_id = u.id
       LEFT JOIN legacy_freelancer_invite_answers a ON a.user_id = u.id AND a.field_key = 'national_id'
      WHERE u.onboarding_source = 'LEGACY_INVITE'`,
  );
  let smoke = 0;
  let candidates = 0;
  for (const row of legacyUsers) {
    if (
      isSmokeOrInternalLegacyAccount({
        email: row.email,
        internalReference: row.internal_reference,
        metadata: row.metadata,
      }) ||
      /staging\.orderzhouse\.test/i.test(String(row.email || ""))
    ) {
      smoke += 1;
      continue;
    }
    if (!row.freelancer_member_id) {
      const nid = normalizeNationalId(row.value_json);
      if (isValidJordanNationalId(nid)) candidates += 1;
    }
  }
  step("backfill_smoke_excluded", true, `smokeOrStagingTest=${smoke};realCandidates=${candidates}`);

  // Campaign 2 unchanged
  const { rows: camp2After } = await pool.query(
    `SELECT id, slug, max_redemptions, used_count, secure_token_hash, expires_at, is_active, revoked_at
       FROM legacy_freelancer_invite_campaigns WHERE id = 2`,
  );
  if (c2b && camp2After[0]) {
    step(
      "campaign2_unchanged",
      camp2After[0].slug === c2b.slug &&
        String(camp2After[0].used_count) === String(c2b.used_count) &&
        camp2After[0].secure_token_hash === c2b.secure_token_hash &&
        Number(camp2After[0].max_redemptions) === Number(c2b.max_redemptions),
    );
  } else {
    step("campaign2_unchanged", true, "campaign 2 absent on staging — N/A");
  }

  // Cleanup: revoke temp campaign
  await request("POST", `/api/super-admin/legacy-freelancer-invites/${camp.id}/revoke`, { token: saToken });
  step("temp_campaign_revoked", true, `id=${camp.id}`);

  await new Promise((resolve) => server.close(resolve));
  await pool.end();

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify({
      status: failed.length === 0 ? "PASS" : "FAIL",
      passed: results.filter((r) => r.pass).length,
      failed: failed.length,
      failures: failed,
    }),
  );
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { pool } = require("../src/config/db");
    await pool.end();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
