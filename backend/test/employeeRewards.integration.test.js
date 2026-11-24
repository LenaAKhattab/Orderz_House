/**
 * Postgres integration — Smart Orders S6: employee reward pool + management report.
 * Run: node --test test/employeeRewards.integration.test.js  (INTEGRATION_TEST_DATABASE_URL, migrations 219–220)
 *
 * Uses an isolated historical month (fixture settlements inserted with closed_at in that month).
 * The reward policy is activated only inside this test and restored to DISABLED afterwards.
 */
const crypto = require("node:crypto");
const http = require("node:http");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const ok = isIntegrationEnvConfigured();
const TAG = `[IT-SMART-S6] ${crypto.randomBytes(3).toString("hex")}`;
const PASSWORD = `It6-${crypto.randomBytes(6).toString("hex")}!A`;
// An old month nobody else uses on Staging, randomized to keep reruns independent.
const MONTH = `20${10 + crypto.randomInt(0, 9)}-${String(crypto.randomInt(1, 13)).padStart(2, "0")}`;

describe("Smart Orders S6 — employee rewards (Postgres)", { skip: !ok }, () => {
  let pool;
  let rewards;
  let finance;
  let reports;
  let authService;
  let server;
  const userIds = [];
  const orderIds = [];
  let superId;
  let staff;
  let plainAdmin;
  let freelancerId;
  let periodId;
  let originalPolicy;

  async function makeUser(role) {
    const email = `it-s6-${crypto.randomBytes(5).toString("hex")}@example.test`;
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role, country, phone, whatsapp, gender, terms_accepted, email_verified, is_active)
       VALUES ($1,'مكافآت','اختبار','تجربة',$2,$3,$4,'JO','+962790000666','+962790000666','ذكر',true,true,true) RETURNING id`,
      [crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10), email, await bcrypt.hash(PASSWORD, 4), role],
    );
    userIds.push(Number(rows[0].id));
    return { id: Number(rows[0].id), email };
  }

  /** Fixture: an order with a closed settlement in MONTH (company share / freelancer pay given). */
  async function settledOrder({ company, freelancer }) {
    const categoryId = Number((await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 1`)).rows[0].id);
    const created = await require("../src/services/ordersService").createInternalOrder({
      actorUserId: superId,
      actorRole: "super_admin",
      payload: { title: `${TAG} order`, description: "S6 fixture order for reward tests.", categoryId, projectType: "fixed", budget: freelancer, durationValue: 3, durationUnit: "days", preferredSkills: [] },
    });
    await pool.query(`UPDATE orders SET order_status = 'completed' WHERE id = $1`, [created.id]);
    const rows = [{ id: created.id }];
    const oid = Number(rows[0].id);
    orderIds.push(oid);
    const net = BigInt(Math.round(Number(company) * 1000)) + BigInt(Math.round(Number(freelancer) * 1000));
    await pool.query(
      `INSERT INTO order_settlements (order_id, version, base_currency, gross_milli, refunds_milli, tax_milli, fees_milli, quality_checks_milli,
         direct_costs_milli, net_milli, freelancer_milli, company_milli, breakdown, policy_snapshot, closed_at)
       VALUES ($1, 1, 'JOD', $2, 0, 0, 0, 0, 0, $2, $3, $4, '{}', '{}', ($5 || '-15')::date)`,
      [oid, net.toString(), String(BigInt(Math.round(Number(freelancer) * 1000))), String(BigInt(Math.round(Number(company) * 1000))), MONTH],
    );
    return oid;
  }

  async function api(method, path, token, body) {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  before(async () => {
    ({ pool } = require("../src/config/db"));
    rewards = require("../src/services/finance/rewardPoolService");
    finance = require("../src/services/finance/orderFinanceService");
    reports = require("../src/services/finance/financeReportsService");
    authService = require("../src/services/authService");
    const { rows } = await pool.query(`SELECT to_regclass('public.reward_periods') AS t`);
    assert.ok(rows[0].t, "migration 220 must be applied");
    superId = (await makeUser("super_admin")).id;
    staff = [await makeUser("admin"), await makeUser("admin"), await makeUser("super_admin")];
    plainAdmin = staff[0];
    freelancerId = (await makeUser("freelancer")).id;
    originalPolicy = (await finance.getPolicies()).employee_reward_pool;
    const app = require("../src/app");
    server = await new Promise((resolve) => {
      const s = http.createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (!pool) return;
    // Always leave the policy exactly as found (disabled in Production policy).
    const cur = (await finance.getPolicies()).employee_reward_pool;
    if (cur.active !== originalPolicy.active) {
      await finance.setPolicy({ key: "employee_reward_pool", status: originalPolicy.status, config: originalPolicy.config, note: `${TAG} restore`, actorUserId: superId });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const t of ["reward_periods", "reward_period_weights", "reward_allocations", "reward_adjustments", "order_settlements"]) {
        await client.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      }
      if (periodId) {
        for (const t of ["reward_adjustments", "reward_allocations", "reward_period_weights"]) await client.query(`DELETE FROM ${t} WHERE period_id = $1`, [periodId]);
        await client.query(`DELETE FROM reward_periods WHERE id = $1`, [periodId]);
      }
      await client.query(`DELETE FROM order_settlements WHERE order_id = ANY($1::bigint[])`, [orderIds]);
      for (const t of ["reward_periods", "reward_period_weights", "reward_allocations", "reward_adjustments", "order_settlements"]) {
        await client.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
      }
      await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [orderIds]);
      await client.query("SAVEPOINT u");
      try {
        await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT u");
        await client.query(`UPDATE users SET is_active = false WHERE id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("cleanup", e.message);
    } finally {
      client.release();
    }
  });

  it("pool is computed from the COMPANY share only; freelancer pay untouched; weights must total 100%", async () => {
    await settledOrder({ company: "1000", freelancer: "400" });
    await settledOrder({ company: "333.333", freelancer: "50" });
    await settledOrder({ company: "-100", freelancer: "100" }); // a loss reduces the base
    const basis = await rewards.companyShareForMonth(pool, `${MONTH}-01`);
    assert.equal(basis.totalMilli, 1233333n);
    const p = await rewards.createPeriod({ month: MONTH, actorUserId: superId });
    periodId = p.id;
    await assert.rejects(() => rewards.createPeriod({ month: MONTH, actorUserId: superId }), (e) => e.publicCode === "REWARD_PERIOD_EXISTS");
    assert.equal(p.status, "draft");
    assert.equal(p.preview.companyShare, "1233.333");
    assert.equal(p.preview.pool, "61.667", "5% of company share (half-up)");
    assert.equal(p.preview.policyActive, false);

    await assert.rejects(
      () => rewards.setWeights({ periodId, weights: [{ userId: staff[0].id, percent: "50" }, { userId: staff[1].id, percent: "49.99" }] }),
      (e) => e.publicCode === "REWARD_WEIGHTS_TOTAL",
    );
    await assert.rejects(
      () => rewards.setWeights({ periodId, weights: [{ userId: staff[0].id, percent: "50" }, { userId: freelancerId, percent: "50" }] }),
      (e) => e.publicCode === "REWARD_WEIGHTS_INVALID",
    );
    const w = await rewards.setWeights({
      periodId,
      weights: [{ userId: staff[0].id, percent: "33.33" }, { userId: staff[1].id, percent: "33.33" }, { userId: staff[2].id, percent: "33.34" }],
    });
    assert.equal(w.preview.weightsValid, true);
    const sum = w.preview.weights.reduce((a, x) => a + Math.round(Number(x.amount) * 1000), 0);
    assert.equal(sum, 61667, "rounding never creates or destroys value");
    // Freelancer settlement amounts are never modified by the pool.
    const { rows } = await pool.query(`SELECT freelancer_milli::text AS f FROM order_settlements WHERE order_id = ANY($1::bigint[]) ORDER BY order_id`, [orderIds]);
    assert.deepEqual(rows.map((r) => r.f), ["400000", "50000", "100000"]);
  });

  it("disabled policy blocks approval; activation needs a management approval reference", async () => {
    await assert.rejects(() => rewards.approvePeriod({ periodId, actorUserId: superId }), (e) => e.publicCode === "FINANCE_POLICY_DISABLED");
    await assert.rejects(
      () => finance.setPolicy({ key: "employee_reward_pool", status: "active", config: { percentOfCompanyShare: "5.00" }, actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_POLICY_APPROVAL_REQUIRED",
    );
    await finance.setPolicy({ key: "employee_reward_pool", status: "active", config: { percentOfCompanyShare: "5.00" }, approvalReference: `${TAG} test-only approval`, actorUserId: superId });
    // Concurrent double approval → exactly one.
    const two = await Promise.allSettled([rewards.approvePeriod({ periodId, actorUserId: superId }), rewards.approvePeriod({ periodId, actorUserId: superId })]);
    assert.equal(two.filter((r) => r.status === "fulfilled").length, 1);
    const p = await rewards.getPeriod(periodId);
    assert.equal(p.status, "approved");
    assert.equal(p.frozen.pool, "61.667");
    assert.equal(p.allocations.reduce((a, x) => a + Math.round(Number(x.amount) * 1000), 0), 61667);
    // Restore the policy immediately (Production policy = disabled).
    await finance.setPolicy({ key: "employee_reward_pool", status: "disabled", config: { percentOfCompanyShare: "5.00" }, note: `${TAG} restore`, actorUserId: superId });
  });

  it("approved/closed periods are immutable; corrections are adjustments; payout recorded once", async () => {
    await assert.rejects(
      () => rewards.setWeights({ periodId, weights: [{ userId: staff[0].id, percent: "100" }] }),
      (e) => e.publicCode === "REWARD_PERIOD_LOCKED",
    );
    await assert.rejects(pool.query(`INSERT INTO reward_period_weights (period_id, user_id, weight_bp) VALUES ($1, $2, 1)`, [periodId, superId]));
    await assert.rejects(pool.query(`UPDATE reward_allocations SET amount_milli = 0 WHERE period_id = $1`, [periodId]));
    await assert.rejects(() => rewards.markPaid({ periodId, paymentReference: "BANK-1", actorUserId: superId }), (e) => e.publicCode === "REWARD_PERIOD_NOT_PAYABLE");
    await rewards.closePeriod({ periodId, actorUserId: superId });
    await assert.rejects(pool.query(`UPDATE reward_periods SET pool_milli = 1 WHERE id = $1`, [periodId]));
    await rewards.addAdjustment({ periodId, userId: staff[1].id, amount: "-1.5", reason: "Late correction approved", actorUserId: superId });
    const paid = await rewards.markPaid({ periodId, paymentReference: "BANK-TRX-2026-001", actorUserId: superId });
    assert.equal(paid.paymentStatus, "paid");
    await assert.rejects(() => rewards.markPaid({ periodId, paymentReference: "BANK-2", actorUserId: superId }), (e) => e.publicCode === "REWARD_PERIOD_NOT_PAYABLE");
    const mine = await rewards.myRewards(staff[1].id);
    const row = mine.find((r) => r.month === MONTH);
    assert.equal(row.amount, "19.053", "own allocation (20.553 by largest remainder) + adjustment (-1.5) only");
  });

  it("RBAC + reporting totals (bounded aggregates)", async () => {
    const login = async (email) => (await authService.loginUser(email, PASSWORD)).token;
    const tAdmin = await login(plainAdmin.email);
    assert.equal((await api("GET", "/admin/finance/rewards/periods", tAdmin)).status, 403);
    assert.equal((await api("POST", `/admin/finance/rewards/periods/${periodId}/approve`, tAdmin)).status, 403);
    assert.equal((await api("GET", "/admin/finance/reports/summary", tAdmin)).status, 403);
    const mine = await api("GET", "/admin/finance/rewards/mine", tAdmin);
    assert.equal(mine.status, 200);
    assert.ok(mine.json.data.every((r) => !("pool" in r) && !("companyShare" in r)), "employees never see company figures");
    const r = await reports.getManagementReport({ from: `${MONTH}-01`, to: `${MONTH}-28` });
    assert.equal(r.money.settled.count, 3);
    assert.equal(r.money.settled.companyShare, "1233.333");
    assert.equal(r.money.settled.freelancerCompensation, "550.000");
    await assert.rejects(() => reports.getManagementReport({ from: "2026-01-01", to: "2025-01-01" }), (e) => e.publicCode === "FINANCE_REPORT_RANGE_INVALID");
  });
});
