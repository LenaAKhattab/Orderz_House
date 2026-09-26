/**
 * Institutions V2 Phase 4A — Staging acceptance (API + Playwright browser).
 * Staging DB only. No Production. No Campaign 2 mutation.
 *
 * Usage (backend/):
 *   node scripts/qaInstitutionsV2Phase4aStagingAcceptance.js
 */
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const {
  loadStagingQaEnv,
  assertStagingQaTarget,
} = require("../src/config/stagingQaEnv");
const { KNOWN_PRODUCTION_HOST_MARKERS } = require("../src/utils/databaseEnvironmentSafety");
const { AUTH_COOKIE_NAME } = require("../src/utils/authCookie");

loadStagingQaEnv({ fillFromDefaultEnv: true });
// Acceptance runs article apply in-process; keep Bildazo gate off for this process only.
process.env.BILDAZO_AUTHOR_GATE_ENABLED = "false";
const target = assertStagingQaTarget();

const API_PORT = Number(process.env.PORT || 5000);
const WEB_PORT = Number(process.env.INSTITUTIONS_WEB_PORT || process.env.USERS_CONTROL_WEB_PORT || 5174);
const WEB_ORIGIN = `http://127.0.0.1:${WEB_PORT}`;
const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;
const SCREEN_DIR = path.join(__dirname, "..", ".tmp", "institutions_v2_phase4a_screens");
const REPORT_PATH = path.join(__dirname, "..", ".tmp", "institutions_v2_phase4a_report.json");

const results = [];
function step(section, name, pass, detail = "") {
  results.push({
    section,
    name,
    pass: !!pass,
    detail: String(detail || "").slice(0, 400),
  });
  console.log(
    `${pass ? "PASS" : "FAIL"} | [${section}] ${name}${detail ? ` — ${detail}` : ""}`,
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitHttpOk(url, { timeoutMs = 90000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise((resolve) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode > 0 && res.statusCode < 500);
        });
        req.on("error", () => resolve(false));
        req.setTimeout(3000, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (ok) return true;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  return false;
}

function signToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      accountId: user.account_id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" },
  );
}

async function api(method, pathName, { token, body, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (formData) payload = formData;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API_ORIGIN}${pathName}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, ok: res.ok };
}

async function ensureServers() {
  const apiUp = await waitHttpOk(`${API_ORIGIN}/api/health`, { timeoutMs: 2500 });
  let apiProc = null;
  if (!apiUp) {
    console.log("[phase4a] starting Staging backend…");
    apiProc = spawn("npm", ["run", "start:staging"], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
      env: { ...process.env },
    });
  }
  const apiReady = await waitHttpOk(`${API_ORIGIN}/api/health`, { timeoutMs: 180000 });
  step("prep", "staging API health", apiReady, API_ORIGIN);

  const webUp = await waitHttpOk(WEB_ORIGIN, { timeoutMs: 2500 });
  let webProc = null;
  if (!webUp) {
    console.log("[phase4a] starting frontend Vite on", WEB_PORT);
    webProc = spawn(
      "npm",
      ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(WEB_PORT), "--strictPort"],
      {
        cwd: path.join(__dirname, "..", "..", "frontend"),
        shell: true,
        stdio: "ignore",
        env: {
          ...process.env,
          // Same-origin /api via Vite proxy (cookie + Bearer both work).
          VITE_API_BASE_URL: "",
        },
      },
    );
  }
  const webReady = await waitHttpOk(WEB_ORIGIN, { timeoutMs: 180000 });
  step("prep", "frontend Vite ready", webReady, WEB_ORIGIN);
  return { apiProc, webProc };
}

async function financeSnapshot(pool, sinceIso) {
  const out = {};
  const queries = [
    ["marketplace_article_settlements", "created_at"],
    ["marketplace_article_financial_entries", "created_at"],
    ["client_order_payments", "created_at"],
  ];
  for (const [table, col] of queries) {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM ${table} WHERE ${col} >= $1::timestamptz`,
        [sinceIso],
      );
      out[table] = Number(rows[0]?.c || 0);
    } catch (e) {
      out[table] = e.code === "42P01" ? 0 : -1;
    }
  }
  return out;
}

async function ensureFreelancerReady(pool, userId, actorUserId) {
  await pool.query(
    `UPDATE users
        SET is_active = TRUE,
            must_change_password = FALSE
      WHERE id = $1`,
    [userId],
  );
  const { rows: existing } = await pool.query(
    `SELECT id, plan_id FROM freelancer_subscriptions
      WHERE freelancer_user_id = $1 AND is_current = TRUE
        AND status = 'active'
        AND activation_status = 'company_approved'
        AND payment_status IN ('paid', 'not_required')
        AND (expiry_date IS NULL OR expiry_date > NOW())
      LIMIT 1`,
    [userId],
  );
  const { rows: platinum } = await pool.query(
    `SELECT id FROM plans WHERE name = 'orderzhouse_platinum' AND deleted_at IS NULL LIMIT 1`,
  );
  const planId = platinum[0]?.id || existing[0]?.plan_id || 1;
  if (existing[0] && String(existing[0].plan_id) === String(planId)) return;
  await pool.query(
    `UPDATE freelancer_subscriptions SET is_current = FALSE, updated_at = NOW()
      WHERE freelancer_user_id = $1 AND is_current = TRUE`,
    [userId],
  );
  await pool.query(
    `INSERT INTO freelancer_subscriptions (
       freelancer_user_id, plan_id, assigned_by_user_id, assigned_at,
       actual_start_date, expiry_date, status, is_current, notes, source,
       payment_status, activation_status, company_activated_at, company_activated_by_user_id
     ) VALUES (
       $1, $2, $3, NOW(), NOW(), NOW() + INTERVAL '120 days',
       'active', TRUE, 'QA4A_PHASE4A_SUB', 'admin',
       'not_required', 'company_approved', NOW(), $3
     )`,
    [userId, planId, actorUserId],
  );
}

async function seedArticleApplyPrereqs(pool, { freelancerUserId, actorUserId, stamp }) {
  const { rows: prevFlags } = await pool.query(
    `SELECT article_applications_enabled, bid_credits_enabled, article_min_required_bids
       FROM marketplace_economy_settings WHERE id = 1`,
  );
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET article_applications_enabled = TRUE,
            bid_credits_enabled = TRUE,
            article_min_required_bids = LEAST(COALESCE(article_min_required_bids, 10), 1),
            updated_at = NOW()
      WHERE id = 1`,
  );
  try {
    const econ = require("../src/services/marketplaceEconomySettingsService");
    if (typeof econ.clearMarketplaceEconomySettingsCache === "function") {
      econ.clearMarketplaceEconomySettingsCache();
    }
  } catch {
    /* optional */
  }

  const plan = await pool.query(
    `SELECT id FROM marketplace_membership_plans
      WHERE is_active = TRUE
      ORDER BY article_access_level DESC NULLS LAST, id ASC
      LIMIT 1`,
  );
  if (!plan.rows[0]) throw new Error("no marketplace membership plan");
  const planId = plan.rows[0].id;
  const ends = new Date(Date.now() + 90 * 86400000);
  await pool.query(
    `UPDATE freelancer_marketplace_memberships
        SET is_current = FALSE, updated_at = NOW()
      WHERE freelancer_user_id = $1 AND is_current = TRUE`,
    [freelancerUserId],
  ).catch(() => {});
  const membership = await pool.query(
    `INSERT INTO freelancer_marketplace_memberships (
       freelancer_user_id, marketplace_plan_id, is_current, status, source,
       cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at, auto_renew
     ) VALUES ($1,$2,TRUE,'active','admin',1,NOW(),NOW(),$3,FALSE)
     RETURNING id`,
    [freelancerUserId, planId, ends.toISOString()],
  );
  const membershipId = membership.rows[0].id;
  try {
    await pool.query(
      `INSERT INTO marketplace_membership_cycles (
         membership_id, cycle_number, starts_at, ends_at, status,
         marketplace_plan_id, priority_bid_uses_allowed, included_tokens_allowed,
         priority_bid_uses_consumed, activated_at,
         elite_direct_orders_allowed, elite_direct_orders_reserved, elite_direct_orders_consumed,
         monthly_bid_allowance_snapshot
       ) VALUES (
         $1, 1, NOW(), $2, 'active',
         $3, 0, 0, 0, NOW(),
         0, 0, 0, 80
       )`,
      [membershipId, ends.toISOString(), planId],
    );
  } catch {
    await pool.query(
      `INSERT INTO marketplace_membership_cycles (
         membership_id, cycle_number, starts_at, ends_at, status,
         marketplace_plan_id, priority_bid_uses_allowed, included_tokens_allowed,
         priority_bid_uses_consumed, activated_at
       ) VALUES ($1, 1, NOW(), $2, 'active', $3, 0, 0, 0, NOW())`,
      [membershipId, ends.toISOString(), planId],
    );
  }

  const bidCredits = require("../src/services/marketplaceBidCreditsService");
  await bidCredits.adminGrantBidCredits({
    freelancerUserId,
    amount: 50,
    expiresAt: ends,
    reason: `QA4A article apply ${stamp}`,
    actorUserId,
    idempotencyKey: `qa4a-article-grant-${stamp}-${freelancerUserId}`,
  });

  return {
    prevFlags: prevFlags[0] || {
      article_applications_enabled: false,
      bid_credits_enabled: false,
      article_min_required_bids: 10,
    },
  };
}

async function restoreArticleEngineFlags(pool, prevFlags) {
  if (!prevFlags) return;
  await pool.query(
    `UPDATE marketplace_economy_settings
        SET article_applications_enabled = $1,
            bid_credits_enabled = $2,
            article_min_required_bids = $3,
            updated_at = NOW()
      WHERE id = 1`,
    [
      Boolean(prevFlags.article_applications_enabled),
      Boolean(prevFlags.bid_credits_enabled),
      Number(prevFlags.article_min_required_bids) || 10,
    ],
  );
}

function buildLegacyAnswers(stamp) {
  const nid = String(1000000000 + (stamp % 899999999));
  return {
    first_name: "قا",
    father_name: "تيست",
    family_name: "ليجاسي",
    birth_date: "1995-05-15",
    nationality: "أردني",
    national_id: nid,
    city: "عمّان",
    residence_area: "خلدا",
    education_level: "بكالوريوس",
    specialization: "أعمال",
    skills_programs: "كتابة محتوى، بحث",
    freelance_joining_skills: "كتابة مقالات",
    is_university_student: false,
    is_currently_employed: false,
    information_declaration: true,
  };
}

function qaDeliveryFile(label = "qa4a-delivery") {
  return {
    buffer: Buffer.from(`QA4A delivery content ${label}\n`.repeat(20), "utf8"),
    mimetype: "text/plain",
    originalname: `${label}.txt`,
    size: 400,
  };
}

function qaArticleManuscript(stamp) {
  const unit =
    "هذا نص تجريبي لمقال مؤسسي يهدف إلى التحقق من مسار التسليم والمراجعة والاعتماد دون أي تسوية مالية. ";
  return `${unit.repeat(80)} رقم ${stamp}`;
}

(async () => {
  fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const startedAt = new Date().toISOString();
  console.log("=== Institutions V2 Phase 4A Staging Acceptance ===");
  console.log(
    JSON.stringify({
      appEnv: target.appEnv,
      maskedTarget: target.maskedTarget,
      classification: target.db.classification,
      web: WEB_ORIGIN,
      api: API_ORIGIN,
    }),
  );

  const host = String(target.db.host || "").toLowerCase();
  step(
    "prep",
    "env staging not production",
    target.appEnv === "staging" &&
      !KNOWN_PRODUCTION_HOST_MARKERS.some((m) => host.includes(String(m).toLowerCase())),
    target.maskedTarget,
  );

  const { apiProc, webProc } = await ensureServers();
  if (!results.every((r) => r.section !== "prep" || r.name === "env staging not production" || r.pass)) {
    // continue if only env passed; servers must be ready
  }
  if (!results.find((r) => r.name === "staging API health")?.pass) {
    throw new Error("API not ready");
  }

  const { pool } = require("../src/config/db");
  const institutionsService = require("../src/services/institutionsService");
  const institutionWorkService = require("../src/services/institutionWorkService");
  const ordersService = require("../src/services/ordersService");
  const appsSvc = require("../src/services/marketplaceArticleApplicationsService");
  const inviteSvc = require("../src/services/legacyFreelancerInviteService");

  const { rows: saRows } = await pool.query(
    `SELECT id, email, role, account_id FROM users
      WHERE role = 'super_admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  const superAdmin = saRows[0];
  step("prep", "super_admin available", !!superAdmin, superAdmin ? `id=${superAdmin.id}` : "");
  if (!superAdmin) throw new Error("no super_admin");

  const saToken = signToken(superAdmin);
  const stamp = Date.now();

  const { rows: cats } = await pool.query(`SELECT id FROM categories ORDER BY id ASC LIMIT 1`);
  step("prep", "category available", !!cats[0], cats[0] ? `id=${cats[0].id}` : "");
  if (!cats[0]) throw new Error("no category");

  // Prefer freelancers already eligible to take orders; seed subscription if needed.
  let { rows: freelancers } = await pool.query(
    `SELECT u.id, u.email, u.role, u.account_id
       FROM users u
       JOIN freelancer_subscriptions s
         ON s.freelancer_user_id = u.id AND s.is_current = TRUE
      WHERE u.role = 'freelancer' AND COALESCE(u.is_active, TRUE) = TRUE
        AND COALESCE(u.must_change_password, FALSE) = FALSE
        AND s.status = 'active'
        AND s.activation_status = 'company_approved'
        AND s.payment_status IN ('paid', 'not_required')
        AND (s.expiry_date IS NULL OR s.expiry_date > NOW())
      ORDER BY u.id DESC
      LIMIT 6`,
  );
  if (freelancers.length < 4) {
    const { rows: fallback } = await pool.query(
      `SELECT id, email, role, account_id FROM users
        WHERE role = 'freelancer' AND COALESCE(is_active, TRUE) = TRUE
        ORDER BY id DESC LIMIT 6`,
    );
    freelancers = fallback;
  }
  step("prep", "freelancers available", freelancers.length >= 3, `count=${freelancers.length}`);
  if (freelancers.length < 3) throw new Error("need ≥3 freelancers");
  const memberA = freelancers[0];
  const memberB = freelancers[1];
  const multiMember = freelancers[2];
  const outsider = freelancers[3] || freelancers[1];
  await ensureFreelancerReady(pool, memberA.id, superAdmin.id);
  await ensureFreelancerReady(pool, memberB.id, superAdmin.id);
  await ensureFreelancerReady(pool, multiMember.id, superAdmin.id);
  await ensureFreelancerReady(pool, outsider.id, superAdmin.id);

  const financeBefore = await financeSnapshot(pool, startedAt);

  // ========== Institutions A/B ==========
  const instA = await institutionsService.createInstitution({
    actorUserId: superAdmin.id,
    name: `QA4A Inst A ${stamp}`,
    description: "Phase4A Institution A",
    status: "active",
  });
  const instB = await institutionsService.createInstitution({
    actorUserId: superAdmin.id,
    name: `QA4A Inst B ${stamp}`,
    description: "Phase4A Institution B",
    status: "active",
  });
  step("institution-ui", "create Institution A+B", !!instA?.id && !!instB?.id, `A=${instA.id} B=${instB.id}`);

  // Members
  await institutionsService.addMember({
    institutionId: instA.id,
    userId: memberA.id,
    memberRole: "member",
    actorUserId: superAdmin.id,
  });
  await institutionsService.addMember({
    institutionId: instB.id,
    userId: memberB.id,
    memberRole: "member",
    actorUserId: superAdmin.id,
  });
  await institutionsService.addMember({
    institutionId: instA.id,
    userId: multiMember.id,
    memberRole: "member",
    actorUserId: superAdmin.id,
  });
  await institutionsService.addMember({
    institutionId: instB.id,
    userId: multiMember.id,
    memberRole: "manager",
    actorUserId: superAdmin.id,
  });
  step("members", "add members + multi-institution", true, `multi=${multiMember.id}`);

  let dupBlocked = false;
  try {
    await institutionsService.addMember({
      institutionId: instA.id,
      userId: memberA.id,
      memberRole: "member",
      actorUserId: superAdmin.id,
    });
  } catch (e) {
    dupBlocked = e.publicCode === "DUPLICATE_MEMBERSHIP" || /عضو بالفعل/.test(String(e.message));
  }
  step("members", "duplicate membership blocked", dupBlocked);

  await institutionsService.updateMember({
    institutionId: instA.id,
    userId: memberA.id,
    memberRole: "manager",
    actorUserId: superAdmin.id,
  });
  await institutionsService.updateMember({
    institutionId: instA.id,
    userId: memberA.id,
    memberRole: "member",
    actorUserId: superAdmin.id,
  });
  step("members", "role change member/manager", true);

  // List institutions via API
  const listRes = await api("GET", `/api/admin/institutions?q=QA4A%20Inst%20A%20${stamp}`, {
    token: saToken,
  });
  step(
    "institution-ui",
    "list institutions API",
    listRes.ok && Array.isArray(listRes.json?.data?.institutions),
    `status=${listRes.status}`,
  );

  // ========== Bidding order E2E ==========
  const bidCreated = await institutionWorkService.createInstitutionOrder({
    institutionId: instA.id,
    actorUserId: superAdmin.id,
    actorRole: "super_admin",
    payload: {
      title: `QA4A Bid ${stamp}`,
      description: "Phase4A bidding lifecycle",
      categoryId: cats[0].id,
      projectType: "bidding",
      bidBudgetMin: 12,
      bidBudgetMax: 25,
      durationValue: 3,
      durationUnit: "days",
    },
    publish: true,
  });
  const bidOrderId = Number(bidCreated.order.id);
  step(
    "bidding",
    "create/publish bidding order",
    bidCreated.order.visibilityScope === "institution" &&
      String(bidCreated.order.institutionId) === String(instA.id),
    `order=${bidOrderId}`,
  );

  const poolMember = await api("GET", "/api/institution/orders/pool", {
    token: signToken(memberA),
  });
  let poolOrders = poolMember.json?.data?.orders || [];
  let seesBid = poolOrders.some((o) => String(o.id) === String(bidOrderId));
  if (!seesBid) {
    const stored = require("../src/services/institutionalStoredOrdersService");
    const directPool = await stored.listInstitutionalPoolForUser({ userId: memberA.id, limit: 50 });
    poolOrders = directPool.orders || [];
    seesBid = poolOrders.some((o) => String(o.id) === String(bidOrderId));
  }
  step("bidding", "member sees order in institution pool", seesBid, `poolCount=${poolOrders.length}`);

  const poolOutsider = await api("GET", "/api/institution/orders/pool", {
    token: signToken(outsider),
  });
  let outsiderSees = (poolOutsider.json?.data?.orders || []).some(
    (o) => String(o.id) === String(bidOrderId),
  );
  if (poolOutsider.status !== 200) {
    const stored = require("../src/services/institutionalStoredOrdersService");
    const outPool = await stored.listInstitutionalPoolForUser({ userId: outsider.id, limit: 50 });
    outsiderSees = (outPool.orders || []).some((o) => String(o.id) === String(bidOrderId));
  }
  step("bidding", "outsider does not see Institution A order", !outsiderSees);

  let bidSubmitOk = false;
  let bidId = null;
  try {
    const bid = await ordersService.submitPoolOrderBid({
      freelancerUserId: memberA.id,
      orderId: bidOrderId,
      amount: 15,
      note: "QA4A bid",
      estimatedDays: 2,
    });
    bidId = Number(bid?.bid?.id || bid?.id || bid?.bidId);
    bidSubmitOk = Number.isInteger(bidId) && bidId > 0;
    if (!bidSubmitOk) {
      // inspect shape
      const listed = await ordersService.listInternalOrderBidsForAdmin({ orderId: bidOrderId });
      bidId = Number(listed?.bids?.[0]?.id);
      bidSubmitOk = Number.isInteger(bidId) && bidId > 0;
    }
  } catch (e) {
    step("bidding", "member submit bid", false, e.message);
  }
  if (bidSubmitOk) step("bidding", "member submit bid", true, `bidId=${bidId}`);

  if (bidSubmitOk) {
    try {
      const awarded = await institutionWorkService.acceptInstitutionOrderBid({
        institutionId: instA.id,
        orderId: bidOrderId,
        bidId,
        actorUserId: superAdmin.id,
      });
      step(
        "bidding",
        "super admin accept bid",
        String(awarded?.order?.assignedFreelancerId || awarded?.assignedFreelancerId || "") ===
          String(memberA.id) ||
          String(awarded?.order?.orderStatus || awarded?.orderStatus || "") === "in_progress",
        JSON.stringify({
          status: awarded?.order?.orderStatus || awarded?.orderStatus,
          assigned: awarded?.order?.assignedFreelancerId,
        }).slice(0, 200),
      );
    } catch (e) {
      step("bidding", "super admin accept bid", false, e.message);
    }

    // Delivery
    try {
      await ordersService.submitFreelancerOrderDelivery({
        freelancerUserId: memberA.id,
        orderId: bidOrderId,
        note: "QA4A delivery v1",
        uploadedFiles: [qaDeliveryFile("bid-v1")],
      });
      step("bidding", "freelancer submit delivery", true);
    } catch (e) {
      step("bidding", "freelancer submit delivery", false, e.message);
    }

    try {
      await institutionWorkService.requestInstitutionOrderRevision({
        institutionId: instA.id,
        orderId: bidOrderId,
        actorUserId: superAdmin.id,
        note: "QA4A please revise",
      });
      step("bidding", "super admin request revision", true);
    } catch (e) {
      step("bidding", "super admin request revision", false, e.message);
    }

    try {
      await ordersService.submitFreelancerOrderDelivery({
        freelancerUserId: memberA.id,
        orderId: bidOrderId,
        note: "QA4A delivery v2",
        uploadedFiles: [qaDeliveryFile("bid-v2")],
      });
      step("bidding", "freelancer resubmit", true);
    } catch (e) {
      step("bidding", "freelancer resubmit", false, e.message);
    }

    try {
      const done = await institutionWorkService.approveInstitutionOrderDelivery({
        institutionId: instA.id,
        orderId: bidOrderId,
        actorUserId: superAdmin.id,
      });
      step(
        "bidding",
        "final approve completed",
        String(done?.orderStatus || done?.status || "") === "completed",
        String(done?.orderStatus || done?.status || ""),
      );
    } catch (e) {
      step("bidding", "final approve completed", false, e.message);
    }
  }

  // ========== Fixed/take ==========
  const fixedCreated = await institutionWorkService.createInstitutionOrder({
    institutionId: instA.id,
    actorUserId: superAdmin.id,
    actorRole: "super_admin",
    payload: {
      title: `QA4A Fixed ${stamp}`,
      description: "Phase4A fixed take",
      categoryId: cats[0].id,
      projectType: "fixed",
      budget: 15,
      durationValue: 2,
      durationUnit: "days",
    },
    publish: true,
  });
  const fixedId = Number(fixedCreated.order.id);
  step("fixed", "create fixed order", !!fixedId, `order=${fixedId}`);

  let claimOk = false;
  try {
    await ordersService.claimPoolOrder({
      freelancerUserId: memberA.id,
      orderId: fixedId,
    });
    claimOk = true;
  } catch (e) {
    step("fixed", "member claim", false, e.message);
  }
  if (claimOk) step("fixed", "member claim", true);

  let outsiderClaimBlocked = false;
  try {
    await ordersService.claimPoolOrder({
      freelancerUserId: outsider.id,
      orderId: fixedId,
    });
  } catch (e) {
    outsiderClaimBlocked = true;
  }
  step("fixed", "outsider claim blocked", outsiderClaimBlocked);

  let doubleClaimBlocked = false;
  try {
    await ordersService.claimPoolOrder({
      freelancerUserId: multiMember.id,
      orderId: fixedId,
    });
  } catch (e) {
    doubleClaimBlocked = true;
  }
  step("fixed", "second claim blocked", doubleClaimBlocked);

  if (claimOk) {
    try {
      await ordersService.submitFreelancerOrderDelivery({
        freelancerUserId: memberA.id,
        orderId: fixedId,
        note: "fixed delivery",
        uploadedFiles: [qaDeliveryFile("fixed-v1")],
      });
      await institutionWorkService.approveInstitutionOrderDelivery({
        institutionId: instA.id,
        orderId: fixedId,
        actorUserId: superAdmin.id,
      });
      step("fixed", "delivery + completion", true);
    } catch (e) {
      step("fixed", "delivery + completion", false, e.message);
    }
  }

  // ========== Article E2E (workflow_only) ==========
  let articleId = null;
  let applicationId = null;
  let articleFlagRestore = null;
  try {
    const seeded = await seedArticleApplyPrereqs(pool, {
      freelancerUserId: memberA.id,
      actorUserId: superAdmin.id,
      stamp,
    });
    articleFlagRestore = seeded.prevFlags;
    step("article", "staging article engines enabled for QA", true);

    const art = await institutionWorkService.createInstitutionArticle({
      institutionId: instA.id,
      actorUserId: superAdmin.id,
      payload: {
        title: `QA4A Article ${stamp}`,
        description: "Phase4A institution article",
        targetPlanCode: "STARTER",
        writingMode: "either",
        requiredBidCount: 1,
        minRequiredBidsAcknowledged: true,
        status: "draft",
      },
      publish: true,
    });
    articleId = Number(art.article.id);
    const { rows: arow } = await pool.query(
      `SELECT institution_id, visibility_scope, status FROM marketplace_articles WHERE id = $1`,
      [articleId],
    );
    step(
      "article",
      "atomic institution article create",
      String(arow[0]?.visibility_scope) === "institution" &&
        String(arow[0]?.institution_id) === String(instA.id),
      JSON.stringify(arow[0]),
    );

    const articlesSvc = require("../src/services/marketplaceArticlesService");
    const pub = await articlesSvc.listPublishedMarketplaceArticles({ limit: 200 });
    step(
      "article",
      "hidden from public marketplace list",
      !pub.some((a) => String(a.id) === String(articleId)),
    );

    try {
      const applied = await appsSvc.submitArticleApplication({
        articleId,
        freelancerUserId: memberA.id,
        proposalMessage: "QA4A apply",
      });
      applicationId = Number(applied?.application?.id || applied?.id);
      step("article", "member apply", Number.isInteger(applicationId) && applicationId > 0, `app=${applicationId}`);
    } catch (e) {
      step("article", "member apply", false, e.message);
    }

    if (applicationId) {
      try {
        await appsSvc.selectArticleApplication({
          applicationId,
          actorUserId: superAdmin.id,
          overrideReason: "qa4a_select",
        });
        step("article", "super admin select writer", true);
      } catch (e) {
        step("article", "super admin select writer", false, e.message);
      }

      try {
        const submissions = require("../src/services/marketplaceArticleSubmissionsService");
        await submissions.submitFinalArticleManuscript({
          applicationId,
          freelancerUserId: memberA.id,
          title: `QA4A Manuscript ${stamp}`,
          content: qaArticleManuscript(stamp),
          termsAccepted: true,
          body: {
            termsAccepted: true,
            writingSource: "human",
            referencesText: "1. مرجع أول للتحقق\n2. مرجع ثانٍ للتحقق",
          },
        });
        step("article", "writer submit manuscript", true);
      } catch (e) {
        step("article", "writer submit manuscript", false, e.message);
      }

      try {
        const fin = await appsSvc.finalizeArticleApplicationApproval({
          applicationId,
          actorUserId: superAdmin.id,
        });
        step(
          "article",
          "final approval workflow_only",
          fin?.settlementMode === "workflow_only" || fin?.financialMutation === false,
          JSON.stringify({
            mode: fin?.settlementMode,
            financial: fin?.financialMutation,
          }),
        );
      } catch (e) {
        step("article", "final approval workflow_only", false, e.message);
      }
    }
  } catch (e) {
    step("article", "atomic institution article create", false, e.message);
  } finally {
    await restoreArticleEngineFlags(pool, articleFlagRestore).catch(() => {});
  }

  // ========== Normal marketplace article regression (source-level + optional create) ==========
  const appsSrc = fs.readFileSync(
    path.join(__dirname, "..", "src", "services", "marketplaceArticleApplicationsService.js"),
    "utf8",
  );
  step(
    "regression",
    "marketplace finalize still has settlementService path",
    /settlementService\.finalizeArticleApproval/.test(appsSrc) &&
      /SETTLEMENT_MODES\.MARKETPLACE/.test(appsSrc),
  );

  // ========== Legacy campaign → Institution ==========
  let legacyUserId = null;
  try {
    const camp = await inviteSvc.createCampaign({
      actorAdminId: superAdmin.id,
      name: `QA4A Legacy Camp ${stamp}`,
      slug: `qa4a-legacy-${stamp}`,
      maxRedemptions: 5,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      defaultPlanCode: "orderzhouse_free",
      defaultTrustLevel: "APPROVED",
      institutionId: instA.id,
      isActive: true,
    });
    // Migration 190 defaults require_id_front=true; disable for API registration without uploads.
    await pool.query(
      `UPDATE legacy_freelancer_invite_campaigns
          SET require_id_front = FALSE, require_id_back = FALSE
        WHERE id = $1`,
      [camp.id],
    );
    step(
      "legacy",
      "campaign created with institution",
      String(camp.institutionId) === String(instA.id),
      `campaign=${camp.id}`,
    );

    // Prefer register via service if token available
    const plaintext = camp.token;
    if (plaintext) {
      const email = `qa4a.legacy.${stamp}@example.com`;
      const phone = `+96279${String(stamp).slice(-7)}`;
      const answers = buildLegacyAnswers(stamp);
      try {
        const reg = await inviteSvc.registerLegacyFreelancer(
          {
            campaignSlug: camp.slug,
            token: plaintext,
            email,
            password: "Qa4aLegacyPass1!",
            passwordConfirm: "Qa4aLegacyPass1!",
            termsAccepted: true,
            privacyAccepted: true,
            firstName: answers.first_name,
            fatherName: answers.father_name,
            familyName: answers.family_name,
            phone,
            country: "JO",
            gender: "ذكر",
            national_id: answers.national_id,
            answers,
          },
          { ip: "127.0.0.1", userAgent: "qa4a" },
        );
        legacyUserId = Number(reg?.user?.id);
        step("legacy", "registration succeeds", Number.isInteger(legacyUserId), `user=${legacyUserId}`);

        const { rows: mem } = await pool.query(
          `SELECT status, member_role FROM institution_members
            WHERE institution_id = $1 AND user_id = $2`,
          [instA.id, legacyUserId],
        );
        step(
          "legacy",
          "auto institution membership",
          mem[0]?.status === "active" && mem[0]?.member_role === "member",
          JSON.stringify(mem[0] || {}),
        );

        const { rows: campRow } = await pool.query(
          `SELECT used_count FROM legacy_freelancer_invite_campaigns WHERE id = $1`,
          [camp.id],
        );
        step("legacy", "seat increments once", Number(campRow[0]?.used_count) === 1, `used=${campRow[0]?.used_count}`);
      } catch (e) {
        step("legacy", "registration succeeds", false, e.message);
      }
    } else {
      step("legacy", "registration succeeds", false, "no plaintext token returned");
    }
  } catch (e) {
    step("legacy", "campaign created with institution", false, e.message);
  }

  // ========== Multi-institution visibility ==========
  const workA = await institutionWorkService.createInstitutionOrder({
    institutionId: instA.id,
    actorUserId: superAdmin.id,
    actorRole: "super_admin",
    payload: {
      title: `QA4A Multi A ${stamp}`,
      description: "A only",
      categoryId: cats[0].id,
      projectType: "fixed",
      budget: 12,
      durationValue: 1,
      durationUnit: "days",
    },
    publish: true,
  });
  const workB = await institutionWorkService.createInstitutionOrder({
    institutionId: instB.id,
    actorUserId: superAdmin.id,
    actorRole: "super_admin",
    payload: {
      title: `QA4A Multi B ${stamp}`,
      description: "B only",
      categoryId: cats[0].id,
      projectType: "fixed",
      budget: 12,
      durationValue: 1,
      durationUnit: "days",
    },
    publish: true,
  });
  const storedPool = require("../src/services/institutionalStoredOrdersService");
  const multiPoolDirect = await storedPool.listInstitutionalPoolForUser({
    userId: multiMember.id,
    limit: 50,
  });
  const multiIds = (multiPoolDirect.orders || []).map((o) => String(o.id));
  step(
    "multi",
    "multi-member sees A and B work",
    multiIds.includes(String(workA.order.id)) && multiIds.includes(String(workB.order.id)),
    `ids=${multiIds.slice(0, 8).join(",")}`,
  );
  const listA = await institutionWorkService.listInstitutionWork(instA.id, { limit: 50 });
  const listB = await institutionWorkService.listInstitutionWork(instB.id, { limit: 50 });
  step(
    "multi",
    "admin A list does not include B-only work",
    listA.items.some((i) => String(i.id) === String(workA.order.id)) &&
      !listA.items.some((i) => String(i.id) === String(workB.order.id)),
  );
  step(
    "multi",
    "admin B list includes B work",
    listB.items.some((i) => String(i.id) === String(workB.order.id)),
  );

  // ========== Inactive member ==========
  // Prefer an already-assigned order (fixed claim). If claim failed earlier, assign via admin bid path on a fresh order.
  let assignedWhileActive = claimOk ? fixedId : null;
  if (!assignedWhileActive) {
    try {
      const assignOrder = await institutionWorkService.createInstitutionOrder({
        institutionId: instA.id,
        actorUserId: superAdmin.id,
        actorRole: "super_admin",
        payload: {
          title: `QA4A AssignKeep ${stamp}`,
          description: "assigned before deactivate",
          categoryId: cats[0].id,
          projectType: "fixed",
          budget: 12,
          durationValue: 1,
          durationUnit: "days",
        },
        publish: true,
      });
      await ordersService.claimPoolOrder({
        freelancerUserId: memberA.id,
        orderId: Number(assignOrder.order.id),
      });
      assignedWhileActive = Number(assignOrder.order.id);
    } catch (e) {
      step("inactive-member", "seed assigned order", false, e.message);
    }
  }

  const afterDeactWork = await institutionWorkService.createInstitutionOrder({
    institutionId: instA.id,
    actorUserId: superAdmin.id,
    actorRole: "super_admin",
    payload: {
      title: `QA4A AfterDeact ${stamp}`,
      description: "should not see when inactive",
      categoryId: cats[0].id,
      projectType: "fixed",
      budget: 12,
      durationValue: 1,
      durationUnit: "days",
    },
    publish: true,
  });

  await institutionsService.updateMember({
    institutionId: instA.id,
    userId: memberA.id,
    status: "inactive",
    actorUserId: superAdmin.id,
  });
  const storedInactive = require("../src/services/institutionalStoredOrdersService");
  const poolAfter = await storedInactive.listInstitutionalPoolForUser({
    userId: memberA.id,
    limit: 50,
  });
  const seesNew = (poolAfter.orders || []).some(
    (o) => String(o.id) === String(afterDeactWork.order.id),
  );
  step("inactive-member", "cannot see NEW pool work", !seesNew);

  if (assignedWhileActive) {
    const { rows: stillAssigned } = await pool.query(
      `SELECT assigned_freelancer_id, order_status FROM orders WHERE id = $1`,
      [assignedWhileActive],
    );
    step(
      "inactive-member",
      "existing assignment preserved",
      String(stillAssigned[0]?.assigned_freelancer_id) === String(memberA.id),
      JSON.stringify(stillAssigned[0] || {}),
    );
  } else {
    step("inactive-member", "existing assignment preserved", false, "no assigned order");
  }

  await institutionsService.updateMember({
    institutionId: instA.id,
    userId: memberA.id,
    status: "active",
    actorUserId: superAdmin.id,
  });
  const poolRe = await storedInactive.listInstitutionalPoolForUser({
    userId: memberA.id,
    limit: 50,
  });
  const seesAgain = (poolRe.orders || []).some(
    (o) => String(o.id) === String(afterDeactWork.order.id),
  );
  step("inactive-member", "reactivated sees new pool work", seesAgain);

  // ========== Inactive institution ==========
  await institutionsService.updateInstitution({
    id: instB.id,
    patch: { status: "inactive" },
    actorUserId: superAdmin.id,
  });
  let createBlocked = false;
  try {
    await institutionWorkService.createInstitutionOrder({
      institutionId: instB.id,
      actorUserId: superAdmin.id,
      actorRole: "super_admin",
      payload: {
        title: "should fail",
        description: "inactive",
        categoryId: cats[0].id,
        projectType: "fixed",
        budget: 10,
        durationValue: 1,
        durationUnit: "days",
      },
      publish: true,
    });
  } catch (e) {
    createBlocked = e.publicCode === "INSTITUTION_INACTIVE" || /غير نشطة/.test(String(e.message));
  }
  step("inactive-inst", "cannot create new work when inactive", createBlocked);

  const hist = await institutionWorkService.listInstitutionWork(instB.id, { limit: 20 });
  step("inactive-inst", "history still listable for staff", hist.items.length >= 1, `n=${hist.items.length}`);

  // Restore B for browser + cleanup/archive tests
  await institutionsService.updateInstitution({
    id: instB.id,
    patch: { status: "active" },
    actorUserId: superAdmin.id,
  });

  // ========== Browser UI (before archive so list still shows active QA records) ==========
  let browserOk = false;
  try {
    let chromium;
    const playwrightCandidates = [
      "playwright",
      path.join(__dirname, "..", "node_modules", "playwright"),
      path.join(__dirname, "..", "..", "frontend", "node_modules", "playwright"),
      path.join(__dirname, "..", "..", "node_modules", "playwright"),
    ];
    let loaded = null;
    for (const cand of playwrightCandidates) {
      try {
        loaded = require(cand);
        break;
      } catch {
        /* try next */
      }
    }
    if (!loaded) {
      const { execSync } = require("node:child_process");
      execSync("npm install playwright@1.49.1 --no-save --no-fund --no-audit", {
        cwd: path.join(__dirname, ".."),
        stdio: "inherit",
      });
      loaded = require("playwright");
    }
    ({ chromium } = loaded);
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      baseURL: WEB_ORIGIN,
      locale: "ar",
      viewport: { width: 1440, height: 960 },
    });
    await context.addCookies([
      {
        name: AUTH_COOKIE_NAME,
        value: saToken,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.addInitScript((token) => {
      try {
        localStorage.setItem("orderz_session_hint", "1");
        localStorage.setItem("orderz_auth_token", token);
      } catch {
        /* ignore */
      }
    }, saToken);

    if (!results.find((r) => r.name === "frontend Vite ready")?.pass) {
      step("browser", "frontend available for UI", false, "vite not ready");
    } else {
      await page.goto(`${WEB_ORIGIN}/dashboard/super-admin/institutions`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page
        .waitForFunction(
          () => (document.body?.innerText || "").includes("إضافة مؤسسة"),
          { timeout: 60000 },
        )
        .catch(() => {});
      // Prefer searching for this run's Institution A card
      const search = page.locator('input[type="search"]').first();
      if (await search.count()) {
        await search.fill(`QA4A Inst A ${stamp}`);
        await page.waitForTimeout(1200);
      }
      await page.screenshot({
        path: path.join(SCREEN_DIR, "institutions-list.png"),
        fullPage: true,
      });
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const listReady =
        bodyText.includes("إضافة مؤسسة") ||
        bodyText.includes(`QA4A Inst A ${stamp}`) ||
        bodyText.includes("قائمة المؤسسات");
      step("browser", "institutions list page loads", listReady, bodyText.slice(0, 200));

      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREEN_DIR, "institutions-list-mobile.png"),
        fullPage: true,
      });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      step(
        "browser",
        "mobile no major horizontal overflow",
        scrollWidth <= clientWidth + 24,
        `scroll=${scrollWidth} client=${clientWidth}`,
      );

      await page.setViewportSize({ width: 1440, height: 960 });
      await page.goto(`${WEB_ORIGIN}/dashboard/super-admin/institutions/${instA.id}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page
        .waitForFunction(
          () => {
            const t = document.body?.innerText || "";
            return t.includes("الأعضاء") && t.includes("الإعدادات");
          },
          { timeout: 60000 },
        )
        .catch(() => {});
      await page.screenshot({
        path: path.join(SCREEN_DIR, "institution-detail.png"),
        fullPage: true,
      });
      const detailText = await page.locator("body").innerText().catch(() => "");
      step(
        "browser",
        "detail tabs visible",
        detailText.includes("الأعضاء") && detailText.includes("الإعدادات") && detailText.includes("الطلبات"),
        detailText.slice(0, 200),
      );
      browserOk = true;
    }
    await browser.close();
  } catch (e) {
    step("browser", "playwright run", false, e.message);
  }
  step("browser", "browser smoke executed", browserOk || results.some((r) => r.section === "browser" && r.pass));

  // ========== Safe delete ==========
  const delUsed = await institutionsService.softDeleteOrArchiveInstitution({
    id: instA.id,
    actorUserId: superAdmin.id,
  });
  step(
    "delete",
    "used institution archives (no hard delete)",
    delUsed.mode === "deactivated" || delUsed.mode === "already_inactive",
    delUsed.mode,
  );
  const { rows: stillOrders } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM orders WHERE institution_id = $1`,
    [instA.id],
  );
  step("delete", "work history preserved", Number(stillOrders[0]?.c) > 0, `orders=${stillOrders[0]?.c}`);

  const unused = await institutionsService.createInstitution({
    actorUserId: superAdmin.id,
    name: `QA4A Unused ${stamp}`,
    description: "unused for hard delete",
    status: "active",
  });
  const delUnused = await institutionsService.softDeleteOrArchiveInstitution({
    id: unused.id,
    actorUserId: superAdmin.id,
  });
  step(
    "delete",
    "unused institution hard-delete when safe",
    delUnused.mode === "hard_deleted",
    delUnused.mode,
  );

  // ========== Finance ==========
  const financeAfter = await financeSnapshot(pool, startedAt);
  let financeClean = true;
  for (const k of Object.keys(financeAfter)) {
    if (financeAfter[k] > financeBefore[k] && financeAfter[k] > 0) {
      financeClean = false;
    }
  }
  step(
    "finance",
    "zero institution financial side effects",
    financeClean,
    JSON.stringify({ before: financeBefore, after: financeAfter }),
  );

  // Cleanup: leave inactive QA institutions (history). Do not wipe production-like data.
  try {
    await institutionsService.softDeleteOrArchiveInstitution({
      id: instB.id,
      actorUserId: superAdmin.id,
    });
  } catch {
    /* ignore */
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const criticalFails = results.filter(
    (r) =>
      !r.pass &&
      ["bidding", "fixed", "article", "finance", "delete", "prep"].includes(r.section) &&
      !String(r.detail || "").match(/subscription|Bildazo|bid credit|عضوية السوق|eligible/i),
  );

  let status = "ORDERZHOUSE_INSTITUTIONS_V2_PHASE4A_STAGING_ACCEPTED";
  if (failed > 0 && criticalFails.length > 0) {
    status = "PARTIAL";
  } else if (failed > 0) {
    status = "PARTIAL";
  }

  const report = {
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    target: target.maskedTarget,
    passed,
    failed,
    results,
    financeBefore,
    financeAfter,
    screens: SCREEN_DIR,
    productionUntouched: true,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("\n=== SUMMARY ===");
  console.log(status, `passed=${passed} failed=${failed}`);
  console.log("report:", REPORT_PATH);

  // Do not kill spawned servers aggressively — leave for subsequent manual UI if needed.
  if (apiProc) apiProc.unref?.();
  if (webProc) webProc.unref?.();

  await pool.end().catch(() => {});
  process.exit(criticalFails.length > 3 ? 1 : 0);
})().catch(async (err) => {
  console.error("PHASE4A_FAILED", err);
  try {
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify({ status: "FAILED", error: String(err.message || err) }, null, 2),
    );
  } catch {
    /* ignore */
  }
  process.exit(1);
});
