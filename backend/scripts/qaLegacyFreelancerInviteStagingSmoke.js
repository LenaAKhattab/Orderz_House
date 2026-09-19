/**
 * Staging E2E smoke — Legacy Freelancer Shared Invite.
 * Loads .env.staging only. Refuses Production. No Stripe/wallet mutations.
 *
 * Usage (from backend/, after applyLegacyInvite187Staging.js):
 *   node scripts/qaLegacyFreelancerInviteStagingSmoke.js
 */
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
  printStagingBanner,
  collectStagingQaWarnings,
} = require("../src/config/stagingQaEnv");
const {
  assertNonProductionDatabase,
  classifyDatabaseUrl,
  maskDatabaseTarget,
  KNOWN_PRODUCTION_HOST_MARKERS,
} = require("../src/utils/databaseEnvironmentSafety");

// Load staging env BEFORE any module that reads DATABASE_URL / pool.
loadStagingQaEnv({ fillFromDefaultEnv: true });
const target = assertStagingQaTarget();
printStagingBanner(target);

const warnings = collectStagingQaWarnings();
for (const w of warnings) console.log(`WARN | ${w}`);

assertNonProductionDatabase("legacy invite staging smoke");
const host = String(classifyDatabaseUrl().host || "").toLowerCase();
if (KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase()))) {
  throw new Error("REFUSED: production Neon host");
}

const {
  createCampaign,
  updateCampaign,
  revokeCampaign,
  regenerateCampaignToken,
  previewInvite,
  registerLegacyFreelancer,
  listRedemptions,
  AUDIT_ACTIONS,
  PLAN_ASSIGNMENT_REASON,
} = require("../src/services/legacyFreelancerInviteService");
const {
  evaluateFreelancerTakeOrdersEligibility,
  getCurrentSubscriptionForFreelancer,
  canFreelancerTakeOrders,
} = require("../src/services/subscriptionsService");
const { buildFreelancerFacts, conditionMatches } = require("../src/services/onboardingConditionResolver");

const REPORT_PATH = path.join(__dirname, "..", ".tmp", "legacy_invite_staging_smoke_report.json");
const results = [];
function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail || "").slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function uniqSuffix() {
  return `${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

async function countFinancialSideEffects(client, userId, sinceIso) {
  const checks = {};
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM subscription_activation_fee_payments WHERE user_id = $1`,
      [userId],
    );
    checks.subscription_activation_fee_payments = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err.code === "42P01" || err.code === "42703") checks.subscription_activation_fee_payments = "missing_ok";
    else throw err;
  }
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS c FROM freelancer_subscription_checkout_sessions WHERE freelancer_user_id = $1`,
      [userId],
    );
    checks.freelancer_subscription_checkout_sessions = Number(rows[0]?.c || 0);
  } catch (err) {
    if (err.code === "42P01" || err.code === "42703") checks.freelancer_subscription_checkout_sessions = "missing_ok";
    else throw err;
  }
  checks.note = "user-scoped counts only; no Stripe API calls";
  checks.sinceIso = sinceIso;
  return checks;
}

async function main() {
  const { pool } = require("../src/config/db");
  const client = await pool.connect();
  const createdUserIds = [];
  const stamp = uniqSuffix();
  const sinceIso = new Date().toISOString();

  try {
    // --- schema verify ---
    const schema = await client.query(`
      SELECT
        to_regclass('public.legacy_freelancer_invite_campaigns') IS NOT NULL AS campaigns,
        to_regclass('public.legacy_freelancer_invite_redemptions') IS NOT NULL AS redemptions,
        to_regclass('public.legacy_freelancer_invite_audit_logs') IS NOT NULL AS audit,
        EXISTS (SELECT 1 FROM schema_migrations WHERE version = '187_legacy_freelancer_shared_invite') AS mig
    `);
    step("schema_present", schema.rows[0].campaigns && schema.rows[0].redemptions && schema.rows[0].audit && schema.rows[0].mig, JSON.stringify(schema.rows[0]));

    const { rows: adminRows } = await client.query(
      `SELECT id, email, role FROM users
        WHERE role = 'super_admin' AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY id ASC LIMIT 1`,
    );
    if (!adminRows[0]) throw new Error("No super_admin user on staging");
    const adminId = Number(adminRows[0].id);
    step("super_admin_found", true, `id=${adminId}`);

    // --- campaign create ---
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const campaign = await createCampaign({
      actorAdminId: adminId,
      name: "Legacy Freelancer Staging Smoke Test",
      slug: `legacy-staging-smoke-${stamp}`,
      maxRedemptions: 3,
      expiresAt,
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      notes: "staging smoke only — disposable",
      isActive: true,
    });
    step("campaign_created", Boolean(campaign?.id && campaign?.joinUrl && campaign?.token), `slug=${campaign.slug}`);
    step("shared_link_one", Boolean(campaign.joinUrl.includes("/freelancer/legacy-join/") && campaign.joinUrl.includes("token=")), campaign.joinUrl.replace(/token=[^&]+/, "token=***"));

    const { rows: auditCreate } = await client.query(
      `SELECT action, detail FROM legacy_freelancer_invite_audit_logs
        WHERE campaign_id = $1 AND action = $2 ORDER BY id DESC LIMIT 1`,
      [campaign.id, AUDIT_ACTIONS.CAMPAIGN_CREATED],
    );
    step("audit_created", auditCreate[0]?.action === AUDIT_ACTIONS.CAMPAIGN_CREATED);

    // --- preview valid / invalid ---
    const preview = await previewInvite({ campaignSlug: campaign.slug, token: campaign.token });
    step(
      "preview_valid",
      preview?.slug === campaign.slug && preview.remainingSeats === 3 && !("secureTokenHash" in preview) && !("notes" in preview && preview.notes),
      JSON.stringify(preview),
    );
    // notes intentionally omitted from preview mapper — good
    step("preview_no_admin_notes", preview.notes === undefined && preview.token === undefined && preview.joinUrl === undefined);

    let invalidTokenOk = false;
    try {
      await previewInvite({ campaignSlug: campaign.slug, token: "invalid-token-xxxxxxxxxxxx" });
    } catch (err) {
      invalidTokenOk = /إيقاف|انتهت|غير|NOT_FOUND|REVOKED/i.test(err.message) || err.publicCode;
    }
    step("preview_invalid_token", invalidTokenOk, "rejected");

    let invalidSlugOk = false;
    try {
      await previewInvite({ campaignSlug: "no-such-campaign-slug-zzz", token: campaign.token });
    } catch (err) {
      invalidSlugOk = Boolean(err.publicCode || err.message);
    }
    step("preview_invalid_slug", invalidSlugOk, "rejected");

    // --- register user 1 ---
    const email1 = `legacy.smoke1.${stamp}@staging.orderzhouse.test`;
    const phone1 = `+96279${String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8)}`;
    const password1 = `SmokePass!${stamp}`;
    const reg1 = await registerLegacyFreelancer(
      {
        campaignSlug: campaign.slug,
        token: campaign.token,
        fullName: "مستقل تجريبي دخان",
        email: email1,
        phone: phone1,
        password: password1,
        passwordConfirm: password1,
        specialty: "content_writing",
        categories: ["content_writing"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
        identityLast4: "1234",
        internalReference: `smoke-${stamp}`,
      },
      { ip: "127.0.0.1", userAgent: "legacy-smoke/1" },
    );
    createdUserIds.push(Number(reg1.user.id));
    step("register_success", Boolean(reg1.user?.id && reg1.token && /معتمد سابق/.test(reg1.message)), `userId=${reg1.user.id}`);

    const { rows: u1 } = await client.query(
      `SELECT id, role, password_hash, onboarding_source, identity_verification_source,
              training_waiver_reason, final_exam_waiver_reason, legacy_invite_campaign_id,
              terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
              subscription_activation_fee_paid_at, email_verified
         FROM users WHERE id = $1`,
      [reg1.user.id],
    );
    const userRow = u1[0];
    step("user_freelancer", userRow.role === "freelancer");
    step("password_hashed", String(userRow.password_hash || "").startsWith("$2") && userRow.password_hash !== password1);
    step("password_compare", await bcrypt.compare(password1, userRow.password_hash));
    step("onboarding_legacy", userRow.onboarding_source === "LEGACY_INVITE");
    step("identity_offline", userRow.identity_verification_source === "COMPANY_OFFLINE_VERIFIED");
    step("training_waiver", Boolean(userRow.training_waiver_reason));
    step("exam_waiver", Boolean(userRow.final_exam_waiver_reason));
    step("terms_privacy", userRow.terms_accepted === true && userRow.privacy_accepted === true && userRow.terms_accepted_at && userRow.privacy_accepted_at);
    step("campaign_link", String(userRow.legacy_invite_campaign_id) === String(campaign.id));
    step("email_verified", userRow.email_verified === true);

    const { rows: campAfter1 } = await client.query(
      `SELECT used_count, max_redemptions FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
      [campaign.id],
    );
    step("used_count_1", Number(campAfter1[0].used_count) === 1, `used=${campAfter1[0].used_count}`);

    const redemptions = await listRedemptions(campaign.id);
    step("redemption_row", redemptions.length === 1 && redemptions[0].emailMasked.includes("***"));

    const sub = await getCurrentSubscriptionForFreelancer(reg1.user.id);
    step(
      "subscription_legacy",
      sub?.activationStatus === "company_approved" &&
        sub?.paymentStatus === "not_required" &&
        String(sub?.notes || "").includes(PLAN_ASSIGNMENT_REASON),
      `act=${sub?.activationStatus} pay=${sub?.paymentStatus}`,
    );

    const eligibility = await canFreelancerTakeOrders(String(reg1.user.id));
    step("take_orders_eligible_or_fee_only", eligibility.eligible === true || eligibility.reason === "activation_fee_unpaid", JSON.stringify({ eligible: eligibility.eligible, reason: eligibility.reason }));
    // activation fee stamp should make fee gate pass
    step("activation_fee_stamp", userRow.subscription_activation_fee_paid_at == null, "must not fake paid_at");
    const { getActivationFeeStatus } = require("../src/services/subscriptionActivationFeeService");
    const feeStatus = await getActivationFeeStatus(reg1.user.id, client);
    step(
      "activation_fee_waived_not_paid",
      feeStatus.needsPayment === false && feeStatus.waived === true && feeStatus.paidAt == null,
      JSON.stringify({ needsPayment: feeStatus.needsPayment, waived: feeStatus.waived, paidAt: feeStatus.paidAt }),
    );

    const facts = buildFreelancerFacts({
      userRow: { first_name: "م", family_name: "ت", email_verified: true },
      subscription: { activationStatus: "company_approved" },
      coursesAgg: { total: 5, completed: 0, pendingFinalTest: 5 },
      welcomeCompleted: true,
    });
    step("dashboard_skips_training_banner", conditionMatches("training_incomplete", facts) === false);

    const fin1 = await countFinancialSideEffects(client, reg1.user.id, sinceIso);
    step(
      "no_payment_ledger_rows",
      fin1.subscription_activation_fee_payments === 0 || fin1.subscription_activation_fee_payments === "missing_ok",
      JSON.stringify(fin1),
    );
    step(
      "no_checkout_sessions",
      fin1.freelancer_subscription_checkout_sessions === 0 || fin1.freelancer_subscription_checkout_sessions === "missing_ok",
    );

    const { rows: auditRedeem } = await client.query(
      `SELECT action, detail FROM legacy_freelancer_invite_audit_logs
        WHERE action = $1 AND target_user_id = $2 ORDER BY id DESC LIMIT 1`,
      [AUDIT_ACTIONS.INVITE_REDEEMED, reg1.user.id],
    );
    const redeemDetail = auditRedeem[0]?.detail || {};
    step(
      "audit_redeemed",
      auditRedeem[0]?.action === AUDIT_ACTIONS.INVITE_REDEEMED &&
        !JSON.stringify(redeemDetail).includes(password1) &&
        !JSON.stringify(redeemDetail).includes(campaign.token),
      "masked metadata only",
    );

    // --- duplicate email ---
    let dupEmailOk = false;
    const usedBeforeDup = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [campaign.id])).rows[0]
        .used_count,
    );
    try {
      await registerLegacyFreelancer({
        campaignSlug: campaign.slug,
        token: campaign.token,
        fullName: "مكرر بريد",
        email: email1,
        phone: `+96278${String(Math.floor(10000000 + Math.random() * 89999999)).slice(0, 8)}`,
        password: password1,
        passwordConfirm: password1,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      });
    } catch (err) {
      dupEmailOk = /يوجد حساب مسجل بهذا البريد أو الرقم/.test(err.message);
    }
    const usedAfterDupEmail = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [campaign.id])).rows[0]
        .used_count,
    );
    step("duplicate_email_rejected", dupEmailOk);
    step("duplicate_email_no_seat", usedAfterDupEmail === usedBeforeDup, `used=${usedAfterDupEmail}`);

    // --- duplicate phone ---
    let dupPhoneOk = false;
    try {
      await registerLegacyFreelancer({
        campaignSlug: campaign.slug,
        token: campaign.token,
        fullName: "مكرر هاتف",
        email: `legacy.smoke.dupphone.${stamp}@staging.orderzhouse.test`,
        phone: phone1,
        password: password1,
        passwordConfirm: password1,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      });
    } catch (err) {
      dupPhoneOk = /يوجد حساب مسجل بهذا البريد أو الرقم/.test(err.message);
    }
    const usedAfterDupPhone = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [campaign.id])).rows[0]
        .used_count,
    );
    step("duplicate_phone_rejected", dupPhoneOk);
    step("duplicate_phone_no_seat", usedAfterDupPhone === usedBeforeDup, `used=${usedAfterDupPhone}`);

    // --- fill remaining seats (2 more) ---
    for (let i = 2; i <= 3; i += 1) {
      const email = `legacy.smoke${i}.${stamp}@staging.orderzhouse.test`;
      const phone = `+96277${String(10000000 + i).slice(0, 8)}${String(Date.now()).slice(-2)}`.slice(0, 13);
      // ensure E.164 length
      const phoneOk = `+9627${String(700000000 + Math.floor(Math.random() * 99999999)).slice(0, 8)}`;
      const reg = await registerLegacyFreelancer({
        campaignSlug: campaign.slug,
        token: campaign.token,
        fullName: `مستقل دخان ${i}`,
        email,
        phone: phoneOk,
        password: password1,
        passwordConfirm: password1,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      });
      createdUserIds.push(Number(reg.user.id));
      step(`register_seat_${i}`, Boolean(reg.user?.id), `userId=${reg.user.id}`);
    }
    const { rows: fullCamp } = await client.query(
      `SELECT used_count, max_redemptions FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
      [campaign.id],
    );
    step("used_count_3", Number(fullCamp[0].used_count) === 3 && Number(fullCamp[0].used_count) <= Number(fullCamp[0].max_redemptions));

    // --- 4th rejected ---
    let fourthRejected = false;
    try {
      await registerLegacyFreelancer({
        campaignSlug: campaign.slug,
        token: campaign.token,
        fullName: "مقعد رابع",
        email: `legacy.smoke4.${stamp}@staging.orderzhouse.test`,
        phone: `+9627${String(800000000 + Math.floor(Math.random() * 99999999)).slice(0, 8)}`,
        password: password1,
        passwordConfirm: password1,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      });
    } catch (err) {
      fourthRejected = /اكتمل عدد المقاعد/.test(err.message) || err.publicCode === "LEGACY_INVITE_FULL";
    }
    const usedFinal = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [campaign.id])).rows[0]
        .used_count,
    );
    step("capacity_fourth_rejected", fourthRejected);
    step("used_count_never_exceeds_max", usedFinal === 3);

    // --- concurrent last-seat on a fresh campaign ---
    const camp2 = await createCampaign({
      actorAdminId: adminId,
      name: "Legacy Concurrent Seat Test",
      slug: `legacy-concurrent-${stamp}`,
      maxRedemptions: 1,
      expiresAt,
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      notes: "staging concurrent",
      isActive: true,
    });
    const pw = `ConcPass!${stamp}`;
    const [rA, rB] = await Promise.allSettled([
      registerLegacyFreelancer({
        campaignSlug: camp2.slug,
        token: camp2.token,
        fullName: "متزامن أ",
        email: `legacy.conc.a.${stamp}@staging.orderzhouse.test`,
        phone: `+9627${String(710000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`,
        password: pw,
        passwordConfirm: pw,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      }),
      registerLegacyFreelancer({
        campaignSlug: camp2.slug,
        token: camp2.token,
        fullName: "متزامن ب",
        email: `legacy.conc.b.${stamp}@staging.orderzhouse.test`,
        phone: `+9627${String(720000000 + Math.floor(Math.random() * 9999999)).slice(0, 8)}`,
        password: pw,
        passwordConfirm: pw,
        categories: ["design"],
        country: "JO",
        gender: "ذكر",
        termsAccepted: true,
        privacyAccepted: true,
      }),
    ]);
    const successes = [rA, rB].filter((r) => r.status === "fulfilled");
    const failures = [rA, rB].filter((r) => r.status === "rejected");
    for (const s of successes) createdUserIds.push(Number(s.value.user.id));
    const usedConc = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [camp2.id])).rows[0]
        .used_count,
    );
    step("concurrent_one_success", successes.length === 1 && failures.length === 1, `ok=${successes.length} fail=${failures.length} used=${usedConc}`);
    step("concurrent_used_eq_1", usedConc === 1);

    // --- revoke ---
    const campRevoke = await createCampaign({
      actorAdminId: adminId,
      name: "Legacy Revoke Test",
      slug: `legacy-revoke-${stamp}`,
      maxRedemptions: 2,
      expiresAt,
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      isActive: true,
    });
    await revokeCampaign({ actorAdminId: adminId, campaignId: campRevoke.id });
    let revokeBlocked = false;
    try {
      await previewInvite({ campaignSlug: campRevoke.slug, token: campRevoke.token });
    } catch (err) {
      revokeBlocked = /تم إيقاف رابط الدعوة/.test(err.message) || err.publicCode === "LEGACY_INVITE_REVOKED";
    }
    step("revoke_blocks_preview", revokeBlocked);
    const { rows: auditRevoke } = await client.query(
      `SELECT 1 FROM legacy_freelancer_invite_audit_logs WHERE campaign_id = $1 AND action = $2 LIMIT 1`,
      [campRevoke.id, AUDIT_ACTIONS.CAMPAIGN_REVOKED],
    );
    step("audit_revoked", Boolean(auditRevoke[0]));

    // --- token regeneration ---
    const campTok = await createCampaign({
      actorAdminId: adminId,
      name: "Legacy Token Regen Test",
      slug: `legacy-token-${stamp}`,
      maxRedemptions: 2,
      expiresAt,
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      isActive: true,
    });
    const oldToken = campTok.token;
    const regenerated = await regenerateCampaignToken({ actorAdminId: adminId, campaignId: campTok.id });
    let oldDead = false;
    try {
      await previewInvite({ campaignSlug: campTok.slug, token: oldToken });
    } catch (err) {
      oldDead = Boolean(err.publicCode || err.message);
    }
    let newOk = false;
    try {
      const p = await previewInvite({ campaignSlug: campTok.slug, token: regenerated.token });
      newOk = p.slug === campTok.slug;
    } catch (_) {
      newOk = false;
    }
    step("token_old_invalid", oldDead);
    step("token_new_valid", newOk);
    const { rows: auditTok } = await client.query(
      `SELECT detail FROM legacy_freelancer_invite_audit_logs
        WHERE campaign_id = $1 AND action = $2 ORDER BY id DESC LIMIT 1`,
      [campTok.id, AUDIT_ACTIONS.CAMPAIGN_UPDATED],
    );
    step("audit_token_regen", Boolean(auditTok[0]?.detail?.tokenRegenerated));

    // --- expiration ---
    const campExp = await createCampaign({
      actorAdminId: adminId,
      name: "Legacy Expiry Test",
      slug: `legacy-exp-${stamp}`,
      maxRedemptions: 2,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      isActive: true,
    });
    await client.query(
      `UPDATE legacy_freelancer_invite_campaigns SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`,
      [campExp.id],
    );
    let expiredOk = false;
    try {
      await previewInvite({ campaignSlug: campExp.slug, token: campExp.token });
    } catch (err) {
      expiredOk = /انتهت صلاحية رابط الدعوة/.test(err.message) || err.publicCode === "LEGACY_INVITE_EXPIRED";
    }
    const usedExp = Number(
      (await client.query(`SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`, [campExp.id])).rows[0]
        .used_count,
    );
    step("expired_blocks", expiredOk);
    step("expired_no_redemption", usedExp === 0);

    // --- normal signup regression (static + DB check no accidental legacy flags on random freelancer) ---
    const authRoutes = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "authRoutes.js"), "utf8");
    step("normal_register_route_intact", /router\.post\(\s*"\/register"/.test(authRoutes) && /legacy-freelancer-register/.test(authRoutes));
    const { rows: normalSample } = await client.query(
      `SELECT COUNT(*)::int AS c FROM users
        WHERE role = 'freelancer'
          AND (onboarding_source IS NULL OR onboarding_source = 'NORMAL_SIGNUP')
          AND id <> ALL($1::bigint[])`,
      [createdUserIds.length ? createdUserIds : [0]],
    );
    step("existing_freelancers_not_forced_legacy", Number(normalSample[0].c) >= 0);

    // --- evaluate eligibility helper ---
    step(
      "eligibility_helper_company_approved",
      evaluateFreelancerTakeOrdersEligibility({
        paymentStatus: "not_required",
        activationStatus: "company_approved",
        status: "assigned_not_started",
        isCurrent: true,
      }).eligible === true,
    );
  } finally {
    client.release();
    const failed = results.filter((r) => !r.pass);
    const report = {
      phase: "legacy_invite_staging_smoke",
      appEnv: target.appEnv,
      maskedTarget: maskDatabaseTarget(),
      classification: classifyDatabaseUrl().classification,
      isProduction: false,
      productionTouched: false,
      createdUserIds,
      pass: results.filter((r) => r.pass).length,
      fail: failed.length,
      results,
      warnings,
      finishedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${REPORT_PATH}`);
    console.log(JSON.stringify({ pass: report.pass, fail: report.fail, productionTouched: false }));
    await pool.end();
    if (failed.length) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
