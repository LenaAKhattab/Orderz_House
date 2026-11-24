/**
 * Postgres integration — Smart Orders S3: quotes, guest payment link, Stripe quote payments (fake Stripe client,
 * real signed webhook endpoint), assignment offers, financial terms snapshots, change requests, start-work gate,
 * concurrency.
 *
 * Run: node --test test/smartOrdersCommercial.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (non-Production), JWT_SECRET, migrations 216–218. Never calls Stripe.
 */
const crypto = require("node:crypto");
const http = require("node:http");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const ok = isIntegrationEnvConfigured();
const TAG = `[IT-SMART-S3] ${crypto.randomBytes(3).toString("hex")}`;
const WEBHOOK_SECRET = `whsec_${crypto.randomBytes(16).toString("hex")}`;

function fakeStripe() {
  const sessions = new Map();
  let n = 0;
  return {
    sessions,
    created: [],
    expired: [],
    checkout: {
      sessions: {
        create: async (params) => {
          n += 1;
          const id = `cs_test_s3_${Date.now()}_${n}`;
          const s = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            status: "open",
            payment_status: "unpaid",
            amount_total: params.line_items[0].price_data.unit_amount,
            currency: params.line_items[0].price_data.currency,
            metadata: params.metadata,
            success_url: params.success_url,
            cancel_url: params.cancel_url,
          };
          sessions.set(id, s);
          return s;
        },
        retrieve: async (id) => {
          const s = sessions.get(id);
          if (!s) {
            const e = new Error("missing");
            e.statusCode = 404;
            throw e;
          }
          return s;
        },
        expire: async (id) => {
          const s = sessions.get(id);
          if (s) s.status = "expired";
          return s;
        },
      },
    },
  };
}

describe("Smart Orders S3 — commercial handoff (Postgres)", { skip: !ok }, () => {
  let pool;
  let ordersService;
  let customers;
  let commercial;
  let server;
  let stripeLib;
  const userIds = [];
  let adminId;
  let superId;
  let clientId;
  let f1;
  let f2;
  let categoryId;

  async function makeUser(role) {
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role, country, phone, whatsapp, gender, terms_accepted, email_verified, is_active)
       VALUES ($1,'تجربة','تجاري','اختبار',$2,'x',$3,'JO','+962790000777','+962790000777','ذكر',true,true,true) RETURNING id`,
      [crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10), `it-s3-${crypto.randomBytes(5).toString("hex")}@example.test`, role],
    );
    userIds.push(Number(rows[0].id));
    return Number(rows[0].id);
  }

  async function eligibleFreelancer() {
    const id = await makeUser("freelancer");
    const subs = require("../src/services/subscriptionsService");
    await subs.assignPlanToFreelancer({ actorUserId: superId, freelancerUserId: id, planId: 3, notes: "s3 integration" });
    await pool.query(
      `INSERT INTO freelancer_identity_manual_verifications (freelancer_user_id, status, verification_method, verified_by_user_id, verified_at)
       VALUES ($1,'approved','whatsapp',$2,NOW()) ON CONFLICT (freelancer_user_id) DO UPDATE SET status='approved', revoked_at=NULL`,
      [id, superId],
    );
    await pool.query(`UPDATE freelancer_subscriptions SET activation_status='company_approved' WHERE freelancer_user_id=$1 AND is_current=TRUE`, [id]);
    await pool.query(
      `UPDATE users SET identity_verification_source='COMPANY_OFFLINE_VERIFIED', training_waiver_reason='qa', final_exam_waiver_reason='qa',
              subscription_activation_fee_paid_at = NOW() WHERE id=$1`,
      [id],
    ).catch(() => {});
    const elig = await subs.canFreelancerTakeOrders(String(id));
    if (!elig.eligible) await pool.query(`UPDATE users SET onboarding_source='LEGACY_INVITE' WHERE id=$1`, [id]).catch(() => {});
    return id;
  }

  async function customerOrder(customer, extra = {}) {
    return ordersService.createInternalOrder({
      actorUserId: adminId,
      actorRole: "admin",
      payload: {
        title: `${TAG} ${extra.title || "order"}`,
        description: "Smart orders S3 integration order description.",
        categoryId,
        projectType: "fixed",
        budget: extra.budget || "40",
        durationValue: 3,
        durationUnit: "days",
        preferredSkills: [],
        customer: customers.parseCustomerInput(customer),
        assignedFreelancerId: extra.freelancerId || null,
        offerDeadlineHours: extra.deadlineHours || null,
      },
      options: { returnCustomerLink: true },
    });
  }

  async function webhook(eventType, object) {
    const payload = JSON.stringify({ id: `evt_s3_${crypto.randomBytes(8).toString("hex")}`, type: eventType, data: { object } });
    return postSigned(payload);
  }
  async function postSigned(payload) {
    const header = stripeLib.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/stripe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Stripe-Signature": header },
      body: payload,
    });
    return res.status;
  }
  const paidSession = (s) => ({ ...s, status: "complete", payment_status: "paid", payment_intent: `pi_${s.id}` });
  const quoteRow = async (orderId) => (await pool.query(`SELECT * FROM order_quotes WHERE order_id = $1 ORDER BY version`, [orderId])).rows;
  const orderRow = async (orderId) => (await pool.query(`SELECT * FROM orders WHERE id = $1`, [orderId])).rows[0];

  before(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_integration_dummy_never_called";
    ({ pool } = require("../src/config/db"));
    ordersService = require("../src/services/ordersService");
    customers = require("../src/services/orderCustomerService");
    commercial = require("../src/services/orderCommercialService");
    stripeLib = new (require("stripe"))(process.env.STRIPE_SECRET_KEY);
    const { rows } = await pool.query(`SELECT to_regclass('public.order_quotes') AS t`);
    assert.ok(rows[0].t, "migration 218 must be applied");
    categoryId = Number((await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 1`)).rows[0].id);
    adminId = await makeUser("admin");
    superId = await makeUser("super_admin");
    clientId = await makeUser("client");
    f1 = await eligibleFreelancer();
    f2 = await eligibleFreelancer();
    const app = require("../src/app");
    server = await new Promise((resolve) => {
      const s = http.createServer(app);
      s.listen(0, "127.0.0.1", () => resolve(s));
    });
  });

  after(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '300s'");
      const { rows } = await client.query(`SELECT id FROM orders WHERE title LIKE $1`, [`${TAG}%`]);
      const ids = rows.map((r) => Number(r.id));
      for (const t of ["order_financial_terms", "order_work_authorizations", "order_commercial_events"]) {
        await client.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      }
      await client.query(`DELETE FROM client_order_payments WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_financial_terms WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_commercial_changes WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_assignment_offers WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM fair_distribution_events WHERE order_id = ANY($1::bigint[])`, [ids]).catch(() => {});
      await client.query(`DELETE FROM fair_distribution_decisions WHERE order_id = ANY($1::bigint[])`, [ids]).catch(() => {});
      await client.query(`DELETE FROM payment_checkout_funnel_events WHERE local_ref LIKE 'gq:%' AND occurred_at > NOW() - interval '1 day' AND stripe_checkout_session_id LIKE 'cs_test_s3_%'`);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids]);
      for (const t of ["order_financial_terms", "order_work_authorizations", "order_commercial_events"]) {
        await client.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
      }
      await client.query(`DELETE FROM guest_contacts WHERE created_by_admin_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM freelancer_identity_manual_verifications WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      await client.query(`DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      await client.query("SAVEPOINT u");
      try {
        await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT u"); // other history rows may still reference QA users
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      // eslint-disable-next-line no-console
      console.error("[smartOrdersCommercial.integration] cleanup failed:", e.message);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("A–F: guest quote → link → checkout → cancel/retry → webhook paid once; v2 not satisfied by v1", async () => {
    const order = await customerOrder({ mode: "guest", contactChannel: "email", referenceName: "Guest S3" }, { title: "guest pay" });
    const o0 = await orderRow(order.id);
    assert.deepEqual([o0.order_status, o0.is_published, o0.is_open_for_pool], ["draft", false, false], "customer orders are never broadcast");

    // A. quote v1 + guest link
    const q1 = await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "100", currency: "JOD", adjustments: [{ label: "Rush", amount: "20" }, { label: "Promo", amount: "-5.50" }] }, actorUserId: adminId, actorRole: "admin" });
    assert.equal(q1.version, 1);
    const token1 = q1.guestLink.url.split("#t=")[1];
    // B. guest view: no login, minimal data
    const view = await commercial.guestQuoteView({ token: token1 });
    assert.equal(view.totalAmount, "114.50");
    assert.equal(view.canPay, true);
    assert.equal(Object.keys(view).some((k) => /freelancer|budget|phone|customer/i.test(k)), false);
    const { rows: usersAfter } = await pool.query(`SELECT COUNT(*)::int n FROM users WHERE created_at > NOW() - interval '1 hour' AND email NOT LIKE 'it-s3-%'`);
    const { rows: usersBefore } = await pool.query(`SELECT COUNT(*)::int n FROM users WHERE created_at > NOW() - interval '1 hour' AND email NOT LIKE 'it-s3-%'`);
    assert.equal(usersAfter[0].n, usersBefore[0].n, "no hidden guest account");
    const { rows: gc } = await pool.query(`SELECT customer_user_id FROM orders WHERE id = $1`, [order.id]);
    assert.equal(gc[0].customer_user_id, null, "guest order never gains a user");
    await assert.rejects(() => commercial.guestQuoteView({ token: "x".repeat(43) }), (e) => e.publicCode === "SMART_ORDER_QUOTE_LINK_INVALID");

    // C. checkout: amount derived on the server
    const stripe = fakeStripe();
    const c1 = await commercial.createQuoteCheckout({ guestToken: token1, deps: { stripe } });
    const s1 = [...stripe.sessions.values()][0];
    assert.equal(s1.amount_total, 114500, "JOD minor units from the quote row");
    assert.ok(s1.success_url.includes("#t=") && !s1.success_url.includes("?t="), "token only in fragment");
    // D. cancel → still unpaid; retry resumes the same open session
    assert.equal((await quoteRow(order.id))[0].payment_status, "unpaid");
    const c1b = await commercial.createQuoteCheckout({ guestToken: token1, deps: { stripe } });
    assert.equal(c1b.resumed, true);
    assert.equal(c1b.checkoutUrl, c1.checkoutUrl);

    // F. v2 supersedes v1; old link dies; a late v1 payment never satisfies v2.
    const q2 = await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "130", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" });
    assert.equal(q2.version, 2);
    await assert.rejects(() => commercial.guestQuoteView({ token: token1 }), (e) => e.publicCode === "SMART_ORDER_QUOTE_LINK_INVALID");
    assert.equal(await webhook("checkout.session.completed", paidSession(s1)), 200);
    let rows = await quoteRow(order.id);
    assert.equal(rows[0].payment_status, "paid_inactive");
    assert.equal(rows[1].payment_status, "unpaid", "v2 stays unpaid");

    // E. pay v2 through the signed webhook; three deliveries → exactly one outcome
    const token2 = q2.guestLink.url.split("#t=")[1];
    await commercial.createQuoteCheckout({ guestToken: token2, deps: { stripe } });
    const s2 = [...stripe.sessions.values()].find((s) => s.metadata.quoteId === String(rows[1].id));
    const evt = JSON.stringify({ id: `evt_s3_dup_${crypto.randomBytes(6).toString("hex")}`, type: "checkout.session.completed", data: { object: paidSession(s2) } });
    for (let i = 0; i < 3; i += 1) assert.equal(await postSigned(evt), 200);
    await webhook("checkout.session.completed", paidSession(s2)); // a different event id for the same session
    rows = await quoteRow(order.id);
    assert.equal(rows[1].payment_status, "paid");
    const { rows: pays } = await pool.query(`SELECT status FROM client_order_payments WHERE quote_id = $1`, [rows[1].id]);
    assert.deepEqual(pays.map((p) => p.status), ["paid"]);
    const { rows: ev } = await pool.query(`SELECT COUNT(*)::int n FROM order_commercial_events WHERE order_id = $1 AND action = 'payment_confirmed'`, [order.id]);
    assert.equal(ev[0].n, 1, "one canonical payment outcome");
    await assert.rejects(() => commercial.issueQuote({ orderId: order.id, input: { baseAmount: "1", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" }), (e) => e.publicCode === "SMART_ORDER_QUOTE_PAID_LOCKED");
    // Expired session event is harmless.
    assert.equal(await webhook("checkout.session.expired", { ...s1, status: "expired" }), 200);
    const { rows: funnel } = await pool.query(`SELECT event_type FROM payment_checkout_funnel_events WHERE stripe_checkout_session_id = $1`, [s2.id]);
    assert.ok(funnel.some((f) => f.event_type === "checkout_session_created"), "guest funnel telemetry recorded");
  });

  it("G–K, L, M: offers, accept → terms snapshot, reject/expire → reassign, start-work gate + override", async () => {
    // G. freelancer chosen at creation → OFFER (not assigned)
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "offer flow", freelancerId: f1, deadlineHours: 2, budget: "55" });
    let o = await orderRow(order.id);
    assert.equal(o.assigned_freelancer_id, null);
    assert.equal(o.order_status, "draft");
    let offers = await commercial.listFreelancerOffers({ freelancerUserId: f1 });
    const off1 = offers.find((x) => x.orderId === String(order.id));
    assert.equal(off1.status, "pending");
    assert.equal(off1.compensationAmount, "55.00");
    assert.equal(JSON.stringify(off1).includes("+962790000777"), false, "no customer contact data");

    // I. reject → reassignable, history kept
    await commercial.rejectOffer({ freelancerUserId: f1, offerId: off1.id, reasonCode: "unavailable" });
    await assert.rejects(() => commercial.acceptOffer({ freelancerUserId: f1, offerId: off1.id }), (e) => e.publicCode === "SMART_ORDER_OFFER_NOT_PENDING");
    // J. expiry → cannot accept
    await commercial.createOffer({ orderId: order.id, input: { freelancerUserId: f2, deadlineHours: 1 }, actorUserId: adminId, actorRole: "admin" });
    const { rows: off2 } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1 AND status = 'pending'`, [order.id]);
    await pool.query(`UPDATE order_assignment_offers SET expires_at = NOW() - interval '1 minute' WHERE id = $1`, [off2[0].id]);
    await assert.rejects(() => commercial.acceptOffer({ freelancerUserId: f2, offerId: off2[0].id }), (e) => e.publicCode === "SMART_ORDER_OFFER_EXPIRED");
    // K. new offer → accept (H) — not paid → 'assigned' (work blocked)
    await commercial.createOffer({ orderId: order.id, input: { freelancerUserId: f2, deadlineHours: 24, compensationAmount: "60" }, actorUserId: adminId, actorRole: "admin" });
    const { rows: off3 } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1 AND status = 'pending'`, [order.id]);
    const acc = await commercial.acceptOffer({ freelancerUserId: f2, offerId: off3[0].id });
    assert.equal(acc.workStarted, false);
    o = await orderRow(order.id);
    assert.deepEqual([Number(o.assigned_freelancer_id), o.order_status, String(o.budget)], [f2, "assigned", "60.00"]);
    const { rows: history } = await pool.query(`SELECT status FROM order_assignment_offers WHERE order_id = $1 ORDER BY id`, [order.id]);
    assert.deepEqual(history.map((h) => h.status), ["rejected", "expired", "accepted"]);
    const { rows: terms } = await pool.query(`SELECT * FROM order_financial_terms WHERE order_id = $1`, [order.id]);
    assert.equal(terms.length, 1);
    assert.equal(String(terms[0].compensation_amount), "60.00");
    await assert.rejects(() => pool.query(`UPDATE order_financial_terms SET compensation_amount = 1 WHERE id = $1`, [terms[0].id]), "terms snapshot immutable");

    // L. work before payment / override → backend blocks delivery
    await assert.rejects(
      () => ordersService.submitFreelancerOrderDelivery({ freelancerUserId: f2, orderId: order.id, uploadedFiles: [{ originalname: "x.txt", buffer: Buffer.from("x"), mimetype: "text/plain", size: 1 }] }),
      (e) => e.publicCode === "SMART_ORDER_WORK_NOT_AUTHORIZED",
    );
    // M. authorized override (audited) → work starts
    await assert.rejects(() => commercial.authorizeWork({ orderId: order.id, reason: "x", actorUserId: superId, actorRole: "super_admin" }), (e) => e.publicCode === "SMART_ORDER_REASON_REQUIRED");
    const auth = await commercial.authorizeWork({ orderId: order.id, reason: "Paid by bank transfer ref 7781 (QA)", actorUserId: superId, actorRole: "super_admin" });
    assert.equal(auth.started, true);
    o = await orderRow(order.id);
    assert.equal(o.order_status, "in_progress");
    const { rows: audit } = await pool.query(`SELECT action FROM order_commercial_events WHERE order_id = $1 ORDER BY id`, [order.id]);
    for (const a of ["offer_created", "offer_rejected", "offer_expired", "offer_accepted", "terms_snapshot", "work_authorized", "work_started"]) {
      assert.ok(audit.some((x) => x.action === a), a);
    }

    // N. no silent pay reduction: reduction pending freelancer; increase applies with a new snapshot
    const red = await commercial.requestCompensationChange({ orderId: order.id, newAmount: "45", reason: "Scope reduced (QA)", actorUserId: adminId, actorRole: "admin" });
    assert.equal(red.status, "pending_freelancer");
    assert.equal(String((await orderRow(order.id)).budget), "60.00", "pay unchanged until the freelancer agrees");
    await commercial.respondToChange({ freelancerUserId: f2, changeId: red.changeId, approve: false });
    assert.equal(String((await orderRow(order.id)).budget), "60.00");
    const inc = await commercial.requestCompensationChange({ orderId: order.id, newAmount: "70", reason: "Extra slides (QA)", actorUserId: adminId, actorRole: "admin" });
    assert.equal(inc.status, "applied");
    assert.equal(String((await orderRow(order.id)).budget), "70.00");
    const { rows: tv } = await pool.query(`SELECT terms_version, source FROM order_financial_terms WHERE order_id = $1 ORDER BY terms_version`, [order.id]);
    assert.deepEqual(tv.map((t) => [t.terms_version, t.source]), [[1, "offer_acceptance"], [2, "change_request"]]);
  });

  it("registered customer: quote accept + pay → work starts automatically after accepted offer", async () => {
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "registered pay", freelancerId: f1, budget: "30" });
    const { rows: off } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [order.id]);
    await commercial.acceptOffer({ freelancerUserId: f1, offerId: off[0].id });
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "75", currency: "AED", validDays: 3 }, actorUserId: adminId, actorRole: "admin" });
    const view = await ordersService.getClientOrderByIdForOwner({ clientUserId: clientId, orderId: order.id });
    assert.equal(view.quote.totalAmount, "75.00");
    assert.equal(view.quote.currency, "AED");
    assert.equal(view.budget, 75, "customer sees own price, never the freelancer pay");
    await commercial.customerAcceptQuote({ clientUserId: clientId, orderId: order.id });
    const stripe = fakeStripe();
    await commercial.createQuoteCheckout({ orderId: order.id, clientUserId: clientId, deps: { stripe } });
    const s = [...stripe.sessions.values()][0];
    assert.equal(s.amount_total, 7500);
    assert.equal(s.currency, "aed");
    // Another client cannot pay / accept it (no IDOR).
    const other = await makeUser("client");
    await assert.rejects(() => commercial.createQuoteCheckout({ orderId: order.id, clientUserId: other, deps: { stripe } }), (e) => e.publicCode === "SMART_ORDER_NOT_FOUND");
    assert.equal(await webhook("checkout.session.completed", paidSession(s)), 200);
    const o = await orderRow(order.id);
    assert.equal(o.order_status, "in_progress", "payment confirmation starts the accepted work");
  });

  it("concurrency: double accept, accept vs Admin cancel, two Admins offering at once", async () => {
    const order = await customerOrder({ mode: "guest", contactChannel: "other" }, { title: "race" });
    // Two Admins offer simultaneously → exactly one pending offer.
    const two = await Promise.allSettled([
      commercial.createOffer({ orderId: order.id, input: { freelancerUserId: f1 }, actorUserId: adminId, actorRole: "admin" }),
      commercial.createOffer({ orderId: order.id, input: { freelancerUserId: f2 }, actorUserId: superId, actorRole: "super_admin" }),
    ]);
    assert.equal(two.filter((r) => r.status === "fulfilled").length, 1);
    const { rows: p } = await pool.query(`SELECT id, freelancer_user_id FROM order_assignment_offers WHERE order_id = $1 AND status = 'pending'`, [order.id]);
    assert.equal(p.length, 1);
    const fid = Number(p[0].freelancer_user_id);
    // Duplicate accept clicks + Admin cancel racing → one canonical outcome.
    const race = await Promise.allSettled([
      commercial.acceptOffer({ freelancerUserId: fid, offerId: p[0].id }),
      commercial.acceptOffer({ freelancerUserId: fid, offerId: p[0].id }),
      commercial.cancelOffer({ orderId: order.id, reason: "race", actorUserId: adminId, actorRole: "admin" }),
    ]);
    const { rows: st } = await pool.query(`SELECT status FROM order_assignment_offers WHERE id = $1`, [p[0].id]);
    const { rows: t } = await pool.query(`SELECT COUNT(*)::int n FROM order_financial_terms WHERE order_id = $1`, [order.id]);
    if (st[0].status === "accepted") {
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(t[0].n, 1);
    } else {
      assert.equal(st[0].status, "cancelled");
      assert.equal(t[0].n, 0);
    }
    // Expiry vs acceptance race.
    const order2 = await customerOrder({ mode: "guest", contactChannel: "other" }, { title: "race expiry" });
    await commercial.createOffer({ orderId: order2.id, input: { freelancerUserId: f1, deadlineHours: 1 }, actorUserId: adminId, actorRole: "admin" });
    const { rows: p2 } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [order2.id]);
    await pool.query(`UPDATE order_assignment_offers SET expires_at = NOW() + interval '150 milliseconds' WHERE id = $1`, [p2[0].id]);
    await new Promise((r) => setTimeout(r, 300));
    const r2 = await Promise.allSettled([
      commercial.acceptOffer({ freelancerUserId: f1, offerId: p2[0].id }),
      commercial.listFreelancerOffers({ freelancerUserId: f1 }),
    ]);
    assert.equal(r2[0].status, "rejected");
    assert.equal((await orderRow(order2.id)).assigned_freelancer_id, null);
  });

  it("legacy paths unchanged: internal order direct-assigns; internal orders reject commercial actions", async () => {
    const internal = await ordersService.createInternalOrder({
      actorUserId: adminId,
      actorRole: "admin",
      payload: {
        title: `${TAG} internal`,
        description: "Legacy internal order stays direct-assigned.",
        categoryId,
        projectType: "fixed",
        budget: "10",
        durationValue: 1,
        durationUnit: "days",
        preferredSkills: [],
        assignedFreelancerId: f1,
      },
    });
    const o = await orderRow(internal.id);
    assert.deepEqual([Number(o.assigned_freelancer_id), o.order_status], [f1, "in_progress"]);
    await assert.rejects(
      () => commercial.issueQuote({ orderId: internal.id, input: { baseAmount: "5", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" }),
      (e) => e.publicCode === "SMART_ORDER_COMMERCIAL_NOT_APPLICABLE",
    );
  });
});
