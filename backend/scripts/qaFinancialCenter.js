/**
 * QA: Financial Center (backend API + service checks)
 * Run: node scripts/qaFinancialCenter.js
 */
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { pool } = require("../src/config/db");
const financialCenterService = require("../src/services/financialCenterService");
const financialCenterAccountService = require("../src/services/financialCenterAccountService");

const http = require("node:http");

const BASE_PORT = Number(process.env.PORT) || 5000;
const results = [];

function step(name, pass, detail = "") {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 500) });
  console.log(`${pass ? "PASS" : "FAIL"} | ${name}${detail ? ` — ${detail}` : ""}`);
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), accountId: user.account_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function api(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body != null ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: BASE_PORT,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let data = null;
          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode, data });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function main() {
  console.log("=== QA: Financial Center ===\n");

  // Routes registered
  try {
    const routes = require("../src/routes/superAdminFinancialCenterRoutes");
    const stack = routes.stack || [];
    const paths = stack.map((l) => `${Object.keys(l.route.methods)[0]?.toUpperCase()} ${l.route.path}`);
    const hasHeld = paths.some((p) => p.includes("mark-held"));
    step("mark-held route registered", hasHeld, paths.filter((p) => p.includes("allocation")).join(", "));
  } catch (e) {
    step("mark-held route registered", false, e.message);
  }

  let superAdmin = null;
  let financialUser = null;
  let adminNoPerm = null;

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role, u.account_id, u.is_active
       FROM users u WHERE u.role = 'super_admin' AND u.is_active = TRUE ORDER BY u.id LIMIT 1`,
    );
    superAdmin = rows[0] || null;
    step("super_admin user exists", !!superAdmin, superAdmin ? `id=${superAdmin.id}` : "");
  } catch (e) {
    step("super_admin user exists", false, e.message);
  }

  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.role, u.account_id, u.is_active, p.id AS person_id
       FROM users u
       JOIN financial_people p ON p.user_id = u.id
       WHERE u.role = 'financial_user' ORDER BY u.id LIMIT 1`,
    );
    financialUser = rows[0] || null;
    step("financial_user exists", !!financialUser, financialUser ? `user=${financialUser.id} person=${financialUser.person_id}` : "");
  } catch (e) {
    step("financial_user exists", false, e.message);
  }

  if (!superAdmin) {
    console.log("\nCannot continue HTTP tests without super_admin.");
    await pool.end();
    process.exit(1);
  }

  const saToken = signToken(superAdmin);
  const fuToken = financialUser ? signToken(financialUser) : null;

  // Health: summary
  try {
    const r = await api("GET", "/api/superadmin/financial-center/summary?month=2026-07", saToken);
    step("GET summary (super_admin)", r.status === 200 && r.data?.success, `status=${r.status}`);
  } catch (e) {
    step("GET summary (super_admin)", false, e.message);
  }

  // Create person with account (transaction success)
  try {
    const uniqueEmail = `fc-qa-${Date.now()}@example.com`;
    const r = await api("POST", "/api/superadmin/financial-center/people", saToken, {
      fullName: `QA WithAcct ${Date.now()}`,
      createLoginAccount: true,
      loginEmail: uniqueEmail,
      password: "TestPass123",
    });
    const person = r.data?.data?.person;
    step(
      "POST people with account (transaction)",
      r.status === 201 && person?.accountStatus === "active",
      `status=${r.status} account=${person?.accountStatus}`,
    );
  } catch (e) {
    step("POST people with account (transaction)", false, e.message);
  }

  // financial_user blocked from admin API (synthetic token if no DB user)
  try {
    const fakeFu = { id: 999999, role: "financial_user", account_id: "FAKE0001", email: "fake-fu@test.com" };
    const fakeToken = signToken(fakeFu);
    const r = await api("GET", "/api/superadmin/financial-center/summary", fakeToken);
    step("financial_user role blocked from admin API", r.status === 403 || r.status === 401, `status=${r.status}`);
  } catch (e) {
    step("financial_user role blocked from admin API", false, e.message);
  }
  if (fuToken) {
    try {
      const r = await api("GET", "/api/financial-user/summary", fuToken);
      step("GET /financial-user/summary", r.status === 200 && r.data?.success, `status=${r.status}`);
    } catch (e) {
      step("GET /financial-user/summary", false, e.message);
    }

    try {
      const r = await api("GET", "/api/financial-user/my-bonuses", fuToken);
      const items = r.data?.data?.items;
      step(
        "GET /financial-user/my-bonuses",
        r.status === 200 && Array.isArray(items),
        `status=${r.status} count=${items?.length ?? "?"}`,
      );
      if (items?.length) {
        const keys = Object.keys(items[0]);
        const forbidden = ["sourceRefId", "source_ref_id", "auditLogs", "stripeFeeAmount"];
        const leaked = forbidden.filter((k) => keys.includes(k));
        step("my-bonuses no sensitive fields", leaked.length === 0, leaked.join(",") || keys.join(","));
      }
    } catch (e) {
      step("GET /financial-user/my-bonuses", false, e.message);
    }
  }

  // Create person without account
  let personNoAccountId = null;
  try {
    const r = await api("POST", "/api/superadmin/financial-center/people", saToken, {
      fullName: `QA NoAcct ${Date.now()}`,
      status: "active",
    });
    personNoAccountId = r.data?.data?.person?.id;
    step("POST people (no account)", r.status === 201 && personNoAccountId, `id=${personNoAccountId}`);
  } catch (e) {
    step("POST people (no account)", false, e.message);
  }

  // Duplicate email on create with account — use super admin email
  try {
    const r = await api("POST", "/api/superadmin/financial-center/people", saToken, {
      fullName: `QA DupEmail ${Date.now()}`,
      createLoginAccount: true,
      loginEmail: superAdmin.email,
      password: "TestPass123",
    });
    step("POST people duplicate email rejected", r.status === 409 || r.status === 400, `status=${r.status}`);
    const { rows } = await pool.query(
      `SELECT id FROM financial_people WHERE full_name LIKE 'QA DupEmail%'`,
    );
    step("duplicate email rollback (no orphan person)", rows.length === 0, `orphans=${rows.length}`);
  } catch (e) {
    step("POST people duplicate email", false, e.message);
  }

  // mark-received validations via service
  let bonusRowId = null;
  let allocationId = null;
  try {
    const peopleResult = await financialCenterService.listPeople({ limit: 5 });
    const people = peopleResult.items || [];
    const active = people.filter((p) => p.status === "active");
    if (active.length < 1) throw new Error("no active people");
    const row = await financialCenterService.createBonusRow({
      actorUserId: superAdmin.id,
      payload: {
        title: `QA Row ${Date.now()}`,
        monthKey: "2026-07",
        sourceType: "manual",
        grossAmount: 100,
        bonusPercentage: 20,
        status: "draft",
        allocations: [{ personId: Number(active[0].id), percentageShare: 50 }],
      },
    });
    bonusRowId = row.id;
    allocationId = row.allocations?.[0]?.id;
    step("create bonus row for QA", !!bonusRowId, `row=${bonusRowId} alloc=${allocationId}`);

    await financialCenterService.transitionBonusRow({
      actorUserId: superAdmin.id,
      id: bonusRowId,
      action: "approve",
    });

    // partially_received validation
    let partialFail = false;
    try {
      await financialCenterService.transitionBonusRow({
        actorUserId: superAdmin.id,
        id: bonusRowId,
        action: "mark-received",
        payload: { receivedStatus: "partially_received", receivedAmount: 100 },
      });
    } catch {
      partialFail = true;
    }
    step("partial received rejects amount >= gross", partialFail, "amount=100 gross=100");

    const partialOk = await financialCenterService.transitionBonusRow({
      actorUserId: superAdmin.id,
      id: bonusRowId,
      action: "mark-received",
      payload: { receivedStatus: "partially_received", receivedAmount: 50, receivedNote: "QA partial" },
    });
    step("partial received accepts valid amount", partialOk.receivedStatus === "partially_received", partialOk.receivedStatus);

    const notRec = await financialCenterService.transitionBonusRow({
      actorUserId: superAdmin.id,
      id: bonusRowId,
      action: "mark-received",
      payload: { receivedStatus: "not_received" },
    });
    step("not_received sets amount 0", Number(notRec.receivedAmount) === 0, String(notRec.receivedAmount));

    const received = await financialCenterService.transitionBonusRow({
      actorUserId: superAdmin.id,
      id: bonusRowId,
      action: "mark-received",
      payload: { receivedStatus: "received" },
    });
    step("received full", received.receivedStatus === "received", String(received.receivedAmount));
  } catch (e) {
    step("mark-received flow", false, e.message);
  }

  // mark-held / mark-unpaid via HTTP
  if (allocationId) {
    try {
      const r = await api("POST", `/api/superadmin/financial-center/allocations/${allocationId}/mark-held`, saToken, {});
      step("POST mark-held", r.status === 200 && r.data?.data?.allocation?.paidStatus === "held", `status=${r.status}`);
    } catch (e) {
      step("POST mark-held", false, e.message);
    }
    try {
      const r = await api("POST", `/api/superadmin/financial-center/allocations/${allocationId}/mark-unpaid`, saToken, {});
      step("POST mark-unpaid", r.status === 200 && r.data?.data?.allocation?.paidStatus === "unpaid", `status=${r.status}`);
    } catch (e) {
      step("POST mark-unpaid", false, e.message);
    }
  }

  // Suspend / login block
  if (financialUser && financialUser.is_active) {
    try {
      const r = await api("POST", `/api/superadmin/financial-center/people/${financialUser.person_id}/suspend-account`, saToken);
      step("POST suspend-account", r.status === 200, `status=${r.status}`);
      const blocked = await api("GET", "/api/financial-user/summary", fuToken);
      step("suspended user blocked from API", blocked.status === 403, `status=${blocked.status}`);
      const r2 = await api("POST", `/api/superadmin/financial-center/people/${financialUser.person_id}/activate-account`, saToken);
      step("POST activate-account", r2.status === 200, `status=${r2.status}`);
      const ok = await api("GET", "/api/financial-user/summary", fuToken);
      step("reactivated user can access API", ok.status === 200, `status=${ok.status}`);
    } catch (e) {
      step("suspend/activate flow", false, e.message);
    }
  }

  // Migrations check
  try {
    const { rows } = await pool.query(
      `SELECT version FROM schema_migrations WHERE version LIKE '%financial%' ORDER BY version`,
    );
    const vers = rows.map((r) => r.version);
    step("financial migrations applied", vers.length >= 3, vers.join(", "));
  } catch (e) {
    step("financial migrations", false, e.message);
  }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${pass} passed, ${fail} failed ===`);
  await pool.end();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
