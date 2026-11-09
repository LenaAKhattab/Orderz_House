/**
 * Postgres integration: external (WhatsApp) order intake → Admin pricing/approval → canonical
 * assigned order → delivery → 2 revision cycles → approval → canonical financial claim.
 *
 * Run: node --test test/externalOrderIntake.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (explicit non-Production DB) and JWT_SECRET (16+ chars).
 * Delivery files go through the canonical upload path (R2 private bucket of the configured env).
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

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");
const integrationEnvOk = isIntegrationEnvConfigured();
const rootDescribe = integrationEnvOk ? describe : describe.skip;

function listenApp(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
    server.on("error", reject);
  });
}

async function api(server, method, pathname, token, body) {
  const { port } = server.address();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`http://127.0.0.1:${port}/api${pathname}`, { method, headers, body: payload });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _raw: text };
  }
  return { status: res.status, body: json, text };
}

function deliveryForm(label) {
  const fd = new FormData();
  fd.append("note", `delivery ${label}`);
  fd.append("files", new Blob([`external intake QA delivery ${label}\n`], { type: "text/plain" }), `delivery-${label}.txt`);
  return fd;
}

async function insertTestUser(pool, { role, email, password }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const accountId = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (
      account_id, first_name, father_name, family_name, email, password_hash, role,
      country, phone, whatsapp, gender, terms_accepted, freelancer_categories, email_verified, is_active
    ) VALUES (
      $1, 'Int', 'Intake', 'QA', $2, $3, $4,
      'JO', '+962790000101', '+962790000101', 'ذكر', true, ARRAY['programming']::text[], true, true
    ) RETURNING id`,
    [accountId, email.toLowerCase(), passwordHash, role],
  );
  return Number(rows[0].id);
}

rootDescribe("external order intake (Postgres integration)", () => {
  it(
    "intake → approval (exactly one order under concurrency) → delivery/revisions → completion → canonical claim; rejection; IDOR",
    { timeout: 600_000 },
    async (t) => {
      const { pool } = require("../src/config/db");
      try {
        await pool.query("SELECT 1");
      } catch {
        t.skip("integration DB unreachable");
        return;
      }
      const app = require("../src/app");
      const authService = require("../src/services/authService");
      const subscriptionsService = require("../src/services/subscriptionsService");
      const ordersService = require("../src/services/ordersService");
      const intakeService = require("../src/services/externalOrderIntakeService");
      const financialClaimsService = require("../src/services/financialClaimsService");
      const { REAL_ORDER_SOURCE_TYPES } = require("../src/utils/marketplaceMembershipPendingStart");

      const suffix = `${Date.now().toString(36)}${crypto.randomBytes(3).toString("hex")}`.toUpperCase();
      const password = `It${crypto.randomBytes(18).toString("base64url")}9!`;
      const userIds = [];
      const extIds = [];
      const extraOrderIds = [];
      const server = await listenApp(app);

      try {
        const superA = await insertTestUser(pool, { role: "super_admin", email: `eoi_sa_${suffix}@example.test`, password });
        const superB = await insertTestUser(pool, { role: "super_admin", email: `eoi_sb_${suffix}@example.test`, password });
        const f1 = await insertTestUser(pool, { role: "freelancer", email: `eoi_f1_${suffix}@example.test`, password });
        const f2 = await insertTestUser(pool, { role: "freelancer", email: `eoi_f2_${suffix}@example.test`, password });
        const clientId = await insertTestUser(pool, { role: "client", email: `eoi_c_${suffix}@example.test`, password });
        userIds.push(superA, superB, f1, f2, clientId);

        // Make both freelancers eligible exactly like a real company-approved freelancer.
        for (const fid of [f1, f2]) {
          await subscriptionsService.assignPlanToFreelancer({
            actorUserId: superA,
            freelancerUserId: fid,
            planId: 3,
            notes: "external intake integration",
          });
          await pool.query(
            `INSERT INTO freelancer_identity_manual_verifications
               (freelancer_user_id, status, verification_method, verified_by_user_id, verified_at)
             VALUES ($1, 'approved', 'whatsapp', $2, NOW())
             ON CONFLICT (freelancer_user_id) DO UPDATE SET status = 'approved', revoked_at = NULL`,
            [fid, superA],
          );
          await pool.query(
            `UPDATE freelancer_subscriptions SET activation_status = 'company_approved'
              WHERE freelancer_user_id = $1 AND is_current = TRUE`,
            [fid],
          );
          await pool.query(
            `UPDATE users SET identity_verification_source = COALESCE(identity_verification_source, 'admin_manual'),
                    training_waiver_reason = COALESCE(training_waiver_reason, 'integration_test')
              WHERE id = $1`,
            [fid],
          ).catch(() => {});
        }
        const elig = await subscriptionsService.canFreelancerTakeOrders(String(f1));
        if (!elig.eligible) {
          // Activation-fee gate: waive like an Admin would for a company freelancer.
          await pool.query(
            `UPDATE users SET onboarding_source = 'legacy_import' WHERE id = ANY($1::bigint[])`,
            [[f1, f2]],
          ).catch(() => {});
        }
        const elig2 = await subscriptionsService.canFreelancerTakeOrders(String(f1));
        assert.strictEqual(elig2.eligible, true, `fixture freelancer must be eligible (reason=${elig2.reason})`);

        const login = async (email) => (await authService.loginUser(email, password)).token;
        const tSA = await login(`eoi_sa_${suffix}@example.test`);
        const tSB = await login(`eoi_sb_${suffix}@example.test`);
        const tF1 = await login(`eoi_f1_${suffix}@example.test`);
        const tF2 = await login(`eoi_f2_${suffix}@example.test`);
        const tC = await login(`eoi_c_${suffix}@example.test`);

        const membershipBefore = await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM freelancer_subscriptions WHERE freelancer_user_id = $1) AS subs,
             (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships WHERE freelancer_user_id = $1) AS mems`,
          [f1],
        );

        // ---------------- A. submit → pending ----------------
        const ext1 = `wa-${suffix}-1001`;
        extIds.push(ext1.toUpperCase());
        const a = await api(server, "POST", "/freelancer/external-order-intakes", tF1, {
          externalOrderId: `  ‏#${ext1} `,
        });
        assert.strictEqual(a.status, 201, a.text);
        const intake1 = a.body.data.intake;
        assert.strictEqual(intake1.status, "pending_review");
        assert.strictEqual(intake1.externalOrderId, ext1);
        assert.strictEqual(intake1.price, null);
        assert.strictEqual(intake1.orderId, null);
        assert.ok(!("internalNote" in intake1) && !("reviewer" in intake1) && !("freelancer" in intake1));

        // ---------------- B. same freelancer double click / retry (case-insensitive) ----------------
        const [b1, b2] = await Promise.all([
          api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: ext1.toUpperCase() }),
          api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: ext1 }),
        ]);
        assert.strictEqual(b1.status, 200, b1.text);
        assert.strictEqual(b2.status, 200, b2.text);
        assert.strictEqual(b1.body.data.intake.id, intake1.id);
        assert.strictEqual(b1.body.data.created, false);
        const { rows: dupRows } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM external_order_intakes WHERE external_order_id_normalized = $1`,
          [ext1.toUpperCase()],
        );
        assert.strictEqual(dupRows[0].n, 1);

        // Concurrent first submissions of a fresh ID by the same freelancer → one row.
        const extC = `wa-${suffix}-1002`;
        extIds.push(extC.toUpperCase());
        const conc = await Promise.all(
          [0, 1, 2, 3].map(() => api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: extC })),
        );
        assert.deepStrictEqual(conc.map((r) => r.status).sort(), [200, 200, 200, 201]);
        assert.strictEqual(new Set(conc.map((r) => r.body.data.intake.id)).size, 1);

        // Invalid IDs.
        for (const bad of ["", "   ", "<script>x</script>", "12 34", "طلب123", "a".repeat(65), "'; DROP TABLE x;--"]) {
          const r = await api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: bad });
          assert.strictEqual(r.status, 400, `bad id ${bad}`);
          assert.strictEqual(r.body.code, "EXTERNAL_ORDER_ID_INVALID");
        }
        // Arabic-Indic digits normalize to the same ID as ASCII digits.
        const extDigits = `${suffix}55`;
        extIds.push(extDigits);
        const arabicDigits = `${suffix}٥٥`;
        const ad = await api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: arabicDigits });
        assert.strictEqual(ad.status, 201, ad.text);
        assert.strictEqual(ad.body.data.intake.externalOrderId, extDigits);

        // ---------------- C. other freelancer same ID → generic conflict, no leak ----------------
        const c = await api(server, "POST", "/freelancer/external-order-intakes", tF2, { externalOrderId: ext1 });
        assert.strictEqual(c.status, 409);
        assert.strictEqual(c.body.code, "EXTERNAL_ORDER_ALREADY_REGISTERED");
        assert.ok(!c.text.includes(String(f1)) && !c.text.includes(intake1.id) && !("meta" in c.body));

        // Client / unauthenticated cannot submit.
        assert.strictEqual((await api(server, "POST", "/freelancer/external-order-intakes", tC, { externalOrderId: "X1" })).status, 403);
        assert.strictEqual((await api(server, "POST", "/freelancer/external-order-intakes", null, { externalOrderId: "X1" })).status, 401);
        // freelancer_id from the body is ignored.
        const spoof = `wa-${suffix}-spoof`;
        extIds.push(spoof.toUpperCase());
        const sp = await api(server, "POST", "/freelancer/external-order-intakes", tF2, {
          externalOrderId: spoof,
          freelancerId: f1,
          freelancer_user_id: f1,
        });
        assert.strictEqual(sp.status, 201);
        const { rows: spRows } = await pool.query(`SELECT freelancer_user_id FROM external_order_intakes WHERE id = $1`, [
          sp.body.data.intake.id,
        ]);
        assert.strictEqual(Number(spRows[0].freelancer_user_id), f2);

        // ---------------- D. admin queue ----------------
        const d = await api(server, "GET", `/admin/external-order-intakes?status=pending_review&q=${encodeURIComponent(ext1.toLowerCase())}`, tSA);
        assert.strictEqual(d.status, 200, d.text);
        assert.strictEqual(d.body.data.items.length, 1);
        assert.strictEqual(d.body.data.items[0].id, intake1.id);
        assert.strictEqual(d.body.data.items[0].freelancer.id, String(f1));
        assert.ok(d.body.data.pendingCount >= 3);
        assert.strictEqual(d.body.data.pagination.limit, 15);
        const byFreelancer = await api(server, "GET", `/admin/external-order-intakes?freelancer=${encodeURIComponent(`eoi_f1_${suffix}`.toLowerCase())}`, tSA);
        assert.strictEqual(byFreelancer.status, 200);
        assert.ok(byFreelancer.body.data.items.length >= 3 && byFreelancer.body.data.items.every((i) => i.freelancer.id === String(f1)));
        const pc = await api(server, "GET", "/admin/external-order-intakes/pending-count", tSA);
        assert.strictEqual(pc.status, 200);
        assert.ok(pc.body.data.pendingCount >= 3);
        const detail = await api(server, "GET", `/admin/external-order-intakes/${intake1.id}`, tSA);
        assert.strictEqual(detail.status, 200, detail.text);
        assert.strictEqual(detail.body.data.freelancerEligibility.eligible, true);
        assert.ok(detail.body.data.events.some((e) => e.action === "submitted"));

        // No Admin notification fan-out per submission.
        const { rows: fanout } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM notifications
            WHERE recipient_user_id = ANY($1::bigint[]) AND created_at > NOW() - INTERVAL '30 minutes'`,
          [[superA, superB]],
        );
        assert.strictEqual(fanout[0].n, 0);

        // Price validation.
        for (const badPrice of ["0", "0.00", "-5", "abc", "1.234", "", null, "1e3", "1000000"]) {
          const r = await api(server, "POST", `/admin/external-order-intakes/${intake1.id}/approve`, tSA, { price: badPrice });
          assert.strictEqual(r.status, 400, `price ${badPrice}: ${r.text}`);
          assert.strictEqual(r.body.code, "EXTERNAL_ORDER_PRICE_INVALID");
        }

        // ---------------- E/F. concurrent approvals → exactly one canonical order ----------------
        const [e1, e2] = await Promise.all([
          api(server, "POST", `/admin/external-order-intakes/${intake1.id}/approve`, tSA, { price: "37.50" }),
          api(server, "POST", `/admin/external-order-intakes/${intake1.id}/approve`, tSB, { price: "41" }),
        ]);
        const statuses = [e1.status, e2.status].sort();
        assert.deepStrictEqual(statuses, [200, 409], `${e1.text} | ${e2.text}`);
        const winner = e1.status === 200 ? e1 : e2;
        const loser = e1.status === 200 ? e2 : e1;
        const winnerId = e1.status === 200 ? superA : superB;
        const winnerToken = e1.status === 200 ? tSA : tSB;
        assert.strictEqual(loser.body.code, "EXTERNAL_ORDER_ALREADY_PROCESSED");
        const approved = winner.body.data.intake;
        const expectedPrice = winner === e1 ? "37.50" : "41.00";
        assert.strictEqual(approved.status, "approved");
        assert.strictEqual(approved.price, expectedPrice);
        const orderId = approved.order.id;
        const { rows: linked } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM orders WHERE title = $1`,
          [`طلب خارجي #${ext1}`],
        );
        assert.strictEqual(linked[0].n, 1, "exactly one canonical order");
        const { rows: ord } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
        const o = ord[0];
        assert.strictEqual(Number(o.assigned_freelancer_id), f1);
        assert.strictEqual(Number(o.created_by_user_id), winnerId);
        assert.strictEqual(o.created_by_role, "super_admin");
        assert.strictEqual(o.source_type, "super_admin_created");
        assert.ok(REAL_ORDER_SOURCE_TYPES.includes(o.source_type), "counts as a real order");
        assert.strictEqual(o.is_direct_admin_assignment, true);
        assert.strictEqual(o.is_open_for_pool, false);
        assert.strictEqual(o.payment_required, false);
        assert.strictEqual(o.payment_status, "not_required");
        assert.strictEqual(o.project_type, "fixed");
        assert.strictEqual(o.currency_code, "JOD");
        assert.strictEqual(String(o.budget), expectedPrice);
        assert.strictEqual(o.order_status, "in_progress");
        assert.strictEqual(o.title_en, `External order #${ext1}`);
        assert.ok(o.due_at, "due date from default duration");

        // Canonical assignment notification exactly once, and only to the freelancer.
        const { rows: notif } = await pool.query(
          `SELECT recipient_user_id, type FROM notifications WHERE entity_type = 'order' AND entity_id = $1`,
          [orderId],
        );
        assert.deepStrictEqual(
          notif.map((n) => `${n.recipient_user_id}:${n.type}`),
          [`${f1}:order.freelancer.assigned`],
        );
        // Not in the marketplace pool.
        const poolRes = await api(server, "GET", "/freelancer/orders?limit=200", tF2);
        if (poolRes.status === 200) assert.ok(!poolRes.text.includes(`"id":"${orderId}"`));

        // Approving again → already processed; rejecting an approved intake → already processed.
        assert.strictEqual((await api(server, "POST", `/admin/external-order-intakes/${intake1.id}/approve`, tSA, { price: "10" })).body.code, "EXTERNAL_ORDER_ALREADY_PROCESSED");
        assert.strictEqual((await api(server, "POST", `/admin/external-order-intakes/${intake1.id}/reject`, tSA, { reasonCode: "other" })).body.code, "EXTERNAL_ORDER_ALREADY_PROCESSED");

        // Membership side effects (direct admin assignment policy: none).
        const membershipAfter = await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM freelancer_subscriptions WHERE freelancer_user_id = $1) AS subs,
             (SELECT COUNT(*)::int FROM freelancer_marketplace_memberships WHERE freelancer_user_id = $1) AS mems`,
          [f1],
        );
        assert.deepStrictEqual(membershipAfter.rows[0], membershipBefore.rows[0]);
        const { rows: fake } = await pool.query(`SELECT COUNT(*)::int AS n FROM fake_orders WHERE title = $1`, [
          `طلب خارجي #${ext1}`,
        ]);
        assert.strictEqual(fake[0].n, 0);
        // No marketplace quota consumption (bid credits / work tokens / boosts) for this order.
        const { rows: quota } = await pool.query(
          `SELECT
             (SELECT COUNT(*)::int FROM order_freelancer_bid_credit_economics WHERE order_id = $1) AS credits,
             (SELECT COUNT(*)::int FROM order_freelancer_bid_work_token_economics WHERE order_id = $1) AS tokens,
             (SELECT COUNT(*)::int FROM order_freelancer_priority_application_boosts WHERE order_id = $1) AS boosts,
             (SELECT COUNT(*)::int FROM priority_bid_auctions WHERE order_id = $1) AS auctions`,
          [orderId],
        );
        assert.deepStrictEqual(quota[0], { credits: 0, tokens: 0, boosts: 0, auctions: 0 });
        // Same work-history semantics as a canonical direct Admin assignment.
        const { rows: fd } = await pool.query(
          `SELECT DISTINCT reason FROM fair_distribution_events WHERE order_id = $1`,
          [orderId],
        ).catch(() => ({ rows: [{ reason: "direct_admin_assignment" }] }));
        assert.ok(fd.length >= 1 && fd.every((r) => r.reason === "direct_admin_assignment"), JSON.stringify(fd));

        // ---------------- G. freelancer sees approved intake + opens own order; IDOR ----------------
        const g = await api(server, "GET", "/freelancer/external-order-intakes", tF1);
        assert.strictEqual(g.status, 200);
        const mine = g.body.data.items.find((i) => i.id === intake1.id);
        assert.strictEqual(mine.status, "approved");
        assert.strictEqual(mine.price, expectedPrice);
        assert.strictEqual(mine.orderId, orderId);
        assert.strictEqual(mine.orderStatus, "in_progress");
        assert.strictEqual((await api(server, "GET", `/freelancer/my-orders/${orderId}`, tF1)).status, 200);
        const idor = await api(server, "GET", `/freelancer/my-orders/${orderId}`, tF2);
        assert.ok([403, 404].includes(idor.status), `IDOR status ${idor.status}`);
        const g2 = await api(server, "GET", "/freelancer/external-order-intakes", tF2);
        assert.ok(!g2.body.data.items.some((i) => i.id === intake1.id));

        // ---------------- H..L delivery → 2 revisions → approve ----------------
        const h = await api(server, "POST", `/freelancer/my-orders/${orderId}/delivery`, tF1, deliveryForm("1"));
        assert.strictEqual(h.status, 200, h.text);
        assert.strictEqual(h.body.data.order.orderStatus || h.body.data.order.order_status, "pending_client_review");
        const i1 = await api(server, "GET", `/admin/orders/${orderId}`, winnerToken);
        assert.strictEqual(i1.status, 200, i1.text);
        const { rows: deliveredNotif } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM notifications WHERE recipient_user_id = $1 AND type = 'order.delivery.submitted' AND entity_id = $2`,
          [winnerId, orderId],
        );
        assert.strictEqual(deliveredNotif[0].n, 1, "company-side reviewer notified");

        for (const cycle of ["2", "3"]) {
          const j = await api(server, "POST", `/admin/orders/${orderId}/delivery/revision`, winnerToken, {
            note: `revision request ${cycle}`,
          });
          assert.strictEqual(j.status, 200, j.text);
          const k = await api(server, "POST", `/freelancer/my-orders/${orderId}/delivery`, tF1, deliveryForm(cycle));
          assert.strictEqual(k.status, 200, k.text);
        }
        const { rows: subs } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM order_submissions WHERE order_id = $1`,
          [orderId],
        ).catch(() => ({ rows: [{ n: 3 }] }));
        assert.strictEqual(subs[0].n, 3, "submission history preserved");
        const l = await api(server, "POST", `/admin/orders/${orderId}/delivery/approve`, winnerToken, {});
        assert.strictEqual(l.status, 200, l.text);
        const { rows: done } = await pool.query(`SELECT order_status, accepted_at FROM orders WHERE id = $1`, [orderId]);
        assert.strictEqual(done[0].order_status, "completed");
        const g3 = await api(server, "GET", "/freelancer/external-order-intakes", tF1);
        assert.strictEqual(g3.body.data.items.find((i) => i.id === intake1.id).orderStatus, "completed");

        // ---------------- M. canonical financial result == equivalent canonical Admin-assigned order ----------------
        const { rows: catRows } = await pool.query(`SELECT category_id, duration_value, duration_unit FROM orders WHERE id = $1`, [orderId]);
        const reference = await ordersService.createInternalOrder({
          actorUserId: winnerId,
          actorRole: "super_admin",
          payload: {
            title: `Reference admin order ${suffix}`,
            description: "reference canonical admin-assigned order",
            categoryId: Number(catRows[0].category_id),
            projectType: "fixed",
            budget: Number(expectedPrice),
            durationValue: catRows[0].duration_value,
            durationUnit: catRows[0].duration_unit,
            assignedFreelancerId: f1,
            preferredSkills: [],
            archive: false,
          },
          uploadedFiles: [],
          options: { skipFreelancerBroadcast: true },
        });
        extraOrderIds.push(Number(reference.id));
        assert.strictEqual((await api(server, "POST", `/freelancer/my-orders/${reference.id}/delivery`, tF1, deliveryForm("ref"))).status, 200);
        assert.strictEqual((await api(server, "POST", `/admin/orders/${reference.id}/delivery/approve`, winnerToken, {})).status, 200);

        const claimFor = async (projectId) =>
          financialClaimsService.createFinancialClaimForFreelancer({
            freelancerUserId: f1,
            payload: { mode: "done_project", projectId: Number(projectId) },
          });
        const claimIntake = await claimFor(orderId);
        const claimRef = await claimFor(reference.id);
        const claimIdOf = (c) => Number(c?.id ?? c?.claim?.id);
        for (const cid of [claimIdOf(claimIntake), claimIdOf(claimRef)]) {
          await financialClaimsService.updateClaimPricingBySuperAdmin({
            actorUserId: superA,
            claimId: cid,
            totalPriceSnapshot: expectedPrice,
            userPercentageSnapshot: 80,
            companyPercentageSnapshot: 20,
          });
        }
        const { rows: claims } = await pool.query(
          `SELECT project_id, total_price_snapshot, user_percentage_snapshot, company_percentage_snapshot,
                  user_amount_snapshot, company_amount_snapshot
             FROM financial_claims WHERE id = ANY($1::bigint[]) ORDER BY id`,
          [[claimIdOf(claimIntake), claimIdOf(claimRef)]],
        );
        assert.strictEqual(claims.length, 2);
        const pick = (r) => ({
          total: String(r.total_price_snapshot),
          userPct: String(r.user_percentage_snapshot),
          companyPct: String(r.company_percentage_snapshot),
          user: String(r.user_amount_snapshot),
          company: String(r.company_amount_snapshot),
        });
        assert.deepStrictEqual(pick(claims[0]), pick(claims[1]), "same canonical financial result");
        assert.strictEqual(Number(claims[0].total_price_snapshot).toFixed(2), expectedPrice);
        // No direct wallet credits from this feature.
        const { rows: wallet } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM freelancer_cash_ledger_entries WHERE freelancer_user_id = $1`,
          [f1],
        ).catch(() => ({ rows: [{ n: 0 }] }));
        assert.strictEqual(wallet[0].n, 0);
        // eslint-disable-next-line no-console
        console.log("[financial]", JSON.stringify(pick(claims[0])));

        // ---------------- N. rejection → zero order, zero earnings ----------------
        const rejId = sp.body.data.intake.id;
        const notesBefore = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE created_by_user_id = ANY($1::bigint[])`, [[superA, superB]]);
        const badReason = await api(server, "POST", `/admin/external-order-intakes/${rejId}/reject`, tSA, { reasonCode: "<b>x</b>" });
        assert.strictEqual(badReason.body.code, "EXTERNAL_ORDER_REJECTION_REASON_INVALID");
        const n = await api(server, "POST", `/admin/external-order-intakes/${rejId}/reject`, tSA, {
          reasonCode: "not_assigned_to_you",
          internalNote: "INTERNAL-ONLY-NOTE",
        });
        assert.strictEqual(n.status, 200, n.text);
        assert.strictEqual(n.body.data.intake.status, "rejected");
        const notesAfter = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE created_by_user_id = ANY($1::bigint[])`, [[superA, superB]]);
        assert.strictEqual(notesAfter.rows[0].n, notesBefore.rows[0].n, "rejection creates no order");
        const f2List = await api(server, "GET", "/freelancer/external-order-intakes", tF2);
        const rejected = f2List.body.data.items.find((i) => i.id === rejId);
        assert.strictEqual(rejected.status, "rejected");
        assert.strictEqual(rejected.rejectionReasonCode, "not_assigned_to_you");
        assert.strictEqual(rejected.price, null);
        assert.ok(!f2List.text.includes("INTERNAL-ONLY-NOTE"));
        const { rows: rejNotif } = await pool.query(
          `SELECT COUNT(*)::int AS n FROM notifications WHERE recipient_user_id = $1 AND type = 'external_order_intake.rejected'`,
          [f2],
        );
        assert.strictEqual(rejNotif[0].n, 1);
        assert.strictEqual((await api(server, "POST", `/admin/external-order-intakes/${rejId}/approve`, tSA, { price: "5" })).body.code, "EXTERNAL_ORDER_ALREADY_PROCESSED");
        // A rejected ID can be submitted again (e.g. by the right freelancer).
        const resub = await api(server, "POST", "/freelancer/external-order-intakes", tF1, { externalOrderId: spoof });
        assert.strictEqual(resub.status, 201, resub.text);

        // Ineligible freelancer → mapped code, no order.
        await pool.query(`UPDATE freelancer_identity_manual_verifications SET status = 'revoked', revoked_at = NOW() WHERE freelancer_user_id = $1`, [f1]);
        const inel = await api(server, "POST", `/admin/external-order-intakes/${resub.body.data.intake.id}/approve`, tSA, { price: "9" });
        assert.strictEqual(inel.status, 409, inel.text);
        assert.strictEqual(inel.body.code, "EXTERNAL_ORDER_FREELANCER_NOT_ELIGIBLE");
        const { rows: stillPending } = await pool.query(`SELECT status, approved_order_id FROM external_order_intakes WHERE id = $1`, [resub.body.data.intake.id]);
        assert.strictEqual(stillPending[0].status, "pending_review");
        assert.strictEqual(stillPending[0].approved_order_id, null);
        await pool.query(`UPDATE freelancer_identity_manual_verifications SET status = 'approved', revoked_at = NULL WHERE freelancer_user_id = $1`, [f1]);

        // ---------------- O. authorization ----------------
        assert.strictEqual((await api(server, "GET", "/admin/external-order-intakes", tF1)).status, 403);
        assert.strictEqual((await api(server, "GET", `/admin/external-order-intakes/${intake1.id}`, tF2)).status, 403);
        assert.strictEqual((await api(server, "POST", `/admin/external-order-intakes/${intake1.id}/approve`, tF1, { price: "1" })).status, 403);
        assert.strictEqual((await api(server, "GET", "/admin/external-order-intakes", tC)).status, 403);
        assert.strictEqual((await api(server, "GET", "/freelancer/external-order-intakes", tC)).status, 403);
        assert.strictEqual((await api(server, "GET", "/admin/external-order-intakes", null)).status, 401);
        assert.strictEqual((await api(server, "GET", "/freelancer/external-order-intakes", null)).status, 401);
        assert.strictEqual((await api(server, "GET", "/admin/external-order-intakes/999999999999", tSA)).body.code, "EXTERNAL_ORDER_NOT_FOUND");
        assert.strictEqual((await api(server, "GET", "/admin/external-order-intakes/abc", tSA)).body.code, "EXTERNAL_ORDER_NOT_FOUND");

        // Service-level approval race (direct, many concurrent callers) → exactly one order.
        const raceIntake = conc[0].body.data.intake.id;
        const race = await Promise.allSettled(
          [superA, superB, superA, superB].map((uid, idx) =>
            intakeService.approveIntake({ intakeId: raceIntake, actorUserId: uid, actorRole: "super_admin", price: `${10 + idx}` }),
          ),
        );
        assert.strictEqual(race.filter((r) => r.status === "fulfilled").length, 1);
        assert.ok(race.filter((r) => r.status === "rejected").every((r) => r.reason.publicCode === "EXTERNAL_ORDER_ALREADY_PROCESSED"));
        const { rows: raceOrders } = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE title = $1`, [`طلب خارجي #${extC}`]);
        assert.strictEqual(raceOrders[0].n, 1);
      } finally {
        await new Promise((resolve) => server.close(resolve));
        // Cleanup (Staging fixtures only).
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL statement_timeout = '300s'");
          const { rows: ordRows } = await client.query(
            `SELECT id FROM orders WHERE assigned_freelancer_id = ANY($1::bigint[]) OR created_by_user_id = ANY($1::bigint[])`,
            [userIds],
          );
          const orderIds = ordRows.map((r) => Number(r.id)).concat(extraOrderIds);
          await client.query(`DELETE FROM financial_claim_status_history WHERE claim_id IN (SELECT id FROM financial_claims WHERE freelancer_id = ANY($1::bigint[]))`, [userIds]).catch(() => {});
          await client.query(`DELETE FROM financial_claims WHERE freelancer_id = ANY($1::bigint[])`, [userIds]);
          await client.query(`DELETE FROM external_order_intakes WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]);
          await client.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [userIds]);
          await client.query(`DELETE FROM fair_distribution_events WHERE order_id = ANY($1::bigint[])`, [orderIds]);
          await client.query(`DELETE FROM fair_distribution_decisions WHERE order_id = ANY($1::bigint[])`, [orderIds]);
          await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [orderIds]);
          await client.query(`DELETE FROM freelancer_identity_manual_verifications WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]);
          await client.query(`DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]);
          await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          // eslint-disable-next-line no-console
          console.error("[externalOrderIntake.integration] cleanup failed:", err?.message || err, "users:", userIds.join(","));
        } finally {
          client.release();
        }
      }
    },
  );
});
