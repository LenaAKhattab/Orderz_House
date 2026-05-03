/**
 * Postgres integration: internal admin priced-bidding lifecycle (create → pool → bids → award)
 * without Stripe. Skips when DATABASE_URL / JWT_SECRET are missing or the database is unreachable.
 *
 * This file is listed first in `npm test` so `dotenv` can load `backend/.env` before any other
 * test file sets a placeholder `DATABASE_URL` and initializes the pool.
 */
const path = require("node:path");
const http = require("node:http");
const { describe, it } = require("node:test");
const assert = require("node:assert");
const bcrypt = require("bcrypt");
const crypto = require("node:crypto");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

if (!process.env.CLIENT_URL || !String(process.env.CLIENT_URL).trim()) {
  process.env.CLIENT_URL = "http://localhost:5173";
}

const integrationEnvOk =
  Boolean(String(process.env.DATABASE_URL || "").trim()) &&
  Boolean(String(process.env.JWT_SECRET || "").trim().length >= 16);

const rootDescribe = integrationEnvOk ? describe : describe.skip;

/**
 * @param {import("express").Express} app
 * @returns {Promise<import("http").Server>}
 */
function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

/**
 * @param {import("http").Server} server
 * @param {string} pathname
 * @param {string | null} bearerToken
 * @param {string} method
 */
async function httpRequest(server, pathname, bearerToken, method = "POST") {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} opts
 */
async function insertTestUser(pool, { role, email, password, categories = null }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const accountId = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, freelancer_categories, email_verified, is_active
    ) VALUES (
      $1, 'Int', 'Test', 'User', $2, $3, $4,
      'JO', '+962790000101', '+962790000101', 'ذكر', true, $5::text[], true, true
    ) RETURNING id`,
    [accountId, email.toLowerCase(), passwordHash, role, categories],
  );
  return Number(rows[0].id);
}

rootDescribe("internal priced bidding lifecycle (Postgres integration)", () => {
  it(
    "creates internal priced pool order, freelancers bid, admin approves winner without Stripe; negative paths safe",
    { timeout: 120_000 },
    async (t) => {
      if (!integrationEnvOk) {
        t.skip();
        return;
      }

      const stripeCheckoutService = require("../src/services/stripeCheckoutService");
      const origCheckout = stripeCheckoutService.createClientSelectedBidCheckoutSession;
      let stripeCheckoutCalls = 0;

      const { pool } = require("../src/config/db");
      const app = require("../src/app");
      const ordersService = require("../src/services/ordersService");
      const subscriptionsService = require("../src/services/subscriptionsService");
      const authService = require("../src/services/authService");
      const { ORDER_STATUSES } = ordersService;

      /** @type {{ pool: import("pg").Pool; orderCodes: string[]; userIds: number[] } | null} */
      let cleanupState = null;

      try {
        stripeCheckoutService.createClientSelectedBidCheckoutSession = async (...args) => {
          stripeCheckoutCalls += 1;
          const err = new Error("createClientSelectedBidCheckoutSession must not run for internal award");
          err.statusCode = 500;
          throw err;
        };

        try {
          await pool.query("SELECT 1");
        } catch {
          t.skip();
          return;
        }

        const suffix = `${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const password = "IntegrationTest1!";
        const adminEmail = `intadm_${suffix}@example.test`;
        const faEmail = `intf_a_${suffix}@example.test`;
        const fbEmail = `intf_b_${suffix}@example.test`;
        const clientEmail = `intcli_${suffix}@example.test`;

        const adminId = await insertTestUser(pool, { role: "super_admin", email: adminEmail, password });
        const freelancerA = await insertTestUser(pool, {
          role: "freelancer",
          email: faEmail,
          password,
          categories: ["programming"],
        });
        const freelancerB = await insertTestUser(pool, {
          role: "freelancer",
          email: fbEmail,
          password,
          categories: ["programming"],
        });
        const clientId = await insertTestUser(pool, { role: "client", email: clientEmail, password });

        const orderCode = `INT-${suffix}`;
        const secondOrderCode = `INT2-${suffix}`;
        cleanupState = { pool, orderCodes: [orderCode, secondOrderCode], userIds: [adminId, freelancerA, freelancerB, clientId] };

        const { rows: catRows } = await pool.query(`SELECT id FROM categories WHERE slug = 'programming' LIMIT 1`);
        assert.ok(catRows[0], "seed DB must include programming category (migration 003)");
        const categoryId = Number(catRows[0].id);

        const { rows: planRows } = await pool.query(
          `SELECT id FROM plans WHERE is_active = TRUE AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`,
        );
        assert.ok(planRows[0], "seed DB must include at least one active plan");
        const planId = Number(planRows[0].id);

        await subscriptionsService.assignPlanToFreelancer({
          actorUserId: adminId,
          freelancerUserId: freelancerA,
          planId,
          notes: "integration test",
        });
        await subscriptionsService.assignPlanToFreelancer({
          actorUserId: adminId,
          freelancerUserId: freelancerB,
          planId,
          notes: "integration test",
        });

        const created = await ordersService.createInternalOrder({
          actorUserId: adminId,
          actorRole: "super_admin",
          payload: {
            orderCode,
            title: "Integration internal bid order",
            description: "Integration test description for internal priced bidding lifecycle is long enough.",
            categoryId,
            projectType: "bidding",
            bidBudgetMin: 10,
            bidBudgetMax: 100,
            durationValue: 7,
            durationUnit: "days",
            preferredSkills: [],
          },
          uploadedFiles: [],
        });

        const orderId = Number(created.id);
        assert.strictEqual(created.orderStatus, ORDER_STATUSES.OPEN_FOR_BIDS);
        assert.strictEqual(created.isOpenForPool, true);
        assert.strictEqual(created.paymentRequired, false);
        assert.strictEqual(created.paymentStatus, "not_required");
        assert.strictEqual(created.sourceType, "super_admin_created");

        const { rows: poolVisible } = await pool.query(
          `SELECT 1 AS ok
           FROM orders o
           WHERE o.id = $1
             AND o.is_published = TRUE
             AND o.is_open_for_pool = TRUE
             AND o.assigned_freelancer_id IS NULL
             AND o.order_status = 'open_for_bids'
             AND o.source_type IN ('admin_created','super_admin_created')
             AND o.project_type = 'bidding'
             AND o.bid_budget_min IS NOT NULL
             AND o.bid_budget_max IS NOT NULL
             AND o.bid_budget_min > 0
             AND o.bid_budget_max >= o.bid_budget_min
           LIMIT 1`,
          [orderId],
        );
        assert.ok(
          poolVisible[0],
          "internal priced-bidding order should be pool-eligible (same predicates as listPoolOrders real branch)",
        );

        await ordersService.submitPoolOrderBid({
          freelancerUserId: freelancerA,
          orderId,
          amount: 50,
          message: null,
        });
        const orderAfterA = await ordersService.submitPoolOrderBid({
          freelancerUserId: freelancerB,
          orderId,
          amount: 60,
          message: null,
        });

        const bidA = orderAfterA.bidUsers.find((b) => String(b.user.id) === String(freelancerA));
        const bidB = orderAfterA.bidUsers.find((b) => String(b.user.id) === String(freelancerB));
        assert.ok(bidA && bidB, "both freelancer bids should exist");
        const bidIdA = Number(bidA.bidId);
        const bidIdB = Number(bidB.bidId);

        const adminLogin = await authService.loginUser(adminEmail, password);
        const freelancerLogin = await authService.loginUser(faEmail, password);
        const clientLogin = await authService.loginUser(clientEmail, password);

        const server = await listenApp(app);

        try {
          const otherOrder = await ordersService.createInternalOrder({
            actorUserId: adminId,
            actorRole: "super_admin",
            payload: {
              orderCode: secondOrderCode,
              title: "Second order for bid mismatch",
              description: "Second integration order description long enough for validators and service.",
              categoryId,
              projectType: "bidding",
              bidBudgetMin: 20,
              bidBudgetMax: 200,
              durationValue: 3,
              durationUnit: "days",
              preferredSkills: [],
            },
            uploadedFiles: [],
          });
          const otherOrderId = Number(otherOrder.id);
          await ordersService.submitPoolOrderBid({
            freelancerUserId: freelancerA,
            orderId: otherOrderId,
            amount: 100,
            message: null,
          });
          const { rows: otherBidRows } = await pool.query(
            `SELECT id FROM order_freelancer_bids WHERE order_id = $1 LIMIT 1`,
            [otherOrderId],
          );
          const foreignBidId = Number(otherBidRows[0].id);

          const mismatch = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${foreignBidId}/approve`,
            adminLogin.token,
          );
          assert.ok(
            [400, 404].includes(mismatch.status),
            `expected 400 or 404 for foreign bid on open order, got ${mismatch.status}`,
          );
          const { rows: mainBeforeAward } = await pool.query(
            `SELECT assigned_freelancer_id, selected_bid_id, order_status FROM orders WHERE id = $1`,
            [orderId],
          );
          assert.strictEqual(mainBeforeAward[0].assigned_freelancer_id, null);
          assert.strictEqual(mainBeforeAward[0].selected_bid_id, null);
          assert.strictEqual(mainBeforeAward[0].order_status, ORDER_STATUSES.OPEN_FOR_BIDS);

          const approveWinner = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${bidIdB}/approve`,
            adminLogin.token,
          );
          assert.strictEqual(approveWinner.status, 200);
          assert.strictEqual(approveWinner.body?.success, true);
          assert.strictEqual(stripeCheckoutCalls, 0);

          const orderJson = approveWinner.body?.data?.order;
          assert.ok(orderJson);
          assert.strictEqual(String(orderJson.assignedFreelancerId), String(freelancerB));
          assert.strictEqual(orderJson.orderStatus, ORDER_STATUSES.IN_PROGRESS);
          assert.strictEqual(orderJson.isOpenForPool, false);
          assert.strictEqual(orderJson.paymentRequired, false);
          assert.strictEqual(orderJson.paymentStatus, "not_required");

          const { rows: dbOrder } = await pool.query(
            `SELECT assigned_freelancer_id, selected_bid_id, order_status, is_open_for_pool, payment_required, payment_status
             FROM orders WHERE id = $1`,
            [orderId],
          );
          assert.strictEqual(Number(dbOrder[0].assigned_freelancer_id), freelancerB);
          assert.strictEqual(Number(dbOrder[0].selected_bid_id), bidIdB);
          assert.strictEqual(dbOrder[0].order_status, ORDER_STATUSES.IN_PROGRESS);
          assert.strictEqual(dbOrder[0].is_open_for_pool, false);
          assert.strictEqual(dbOrder[0].payment_required, false);
          assert.strictEqual(String(dbOrder[0].payment_status), "not_required");

          const { rows: bidRows } = await pool.query(
            `SELECT id, freelancer_user_id, status FROM order_freelancer_bids WHERE order_id = $1 ORDER BY id`,
            [orderId],
          );
          const rowA = bidRows.find((r) => Number(r.id) === bidIdA);
          const rowB = bidRows.find((r) => Number(r.id) === bidIdB);
          assert.strictEqual(String(rowB.status), "accepted");
          assert.strictEqual(String(rowA.status), "rejected");

          const loseAgain = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${bidIdA}/approve`,
            adminLogin.token,
          );
          assert.strictEqual(loseAgain.status, 409);

          const { rows: dbOrderAfterLose } = await pool.query(
            `SELECT assigned_freelancer_id, selected_bid_id FROM orders WHERE id = $1`,
            [orderId],
          );
          assert.strictEqual(Number(dbOrderAfterLose[0].assigned_freelancer_id), freelancerB);
          assert.strictEqual(Number(dbOrderAfterLose[0].selected_bid_id), bidIdB);

          const approveWinnerAgain = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${bidIdB}/approve`,
            adminLogin.token,
          );
          assert.strictEqual(approveWinnerAgain.status, 200);
          assert.strictEqual(approveWinnerAgain.body?.success, true);
          assert.strictEqual(approveWinnerAgain.body?.data?.alreadyApplied, true);

          const freelancerApprove = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${bidIdB}/approve`,
            freelancerLogin.token,
          );
          assert.strictEqual(freelancerApprove.status, 403);

          const clientApprove = await httpRequest(
            server,
            `/api/admin/orders/${orderId}/bids/${bidIdB}/approve`,
            clientLogin.token,
          );
          assert.strictEqual(clientApprove.status, 403);
        } finally {
          await new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
          });
        }
      } finally {
        if (cleanupState) {
          try {
            await cleanupState.pool.query(`DELETE FROM orders WHERE order_code = ANY($1::text[])`, [
              cleanupState.orderCodes,
            ]);
            await cleanupState.pool.query(
              `DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = ANY($1::bigint[])`,
              [[cleanupState.userIds[1], cleanupState.userIds[2]]],
            );
            await cleanupState.pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [cleanupState.userIds]);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("[internalPricedBiddingLifecycle.integration] cleanup failed:", err?.message || err);
          }
        }
        stripeCheckoutService.createClientSelectedBidCheckoutSession = origCheckout;
      }
    },
  );
});
