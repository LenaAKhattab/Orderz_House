/**
 * Marketplace Membership Phase 3.1 PREDEPLOY RUNTIME GATE
 *
 * Real HTTP + real Postgres concurrency. Must be run via:
 *   node scripts/runMarketplaceMembershipPredeployGate.js
 *
 * Refuses Production DATABASE_URL. No Stripe. No feature flags. No deploy.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const { classifyDatabaseUrl } = require("../src/utils/databaseEnvironmentSafety");

function refuseProductionDatabase() {
  const info = classifyDatabaseUrl(process.env.DATABASE_URL);
  if (info.isProduction) {
    throw new Error(`PREDEPLOY GATE REFUSED PRODUCTION DB: ${info.maskedTarget}`);
  }
  if (!info.looksLocal && info.classification !== "ISOLATED_TEST") {
    throw new Error(
      `PREDEPLOY GATE requires local/isolated DB, got ${info.classification}: ${info.maskedTarget}`,
    );
  }
  if (!process.env.ORDERZ_GATE_ISOLATED_DB) {
    throw new Error("Run via scripts/runMarketplaceMembershipPredeployGate.js (ORDERZ_GATE_ISOLATED_DB)");
  }
}

refuseProductionDatabase();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  process.env.JWT_SECRET = "marketplace-predeploy-gate-secret-32";
}
if (!process.env.CLIENT_URL) process.env.CLIENT_URL = "http://localhost:5173";
process.env.MARKETPLACE_MEMBERSHIP_RECONCILE_ENABLED = "0";

const { pool } = require("../src/config/db");
const marketplaceMembershipsService = require("../src/services/marketplaceMembershipsService");
const marketplaceMembershipCyclesService = require("../src/services/marketplaceMembershipCyclesService");
const marketplacePriorityBidUsageService = require("../src/services/marketplacePriorityBidUsageService");
const marketplaceMembershipPlansService = require("../src/services/marketplaceMembershipPlansService");
const { MEMBERSHIP_AUDIT_ACTIONS } = require("../src/constants/marketplaceMemberships");
const app = require("../src/app");

function listenApp() {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function httpJson(server, pathname, options = {}) {
  const { method = "GET", body, bearerToken, headers = {} } = options;
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text };
  }
  return { status: res.status, body: parsed, text };
}

async function seedUser(role) {
  const suffix = crypto.randomBytes(5).toString("hex");
  const email = `gate_${role}_${suffix}@example.com`;
  const accountId = `G${suffix}`.slice(0, 10).toUpperCase();
  const phone = `+9627${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const { rows } = await pool.query(
    `INSERT INTO users (
       account_id, email, password_hash, role, first_name, father_name, family_name,
       phone, whatsapp, gender, country, is_active, terms_accepted, email_verified
     ) VALUES ($1, $2, 'x', $3, 'Gate', 'T', 'User', $4, $4, 'ذكر', 'JO', TRUE, TRUE, TRUE)
     RETURNING id, account_id, email, role`,
    [accountId, email, role, phone],
  );
  return rows[0];
}

function tokenFor(userRow) {
  return jwt.sign(
    {
      sub: String(userRow.id),
      accountId: userRow.account_id,
      role: userRow.role,
      email: userRow.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function planIdByTier(tierCode) {
  const { rows } = await pool.query(
    `SELECT id FROM marketplace_membership_plans WHERE tier_code = $1 LIMIT 1`,
    [tierCode],
  );
  assert.ok(rows[0], `plan ${tierCode} missing`);
  return Number(rows[0].id);
}

async function countCurrent(freelancerUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM freelancer_marketplace_memberships
     WHERE freelancer_user_id = $1 AND is_current = TRUE`,
    [freelancerUserId],
  );
  return rows[0].c;
}

async function activeCyclesForMembership(membershipId) {
  const { rows } = await pool.query(
    `SELECT * FROM marketplace_membership_cycles
     WHERE membership_id = $1 AND status = 'active'`,
    [membershipId],
  );
  return rows;
}

async function auditActions(membershipId) {
  const { rows } = await pool.query(
    `SELECT action FROM marketplace_membership_audit_logs
     WHERE membership_id = $1 ORDER BY id ASC`,
    [membershipId],
  );
  return rows.map((r) => r.action);
}

describe("Marketplace Membership Phase 3.1 PREDEPLOY GATE", { timeout: 300_000 }, () => {
  let server;

  before(async () => {
    refuseProductionDatabase();
    server = await listenApp();
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });

  it("A/B: HTTP no-membership + unauthenticated + privacy (identity from auth)", async () => {
    const freelancer = await seedUser("freelancer");
    const other = await seedUser("freelancer");
    const tok = tokenFor(freelancer);

    const unauth = await httpJson(server, "/api/freelancer/marketplace-membership");
    assert.equal(unauth.status, 401);
    assert.equal(unauth.body.code, "UNAUTHORIZED");

    const ok = await httpJson(server, "/api/freelancer/marketplace-membership", {
      bearerToken: tok,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.data.hasMembership, false);
    assert.equal(ok.body.data.priorityBid.engineAvailable, false);
    assert.equal(ok.body.data.schemaPending, undefined);
    assert.ok(!/"stack"|SQLSTATE|duplicate key/i.test(ok.text));

    // Identity is derived from auth — query params must not expose another account
    const probe = await httpJson(
      server,
      `/api/freelancer/marketplace-membership?freelancerId=${other.id}&userId=${other.id}`,
      { bearerToken: tok },
    );
    assert.equal(probe.status, 200);
    assert.equal(probe.body.data.hasMembership, false);
    const dump = JSON.stringify(probe.body);
    assert.ok(!dump.includes("created_by_user_id"));
    assert.ok(!dump.includes("audit"));
    assert.ok(!dump.includes("stripe_subscription_id"));
    assert.ok(!dump.includes("fairness"));
  });

  it("C: Super Admin RBAC HTTP + read-only surface", async () => {
    const freelancer = await seedUser("freelancer");
    const admin = await seedUser("admin");
    const superAdmin = await seedUser("super_admin");

    const unauth = await httpJson(server, "/api/super-admin/marketplace-memberships");
    assert.equal(unauth.status, 401);

    const asFreelancer = await httpJson(server, "/api/super-admin/marketplace-memberships", {
      bearerToken: tokenFor(freelancer),
    });
    assert.equal(asFreelancer.status, 403);

    const asAdmin = await httpJson(server, "/api/super-admin/marketplace-memberships", {
      bearerToken: tokenFor(admin),
    });
    assert.equal(asAdmin.status, 403);

    const asSa = await httpJson(server, "/api/super-admin/marketplace-memberships", {
      bearerToken: tokenFor(superAdmin),
    });
    assert.equal(asSa.status, 200);
    assert.equal(asSa.body.success, true);
    assert.ok(Array.isArray(asSa.body.data));

    // Read-only: mutating Phase 3 endpoints must not be mounted on public routers
    const routeFiles = [
      path.join(__dirname, "..", "src", "routes", "freelancerMarketplaceMembershipRoutes.js"),
      path.join(__dirname, "..", "src", "routes", "superAdminMarketplaceMembershipsRoutes.js"),
    ];
    for (const f of routeFiles) {
      const src = fs.readFileSync(f, "utf8");
      assert.ok(!/router\.(post|put|patch|delete)\(/i.test(src), `${path.basename(f)} must stay read-only`);
    }

    const postActivate = await httpJson(server, "/api/super-admin/marketplace-memberships", {
      method: "POST",
      bearerToken: tokenFor(superAdmin),
      body: { freelancerUserId: freelancer.id },
    });
    assert.ok([404, 405].includes(postActivate.status));
  });

  it("9-12: concurrent activation + replacement with DB assertions", async () => {
    const freelancer = await seedUser("freelancer");
    const planA = await planIdByTier("pay_as_you_work");
    const planB = await planIdByTier("active");
    const planC = await planIdByTier("pro");
    const now = new Date("2026-01-17T10:00:00.000Z");

    const [r1, r2] = await Promise.allSettled([
      marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planA,
        paidTermMonths: 12,
        now,
        source: "system",
      }),
      marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planA,
        paidTermMonths: 12,
        now,
        source: "system",
      }),
    ]);

    const oks = [r1, r2].filter((r) => r.status === "fulfilled");
    const fails = [r1, r2].filter((r) => r.status === "rejected");
    assert.ok(oks.length >= 1);
    for (const f of fails) {
      const msg = String(f.reason?.message || f.reason || "");
      const code = f.reason?.publicCode || f.reason?.code;
      assert.ok(
        code === "MARKETPLACE_MEMBERSHIP_CONFLICT" || /already current|conflict/i.test(msg),
        `clean domain error expected, got ${code} ${msg}`,
      );
      assert.ok(!/SQLSTATE|duplicate key value|uidx/i.test(msg));
    }

    assert.equal(await countCurrent(freelancer.id), 1);
    const current = await marketplaceMembershipsService.resolveCurrentMarketplaceMembershipForFreelancer(
      freelancer.id,
    );
    const cycles = await activeCyclesForMembership(current.id);
    assert.equal(cycles.length, 1);
    assert.equal(Number(cycles[0].cycle_number), 1);

    const orphan = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles c
       LEFT JOIN freelancer_marketplace_memberships m ON m.id = c.membership_id
       WHERE m.id IS NULL`,
    );
    assert.equal(orphan.rows[0].c, 0);

    // Concurrent replacement B vs C
    const [rep1, rep2] = await Promise.allSettled([
      marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planB,
        paidTermMonths: 12,
        now: new Date("2026-02-01T10:00:00.000Z"),
        source: "system",
      }),
      marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planC,
        paidTermMonths: 12,
        now: new Date("2026-02-01T10:00:00.000Z"),
        source: "system",
      }),
    ]);
    assert.ok([rep1, rep2].some((r) => r.status === "fulfilled"));
    assert.equal(await countCurrent(freelancer.id), 1);

    const hist = await pool.query(
      `SELECT id, status, is_current, marketplace_plan_id
       FROM freelancer_marketplace_memberships
       WHERE freelancer_user_id = $1
       ORDER BY id ASC`,
      [freelancer.id],
    );
    const currentRows = hist.rows.filter((r) => r.is_current);
    assert.equal(currentRows.length, 1);
    for (const row of hist.rows) {
      if (!row.is_current) {
        assert.notEqual(row.status, "active", "must not leave active + is_current=false");
        assert.ok(["superseded", "expired", "cancelled"].includes(row.status));
      }
    }
    const superseded = hist.rows.filter((r) => r.status === "superseded");
    assert.ok(superseded.length >= 1);
    for (const s of superseded) {
      const actions = await auditActions(s.id);
      assert.ok(actions.includes(MEMBERSHIP_AUDIT_ACTIONS.MEMBERSHIP_SUPERSEDED));
      const cyc = await pool.query(
        `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles WHERE membership_id = $1`,
        [s.id],
      );
      assert.ok(cyc.rows[0].c >= 1, "cycles must not cascade-delete");
    }
  });

  it("13-17: Priority Bid consume race, idempotency, cross-cycle, return", async () => {
    const freelancer = await seedUser("freelancer");
    const planId = await planIdByTier("pay_as_you_work");
    const start = new Date("2026-03-17T10:00:00.000Z");
    const { membership, currentCycle } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planId,
        paidTermMonths: 6,
        now: start,
        source: "system",
      });

    await pool.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_allowed = 1, priority_bid_uses_consumed = 0
       WHERE id = $1`,
      [currentCycle.id],
    );

    const [c1, c2] = await Promise.allSettled([
      marketplacePriorityBidUsageService.consumePriorityBidUse({
        freelancerUserId: freelancer.id,
        referenceType: "order",
        referenceId: "race-a",
      }),
      marketplacePriorityBidUsageService.consumePriorityBidUse({
        freelancerUserId: freelancer.id,
        referenceType: "order",
        referenceId: "race-b",
      }),
    ]);
    const success = [c1, c2].filter((r) => r.status === "fulfilled");
    const failed = [c1, c2].filter((r) => r.status === "rejected");
    assert.equal(success.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.publicCode, "PRIORITY_BID_USES_EXHAUSTED");

    const cycleAfter = await pool.query(
      `SELECT priority_bid_uses_allowed, priority_bid_uses_consumed
       FROM marketplace_membership_cycles WHERE id = $1`,
      [currentCycle.id],
    );
    assert.equal(Number(cycleAfter.rows[0].priority_bid_uses_allowed), 1);
    assert.equal(Number(cycleAfter.rows[0].priority_bid_uses_consumed), 1);
    const consumeEvents = await pool.query(
      `SELECT * FROM marketplace_membership_cycle_usage
       WHERE cycle_id = $1 AND event_type = 'consumed'`,
      [currentCycle.id],
    );
    assert.equal(consumeEvents.rows.length, 1);

    // Same-reference idempotency: restore one remaining for a fresh cycle setup
    await pool.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_allowed = 2, priority_bid_uses_consumed = 1
       WHERE id = $1`,
      [currentCycle.id],
    );
    const first = await marketplacePriorityBidUsageService.consumePriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "same-ref-1",
    });
    const second = await marketplacePriorityBidUsageService.consumePriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "same-ref-1",
    });
    assert.equal(second.idempotent, true);
    assert.equal(String(second.usage.id), String(first.usage.id));
    const cyc2 = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles WHERE id = $1`,
      [currentCycle.id],
    );
    assert.equal(Number(cyc2.rows[0].priority_bid_uses_consumed), 2);
    const sameRefEvents = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycle_usage
       WHERE cycle_id = $1 AND reference_id = 'same-ref-1' AND event_type = 'consumed'`,
      [currentCycle.id],
    );
    assert.equal(sameRefEvents.rows[0].c, 1);

    // Cross-cycle same reference allowed (migration 138)
    await pool.query(
      `UPDATE marketplace_membership_cycles SET status = 'closed', closed_at = NOW() WHERE id = $1`,
      [currentCycle.id],
    );
    const cycleB = await marketplaceMembershipCyclesService.createAndActivateCycleForMembership({
      membership: { id: membership.id },
      cycleNumber: 2,
      now: new Date("2026-04-17T10:00:00.000Z"),
    });
    await pool.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_allowed = 1, priority_bid_uses_consumed = 0 WHERE id = $1`,
      [cycleB.id],
    );
    const cross = await marketplacePriorityBidUsageService.consumePriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "same-ref-1",
    });
    assert.equal(cross.ok, true);
    assert.notEqual(cross.idempotent, true);

    // Return linkage + double return
    const ret1 = await marketplacePriorityBidUsageService.returnPriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "same-ref-1",
    });
    assert.ok(ret1.usage.relatedUsageId);
    assert.equal(String(ret1.usage.relatedUsageId), String(cross.usage.id));
    const afterRet = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles WHERE id = $1`,
      [cycleB.id],
    );
    assert.equal(Number(afterRet.rows[0].priority_bid_uses_consumed), 0);

    const ret2 = await marketplacePriorityBidUsageService.returnPriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "same-ref-1",
    });
    assert.equal(ret2.idempotent, true);
    const returns = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycle_usage
       WHERE cycle_id = $1 AND event_type = 'returned'
         AND related_usage_id = $2`,
      [cycleB.id, cross.usage.id],
    );
    assert.equal(returns.rows[0].c, 1);
    const afterRet2 = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles WHERE id = $1`,
      [cycleB.id],
    );
    assert.equal(Number(afterRet2.rows[0].priority_bid_uses_consumed), 0);

    // Return without consume
    await assert.rejects(
      () =>
        marketplacePriorityBidUsageService.returnPriorityBidUse({
          freelancerUserId: freelancer.id,
          referenceType: "order",
          referenceId: "never-consumed-xyz",
        }),
      (err) => err.publicCode === "PRIORITY_USE_NOT_FOUND",
    );
    const phantom = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycle_usage
       WHERE reference_id = 'never-consumed-xyz'`,
    );
    assert.equal(phantom.rows[0].c, 0);
  });

  it("18-20: suspended usage, past-term expire/resume, resume anniversary window", async () => {
    const freelancer = await seedUser("freelancer");
    const planId = await planIdByTier("active");
    const start = new Date("2026-01-17T10:00:00.000Z");
    const { membership, currentCycle } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planId,
        paidTermMonths: 12,
        now: start,
        source: "system",
      });

    await marketplaceMembershipsService.suspendMarketplaceMembership({
      membershipId: membership.id,
      now: new Date("2026-02-10T10:00:00.000Z"),
    });
    await assert.rejects(
      () =>
        marketplacePriorityBidUsageService.consumePriorityBidUse({
          freelancerUserId: freelancer.id,
          referenceType: "order",
          referenceId: "suspended-block",
        }),
      (err) => err.publicCode === "NO_ACTIVE_MEMBERSHIP_CYCLE",
    );
    const usage = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycle_usage
       WHERE membership_id = $1 AND reference_id = 'suspended-block'`,
      [membership.id],
    );
    assert.equal(usage.rows[0].c, 0);
    const cyc = await pool.query(
      `SELECT priority_bid_uses_consumed FROM marketplace_membership_cycles WHERE id = $1`,
      [currentCycle.id],
    );
    assert.equal(Number(cyc.rows[0].priority_bid_uses_consumed), 0);

    // Past term while suspended → reconcile expires; resume must not reactivate
    const short = await seedUser("freelancer");
    const { membership: m2 } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: short.id,
        marketplacePlanId: planId,
        paidTermStartsAt: new Date("2026-01-17T10:00:00.000Z"),
        paidTermEndsAt: new Date("2026-02-17T10:00:00.000Z"),
        now: new Date("2026-01-17T10:00:00.000Z"),
        source: "system",
      });
    await marketplaceMembershipsService.suspendMarketplaceMembership({
      membershipId: m2.id,
      now: new Date("2026-02-01T10:00:00.000Z"),
    });
    const past = new Date("2026-02-20T10:00:00.000Z");
    const rec = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: m2.id,
      now: past,
    });
    assert.equal(rec.expired, true);
    const m2row = await marketplaceMembershipsService.getMarketplaceMembershipById(m2.id);
    assert.equal(m2row.status, "expired");
    assert.equal(m2row.isCurrent, false);
    const act = await activeCyclesForMembership(m2.id);
    assert.equal(act.length, 0);

    await assert.rejects(
      () =>
        marketplaceMembershipsService.resumeMarketplaceMembership({
          membershipId: m2.id,
          now: past,
        }),
      (err) => err.publicCode === "MEMBERSHIP_RESUME_INVALID",
    );

    // Suspend Feb → resume May 20 → cycle #5 May17–Jun17
    const long = await seedUser("freelancer");
    const { membership: m3 } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: long.id,
        marketplacePlanId: planId,
        paidTermMonths: 12,
        now: start,
        source: "system",
      });
    await marketplaceMembershipsService.suspendMarketplaceMembership({
      membershipId: m3.id,
      now: new Date("2026-02-10T10:00:00.000Z"),
    });
    const resumed = await marketplaceMembershipsService.resumeMarketplaceMembership({
      membershipId: m3.id,
      now: new Date("2026-05-20T12:00:00.000Z"),
    });
    assert.equal(resumed.status, "active");
    assert.equal(resumed.isCurrent, true);
    const due = await marketplaceMembershipCyclesService.getCurrentActiveCycle(m3.id, {
      now: new Date("2026-05-20T12:00:00.000Z"),
    });
    assert.ok(due);
    assert.equal(due.cycleNumber, 5);
    assert.equal(new Date(due.startsAt).toISOString(), "2026-05-17T10:00:00.000Z");
    assert.equal(new Date(due.endsAt).toISOString(), "2026-06-17T10:00:00.000Z");
    const mid = await pool.query(
      `SELECT cycle_number FROM marketplace_membership_cycles
       WHERE membership_id = $1 AND cycle_number IN (2,3,4)`,
      [m3.id],
    );
    assert.equal(mid.rows.length, 0);
  });

  it("21-24: cancel_at_period_end + exact boundary + missed multi-cycle", async () => {
    const freelancer = await seedUser("freelancer");
    const planId = await planIdByTier("pro");
    const start = new Date("2026-08-17T10:00:00.000Z");
    const termEnd = new Date("2026-09-17T10:00:00.000Z");
    const { membership, currentCycle } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planId,
        paidTermStartsAt: start,
        paidTermEndsAt: termEnd,
        now: start,
        source: "system",
      });

    await marketplaceMembershipsService.cancelMarketplaceMembership({
      membershipId: membership.id,
      immediate: false,
      now: new Date("2026-08-20T10:00:00.000Z"),
    });
    const cancelled = await marketplaceMembershipsService.getMarketplaceMembershipById(membership.id);
    assert.equal(cancelled.status, "cancel_at_period_end");
    assert.equal(cancelled.isCurrent, true);

    await pool.query(
      `UPDATE marketplace_membership_cycles
       SET priority_bid_uses_allowed = 1, priority_bid_uses_consumed = 0 WHERE id = $1`,
      [currentCycle.id],
    );
    const consume = await marketplacePriorityBidUsageService.consumePriorityBidUse({
      freelancerUserId: freelancer.id,
      referenceType: "order",
      referenceId: "cancel-pre-expiry",
    });
    assert.equal(consume.ok, true);

    // Exact boundary: still valid at T-1s
    const still = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: membership.id,
      now: new Date("2026-09-17T09:59:59.000Z"),
    });
    assert.notEqual(still.expired, true);
    const stillMem = await marketplaceMembershipsService.getMarketplaceMembershipById(membership.id);
    assert.equal(stillMem.status, "cancel_at_period_end");
    assert.equal(stillMem.isCurrent, true);

    // At exact term end → expired, no cycle 2
    const atEnd = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: membership.id,
      now: termEnd,
    });
    assert.equal(atEnd.expired, true);
    const expired = await marketplaceMembershipsService.getMarketplaceMembershipById(membership.id);
    assert.equal(expired.status, "expired");
    assert.equal(expired.isCurrent, false);
    const c2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles
       WHERE membership_id = $1 AND cycle_number = 2`,
      [membership.id],
    );
    assert.equal(c2.rows[0].c, 0);

    await assert.rejects(
      () =>
        marketplacePriorityBidUsageService.consumePriorityBidUse({
          freelancerUserId: freelancer.id,
          referenceType: "order",
          referenceId: "after-expiry",
        }),
      (err) => err.publicCode === "NO_ACTIVE_MEMBERSHIP_CYCLE",
    );

    // Missed multi-cycle: Jan17 → May25 → cycle 5 only
    const f2 = await seedUser("freelancer");
    const jan = new Date("2026-01-17T10:00:00.000Z");
    const { membership: mMiss } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: f2.id,
        marketplacePlanId: planId,
        paidTermMonths: 12,
        now: jan,
        source: "system",
      });
    const miss = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: mMiss.id,
      now: new Date("2026-05-25T12:00:00.000Z"),
    });
    assert.equal(miss.created, true);
    assert.equal(miss.dueCycleNumber, 5);
    assert.equal(miss.cycle.cycleNumber, 5);
    const nums = await pool.query(
      `SELECT cycle_number FROM marketplace_membership_cycles
       WHERE membership_id = $1 ORDER BY cycle_number`,
      [mMiss.id],
    );
    assert.deepEqual(
      nums.rows.map((r) => Number(r.cycle_number)),
      [1, 5],
    );
  });

  it("25-28: multi-instance reconcile races + retry no-op + duplicate audit", async () => {
    const freelancer = await seedUser("freelancer");
    const planId = await planIdByTier("elite");
    const jan = new Date("2026-01-17T10:00:00.000Z");
    const { membership } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: freelancer.id,
        marketplacePlanId: planId,
        paidTermMonths: 12,
        now: jan,
        source: "system",
      });

    const now = new Date("2026-05-25T12:00:00.000Z");
    const [a, b] = await Promise.all([
      marketplaceMembershipCyclesService.reconcileMembershipCycles({
        membershipId: membership.id,
        now,
      }),
      marketplaceMembershipCyclesService.reconcileMembershipCycles({
        membershipId: membership.id,
        now,
      }),
    ]);
    assert.ok(a.ok && b.ok);
    const cycles = await pool.query(
      `SELECT cycle_number, status FROM marketplace_membership_cycles
       WHERE membership_id = $1 ORDER BY cycle_number`,
      [membership.id],
    );
    const fives = cycles.rows.filter((r) => Number(r.cycle_number) === 5);
    assert.equal(fives.length, 1);
    assert.equal(fives[0].status, "active");
    assert.equal(await countCurrent(freelancer.id), 1);

    const createdAudits = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_audit_logs
       WHERE membership_id = $1 AND action = $2
         AND detail_json->>'cycleNumber' = '5'`,
      [membership.id, MEMBERSHIP_AUDIT_ACTIONS.CYCLE_CREATED],
    );
    assert.equal(createdAudits.rows[0].c, 1);
    const activatedAudits = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_audit_logs
       WHERE membership_id = $1 AND action = $2
         AND detail_json->>'cycleNumber' = '5'
         AND COALESCE(detail_json->>'via','') <> 'idempotent_reactivate'`,
      [membership.id, MEMBERSHIP_AUDIT_ACTIONS.CYCLE_ACTIVATED],
    );
    assert.equal(activatedAudits.rows[0].c, 1);

    const before = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_audit_logs WHERE membership_id = $1`,
      [membership.id],
    );
    const retry = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: membership.id,
      now,
    });
    assert.equal(retry.created, false);
    const after = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_audit_logs WHERE membership_id = $1`,
      [membership.id],
    );
    assert.equal(after.rows[0].c, before.rows[0].c);
    const cycles2 = await pool.query(
      `SELECT COUNT(*)::int AS c FROM marketplace_membership_cycles WHERE membership_id = $1`,
      [membership.id],
    );
    assert.equal(cycles2.rows[0].c, cycles.rows.length);
  });

  it("29-32: pending status, plan snapshot, engineAvailable=false, no token wallet", async () => {
    const freelancer = await seedUser("freelancer");
    const planId = await planIdByTier("pro");
    const { rows: planRows } = await pool.query(
      `SELECT priority_bid_uses_per_cycle FROM marketplace_membership_plans WHERE id = $1`,
      [planId],
    );
    assert.equal(Number(planRows[0].priority_bid_uses_per_cycle), 3);

    // Pending membership (direct insert — no public create path yet)
    const { rows: pendingIns } = await pool.query(
      `INSERT INTO freelancer_marketplace_memberships (
         freelancer_user_id, marketplace_plan_id, is_current, status, source,
         cycle_anchor_day, started_at, paid_term_starts_at, paid_term_ends_at
       ) VALUES ($1, $2, TRUE, 'pending', 'system', 17, NOW(), NOW(), NOW() + INTERVAL '30 days')
       RETURNING id`,
      [freelancer.id, planId],
    );
    const pendingId = pendingIns[0].id;
    await assert.rejects(
      () =>
        marketplacePriorityBidUsageService.consumePriorityBidUse({
          freelancerUserId: freelancer.id,
          referenceType: "order",
          referenceId: "pending-block",
        }),
      (err) => err.publicCode === "NO_ACTIVE_MEMBERSHIP_CYCLE",
    );
    const pendingRec = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: pendingId,
      now: new Date(),
    });
    assert.equal(pendingRec.reason, "membership_not_reconcileable");

    // Clear pending so activation tests can proceed on another freelancer
    await pool.query(
      `UPDATE freelancer_marketplace_memberships
       SET is_current = FALSE, status = 'cancelled', ended_at = NOW()
       WHERE id = $1`,
      [pendingId],
    );

    const f2 = await seedUser("freelancer");
    const start = new Date("2026-01-17T10:00:00.000Z");
    const { membership, currentCycle } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: f2.id,
        marketplacePlanId: planId,
        paidTermMonths: 12,
        now: start,
        source: "system",
      });
    assert.equal(Number(currentCycle.priorityBidUsesAllowed), 3);

    await pool.query(
      `UPDATE marketplace_membership_plans SET priority_bid_uses_per_cycle = 5 WHERE id = $1`,
      [planId],
    );
    const refreshedPlan = await marketplaceMembershipPlansService.getMarketplaceMembershipPlanById(planId);
    assert.equal(Number(refreshedPlan.priorityBidUsesPerCycle), 5);

    const still = await pool.query(
      `SELECT priority_bid_uses_allowed FROM marketplace_membership_cycles WHERE id = $1`,
      [currentCycle.id],
    );
    assert.equal(Number(still.rows[0].priority_bid_uses_allowed), 3);

    const next = await marketplaceMembershipCyclesService.reconcileMembershipCycles({
      membershipId: membership.id,
      now: new Date("2026-02-18T10:00:00.000Z"),
    });
    assert.equal(next.created, true);
    assert.equal(Number(next.cycle.priorityBidUsesAllowed), 5);

    const snap = await marketplaceMembershipsService.getFreelancerMarketplaceMembershipSnapshot(f2.id, {
      now: new Date("2026-02-18T10:00:00.000Z"),
    });
    assert.equal(snap.priorityBid.engineAvailable, false);

    const httpSnap = await httpJson(server, "/api/freelancer/marketplace-membership", {
      bearerToken: tokenFor(f2),
    });
    assert.equal(httpSnap.status, 200);
    assert.equal(httpSnap.body.data.priorityBid.engineAvailable, false);

    // No Work Token wallet columns invented
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN ('users','freelancers')
         AND column_name IN ('tokens','work_tokens','token_balance')`,
    );
    assert.equal(cols.rows.length, 0);

    const card = fs.readFileSync(
      path.join(
        __dirname,
        "..",
        "..",
        "frontend",
        "src",
        "components",
        "freelancer",
        "FreelancerMarketplaceMembershipCard.jsx",
      ),
      "utf8",
    );
    assert.ok(card.includes("engineComingSoon"));
    assert.ok(!/onClick=\{.*[Bb]id|Place bid|استخدم الأولوية|startAuction|priorityBidCta/i.test(card));
    assert.ok(!/router\.(post|put|patch).*priority/i.test(card));

    // restore plan uses for other suites in same DB
    await pool.query(
      `UPDATE marketplace_membership_plans SET priority_bid_uses_per_cycle = 3 WHERE id = $1`,
      [planId],
    );
  });

  it("Admin get-by-id works for Super Admin", async () => {
    const sa = await seedUser("super_admin");
    const fl = await seedUser("freelancer");
    const planId = await planIdByTier("pay_as_you_work");
    const { membership } =
      await marketplaceMembershipsService.createAndActivateMarketplaceMembership({
        freelancerUserId: fl.id,
        marketplacePlanId: planId,
        paidTermMonths: 1,
        now: new Date("2026-06-01T10:00:00.000Z"),
        source: "system",
      });
    const res = await httpJson(server, `/api/super-admin/marketplace-memberships/${membership.id}`, {
      bearerToken: tokenFor(sa),
    });
    assert.equal(res.status, 200);
    assert.equal(String(res.body.data.membership.id), String(membership.id));
    assert.equal(res.body.data.paymentIntegration, "not_wired");
  });
});
