/**
 * Postgres integration — Smart Orders S5 financial engine.
 * Fake Stripe client + real signed webhook endpoint (never calls the Stripe API).
 *
 * Run: node --test test/smartOrdersFinance.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (non-Production), JWT_SECRET, migrations 216–219.
 */
const crypto = require("node:crypto");
const http = require("node:http");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const ok = isIntegrationEnvConfigured();
const TAG = `[IT-SMART-S5] ${crypto.randomBytes(3).toString("hex")}`;
const WEBHOOK_SECRET = `whsec_${crypto.randomBytes(16).toString("hex")}`;
const PASSWORD = `It5-${crypto.randomBytes(6).toString("hex")}!A`;

function fakeStripe() {
  const sessions = new Map();
  let n = 0;
  return {
    sessions,
    checkout: {
      sessions: {
        create: async (params) => {
          n += 1;
          const id = `cs_test_s5_${Date.now()}_${n}`;
          const s = {
            id,
            url: `https://checkout.stripe.test/${id}`,
            status: "open",
            payment_status: "unpaid",
            amount_total: params.line_items[0].price_data.unit_amount,
            currency: params.line_items[0].price_data.currency,
            metadata: params.metadata,
          };
          sessions.set(id, s);
          return s;
        },
        retrieve: async (id) => sessions.get(id),
        expire: async (id) => {
          const s = sessions.get(id);
          if (s) s.status = "expired";
          return s;
        },
      },
    },
    paymentIntents: {
      retrieve: async (id) => ({
        id,
        latest_charge: { id: `ch_${id}`, balance_transaction: { id: `txn_${id}`, fee: 437, currency: "usd" } },
      }),
    },
  };
}

describe("Smart Orders S5 — financial engine (Postgres)", { skip: !ok }, () => {
  let pool;
  let ordersService;
  let customers;
  let commercial;
  let finance;
  let items;
  let authService;
  let server;
  let stripeLib;
  const userIds = [];
  let adminId;
  let superId;
  let clientId;
  let f1;
  let categoryId;
  let adminEmail;
  let superEmail;
  let clientEmail;

  async function makeUser(role) {
    const email = `it-s5-${crypto.randomBytes(5).toString("hex")}@example.test`;
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role, country, phone, whatsapp, gender, terms_accepted, email_verified, is_active)
       VALUES ($1,'مالية','اختبار','تجربة',$2,$3,$4,'JO','+962790000555','+962790000555','ذكر',true,true,true) RETURNING id`,
      [crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10), email, await bcrypt.hash(PASSWORD, 4), role],
    );
    userIds.push(Number(rows[0].id));
    return { id: Number(rows[0].id), email };
  }

  async function eligibleFreelancer() {
    const { id } = await makeUser("freelancer");
    const subs = require("../src/services/subscriptionsService");
    await subs.assignPlanToFreelancer({ actorUserId: superId, freelancerUserId: id, planId: 3, notes: "s5 integration" });
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
        description: "Smart orders S5 integration order description.",
        categoryId,
        projectType: "fixed",
        budget: extra.budget || "40",
        durationValue: 3,
        durationUnit: "days",
        preferredSkills: [],
        customer: customers.parseCustomerInput(customer),
        assignedFreelancerId: extra.freelancerId || null,
      },
      options: { returnCustomerLink: true },
    });
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
  const webhook = (type, object) =>
    postSigned(JSON.stringify({ id: `evt_s5_${crypto.randomBytes(8).toString("hex")}`, type, data: { object } }));
  const paid = (s, extra = {}) => ({ ...s, status: "complete", payment_status: "paid", payment_intent: `pi_${s.id}`, ...extra });

  async function api(method, path, token, body) {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }

  /** Paid, accepted, completed registered-customer order with quote in `currency`. */
  async function paidOrder({ currency = "AED", amount = "100", title = "paid" } = {}) {
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title, freelancerId: f1, budget: "30" });
    const { rows: off } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [order.id]);
    await commercial.acceptOffer({ freelancerUserId: f1, offerId: off[0].id });
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: amount, currency, validDays: 3 }, actorUserId: adminId, actorRole: "admin" });
    const stripe = fakeStripe();
    await commercial.createQuoteCheckout({ orderId: order.id, clientUserId: clientId, deps: { stripe } });
    const s = [...stripe.sessions.values()][0];
    const p = paid(s);
    await commercial.applyQuoteCheckoutCompleted(p, pool, { stripe });
    return { order, session: p, stripe };
  }

  before(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.FINANCE_STRIPE_FEE_LOOKUP = "1";
    process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_integration_dummy_never_called";
    ({ pool } = require("../src/config/db"));
    ordersService = require("../src/services/ordersService");
    customers = require("../src/services/orderCustomerService");
    commercial = require("../src/services/orderCommercialService");
    finance = require("../src/services/finance/orderFinanceService");
    items = require("../src/services/finance/orderServiceItemsService");
    authService = require("../src/services/authService");
    stripeLib = new (require("stripe"))(process.env.STRIPE_SECRET_KEY);
    const { rows } = await pool.query(`SELECT to_regclass('public.order_settlements') AS t`);
    assert.ok(rows[0].t, "migration 219 must be applied");
    categoryId = Number((await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 1`)).rows[0].id);
    const a = await makeUser("admin");
    const sa = await makeUser("super_admin");
    const c = await makeUser("client");
    adminId = a.id;
    superId = sa.id;
    clientId = c.id;
    adminEmail = a.email;
    superEmail = sa.email;
    clientEmail = c.email;
    f1 = await eligibleFreelancer();
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
      const appendOnly = ["order_financial_terms", "order_work_authorizations", "order_commercial_events", "order_settlements", "order_cost_entries", "order_cost_entry_voids", "order_financial_adjustments", "order_service_items", "payment_exceptions"];
      for (const t of appendOnly) await client.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`);
      await client.query(`DELETE FROM order_settlements WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_cost_entry_voids WHERE cost_entry_id IN (SELECT id FROM order_cost_entries WHERE order_id = ANY($1::bigint[]))`, [ids]);
      await client.query(`DELETE FROM order_cost_entries WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_financial_adjustments WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM payment_exceptions WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_service_items WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM client_order_payments WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_financial_terms WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_commercial_changes WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM order_assignment_offers WHERE order_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM fair_distribution_events WHERE order_id = ANY($1::bigint[])`, [ids]).catch(() => {});
      await client.query(`DELETE FROM fair_distribution_decisions WHERE order_id = ANY($1::bigint[])`, [ids]).catch(() => {});
      await client.query(`DELETE FROM payment_checkout_funnel_events WHERE stripe_checkout_session_id LIKE 'cs_test_s5_%'`);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM fx_rate_snapshots WHERE source LIKE $1`, [`${TAG}%`]);
      for (const t of appendOnly) await client.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`);
      await client.query(`DELETE FROM guest_contacts WHERE created_by_admin_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM freelancer_identity_manual_verifications WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      await client.query(`DELETE FROM freelancer_subscriptions WHERE freelancer_user_id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      await client.query("SAVEPOINT u");
      try {
        await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
      } catch {
        await client.query("ROLLBACK TO SAVEPOINT u");
        await client.query(`UPDATE users SET is_active = false, is_deleted = true WHERE id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      console.error("cleanup", e.message);
    } finally {
      client.release();
    }
  });

  const fxFor = async (currency, rate) =>
    finance.createFxSnapshot({ baseCurrency: "JOD", quoteCurrency: currency, rate, source: `${TAG} test rate`, rateAt: new Date().toISOString(), actorUserId: superId });

  it("AED quote: actual fee recorded once; FX required; settlement closes immutably with exact identity", async () => {
    const { order, session, stripe } = await paidOrder({ currency: "AED", amount: "100" });
    // Duplicate completion (webhook retry) → still one fee row.
    await commercial.applyQuoteCheckoutCompleted(session, pool, { stripe });
    const fin = await finance.getOrderFinance({ orderId: order.id });
    const fees = fin.costs.filter((c) => c.kind === "payment_fee");
    assert.equal(fees.length, 1, "fee recorded exactly once");
    assert.equal(fees[0].amount, "4.370");
    assert.equal(fees[0].currency, "USD");
    // Not completed + no FX → blocked; rates are never invented.
    let p = fin.settlement;
    assert.deepEqual(p.blockers.sort(), ["fx_snapshot_required", "order_not_completed"].sort());
    assert.deepEqual(p.fxMissing.sort(), ["AED", "USD"]);
    assert.equal(p.amounts.gross, null);

    await pool.query(`UPDATE orders SET order_status = 'completed' WHERE id = $1`, [order.id]);
    const aed = await fxFor("AED", "5.18");
    const usd = await fxFor("USD", "1.41");
    p = await finance.previewSettlement({ orderId: order.id, fxSnapshotIds: [aed.id, usd.id] });
    assert.equal(p.canClose, true, JSON.stringify(p.blockers));
    assert.equal(p.amounts.gross, "19.305");
    assert.equal(p.amounts.fees, "3.099");
    assert.equal(p.amounts.tax, "0.000", "VAT disabled");
    assert.equal(p.amounts.freelancer, "30.000", "agreed terms, never reduced by fees");
    assert.equal(p.amounts.company, "-13.794", "a loss is shown, not hidden");
    assert.equal(p.companyShareNegative, true);

    // Concurrent double-close → exactly one version 1.
    const two = await Promise.allSettled([
      finance.closeSettlement({ orderId: order.id, expectedVersion: 0, fxSnapshotIds: [aed.id, usd.id], actorUserId: superId }),
      finance.closeSettlement({ orderId: order.id, expectedVersion: 0, fxSnapshotIds: [aed.id, usd.id], actorUserId: superId }),
    ]);
    assert.equal(two.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(two.find((r) => r.status === "rejected").reason.publicCode, "FINANCE_SETTLEMENT_VERSION_CONFLICT");
    // Closed settlements are immutable in the database.
    await assert.rejects(pool.query(`UPDATE order_settlements SET company_milli = 0 WHERE order_id = $1`, [order.id]));
    // A correction is a new version and needs a reason.
    await assert.rejects(
      () => finance.closeSettlement({ orderId: order.id, expectedVersion: 1, fxSnapshotIds: [aed.id, usd.id], actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_REASON_REQUIRED",
    );
    await finance.recordCost({ orderId: order.id, kind: "direct_expense", amount: "1.5", currency: "JOD", description: "Courier", actorUserId: superId });
    const v2 = await finance.closeSettlement({ orderId: order.id, expectedVersion: 1, fxSnapshotIds: [aed.id, usd.id], correctionReason: "Late courier invoice", actorUserId: superId });
    assert.equal(v2.version, 2);
    assert.equal(v2.directCosts, "1.500");
    const { rows } = await pool.query(`SELECT version, company_milli::text AS c FROM order_settlements WHERE order_id = $1 ORDER BY version`, [order.id]);
    assert.deepEqual(rows.map((r) => r.c), ["-13794", "-15294"], "history kept; closed numbers never recomputed");
    // FX snapshot rows are immutable too.
    await assert.rejects(pool.query(`UPDATE fx_rate_snapshots SET rate = 1 WHERE id = $1`, [aed.id]));
  });

  it("JOD quote needs no FX; refund + lost dispute recorded idempotently as adjustments and exceptions", async () => {
    const { order, session } = await paidOrder({ currency: "JOD", amount: "50", title: "jod" });
    await pool.query(`UPDATE orders SET order_status = 'completed' WHERE id = $1`, [order.id]);
    const charge = { id: `ch_${session.id}`, object: "charge", payment_intent: session.payment_intent, currency: "jod", amount_refunded: 10000, refunds: { data: [{ id: `re_${session.id}`, amount: 10000, status: "succeeded" }] } };
    assert.equal(await webhook("charge.refunded", charge), 200);
    assert.equal(await webhook("charge.refunded", charge), 200);
    const dispute = { id: `dp_${session.id}`, object: "dispute", payment_intent: session.payment_intent, currency: "jod", amount: 5000, status: "lost", reason: "fraudulent" };
    assert.equal(await webhook("charge.dispute.closed", dispute), 200);
    const fin = await finance.getOrderFinance({ orderId: order.id });
    assert.deepEqual(fin.adjustments.map((a) => `${a.kind}:${a.amount}`).sort(), ["dispute_loss:5.000", "refund:10.000"]);
    assert.deepEqual(fin.exceptions.map((e) => e.kind).sort(), ["dispute", "refund"]);
    const p = fin.settlement;
    assert.ok(p.blockers.includes("open_payment_exceptions"));
    assert.equal(p.amounts.gross, "50.000");
    assert.equal(p.amounts.refunds, "15.000");
    for (const e of fin.exceptions) {
      await finance.resolvePaymentException({ exceptionId: e.id, resolution: "no_action_required", note: "Recorded by Stripe; customer informed.", actorUserId: superId });
    }
    await assert.rejects(
      () => finance.resolvePaymentException({ exceptionId: fin.exceptions[0].id, resolution: "other", note: "again please", actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_EXCEPTION_NOT_OPEN",
    );
    // The (fake) processor fee is in USD → that line needs an explicit rate even for a JOD quote.
    const usd = await fxFor("USD", "1.41");
    const closed = await finance.closeSettlement({ orderId: order.id, expectedVersion: 0, fxSnapshotIds: [usd.id], actorUserId: superId });
    assert.equal(closed.gross, "50.000");
    assert.equal(closed.refunds, "15.000");
    assert.equal(closed.fees, "3.099");
    assert.equal(closed.net, "31.901");
    assert.equal(closed.company, "1.901");
  });

  it("superseded / mismatched / duplicate payments go to the exception queue (never applied to the new quote)", async () => {
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "exceptions", freelancerId: f1 });
    const { rows: off } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [order.id]);
    await commercial.acceptOffer({ freelancerUserId: f1, offerId: off[0].id });
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "20", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" });
    const stripe = fakeStripe();
    await commercial.createQuoteCheckout({ orderId: order.id, clientUserId: clientId, deps: { stripe } });
    const v1 = [...stripe.sessions.values()][0];
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "25", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" });
    assert.equal(await webhook("checkout.session.completed", paid(v1)), 200);
    // v2 paid with the wrong amount.
    await commercial.createQuoteCheckout({ orderId: order.id, clientUserId: clientId, deps: { stripe } });
    const v2 = [...stripe.sessions.values()][1];
    assert.equal(await webhook("checkout.session.completed", paid(v2, { amount_total: 1000 })), 200);
    const ex = await finance.listPaymentExceptions({ status: "open", orderId: order.id });
    assert.deepEqual(ex.map((e) => e.kind).sort(), ["amount_mismatch", "superseded"]);
    const { rows: q } = await pool.query(`SELECT version, payment_status FROM order_quotes WHERE order_id = $1 ORDER BY version`, [order.id]);
    assert.deepEqual(q.map((r) => r.payment_status), ["paid_inactive", "paid_inactive"], "never fulfils v2 with v1 money");

    // Duplicate payment: a second session paid for an already-paid quote.
    const ok2 = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "dup", freelancerId: f1 });
    const { rows: off2 } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [ok2.id]);
    await commercial.acceptOffer({ freelancerUserId: f1, offerId: off2[0].id });
    await commercial.issueQuote({ orderId: ok2.id, input: { baseAmount: "15", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" });
    const st2 = fakeStripe();
    await commercial.createQuoteCheckout({ orderId: ok2.id, clientUserId: clientId, deps: { stripe: st2 } });
    const a = [...st2.sessions.values()][0];
    // A second open attempt row for the same quote (e.g. paid in another tab before expiry).
    const { rows: qr } = await pool.query(`SELECT id FROM order_quotes WHERE order_id = $1`, [ok2.id]);
    await pool.query(
      `INSERT INTO client_order_payments (order_id, client_id, amount, payment_provider, provider_checkout_session_id, status, purpose, quote_id, currency)
       VALUES ($1, $2, 15, 'stripe', $3, 'pending', 'quote_payment', $4, 'JOD')`,
      [ok2.id, clientId, `${a.id}_b`, qr[0].id],
    );
    assert.equal(await webhook("checkout.session.completed", paid(a)), 200);
    assert.equal(await webhook("checkout.session.completed", paid({ ...a, id: `${a.id}_b` })), 200);
    assert.equal(await webhook("checkout.session.completed", paid({ ...a, id: `${a.id}_b` })), 200, "retry is harmless");
    const dup = await finance.listPaymentExceptions({ status: "open", orderId: ok2.id });
    assert.deepEqual(dup.map((e) => e.kind), ["duplicate_payment"]);
  });

  it("policy gates: VAT, QC, revenue split need management approval; failed checks never billable", async () => {
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "gates" });
    await assert.rejects(
      () => commercial.issueQuote({ orderId: order.id, input: { baseAmount: "10", currency: "JOD", taxTreatment: "taxable" }, actorUserId: adminId, actorRole: "admin" }),
      (e) => e.publicCode === "FINANCE_POLICY_DISABLED",
    );
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "10", currency: "JOD", taxTreatment: "out_of_scope" }, actorUserId: adminId, actorRole: "admin" });
    await assert.rejects(
      () => finance.setPolicy({ key: "vat", status: "active", config: { ratePercent: "5.00" }, actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_POLICY_APPROVAL_REQUIRED",
    );
    await assert.rejects(
      () => finance.setPolicy({ key: "base_currency", status: "active", config: { currency: "AED" }, actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_POLICY_LOCKED",
    );
    await assert.rejects(
      () => finance.recordCost({ orderId: order.id, kind: "quality_check", amount: "2", currency: "AED", description: "Plagiarism check", qcProvider: "manual", qcResult: "failed", actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_QC_NOT_BILLABLE",
    );
    // 5 concurrent passed checks → exactly the cap (3) recorded.
    const qc = await Promise.allSettled(
      [0, 1, 2, 3, 4].map((i) =>
        finance.recordCost({ orderId: order.id, kind: "quality_check", amount: "2", currency: "AED", description: `Check ${i}`, qcProvider: "manual", qcResult: "passed", sourceRef: `${TAG}-qc-${i}`, actorUserId: superId }),
      ),
    );
    assert.equal(qc.filter((r) => r.status === "fulfilled").length, 3);
    await assert.rejects(
      () => finance.recordCost({ orderId: order.id, kind: "quality_check", amount: "2", currency: "AED", description: "4th", qcProvider: "manual", qcResult: "passed", actorUserId: superId }),
      (e) => e.publicCode === "FINANCE_QC_LIMIT",
    );
    const p = await finance.previewSettlement({ orderId: order.id, fxSnapshotIds: [(await fxFor("AED", "5.18")).id] });
    assert.equal(p.amounts.qualityChecks, "0.000", "QC charging is disabled (G6)");
    assert.equal(p.amounts.qualityChecksExcluded, "1.158");
    const pol = await finance.getPolicies();
    for (const k of ["vat", "revenue_split", "quality_checks", "employee_reward_pool"]) assert.equal(pol[k].active, false, k);
  });

  it("internal order: pay = budget, no revenue; client marketplace orders keep existing rules", async () => {
    const internal = await ordersService.createInternalOrder({
      actorUserId: adminId,
      actorRole: "admin",
      payload: { title: `${TAG} internal`, description: "Internal work item for S5 test.", categoryId, projectType: "fixed", budget: "12.5", durationValue: 2, durationUnit: "days", preferredSkills: [], assignedFreelancerId: f1 },
    });
    await pool.query(`UPDATE orders SET order_status = 'completed' WHERE id = $1`, [internal.id]);
    const p = await finance.previewSettlement({ orderId: internal.id });
    assert.equal(p.amounts.gross, "0.000");
    assert.equal(p.amounts.freelancer, "12.500");
    assert.equal(p.amounts.company, "-12.500");
    const { rows } = await pool.query(`SELECT id FROM orders WHERE source_type = 'client_created' ORDER BY id DESC LIMIT 1`);
    if (rows[0]) {
      const legacy = await finance.previewSettlement({ orderId: rows[0].id });
      assert.equal(legacy.supported, false);
    }
  });

  it("multi-service items: immutable, frozen into the quote, locked after payment", async () => {
    const order = await customerOrder({ mode: "existing", customerUserId: clientId }, { title: "items", freelancerId: f1 });
    const { rows: svc } = await pool.query(
      `SELECT s.service_code, s.current_version FROM catalog_services s WHERE s.is_active AND s.service_code = 'website_development'`,
    );
    const item = await items.addItem({
      orderId: order.id,
      input: {
        serviceForm: { serviceCode: svc[0].service_code, version: svc[0].current_version, values: { user_types: "Admins and customers", admin_panel: "yes", site_languages: ["ar", "en"], payments: "no" }, quantity: "2" },
        price: { amount: "35", currency: "JOD" },
      },
      actorUserId: adminId,
    });
    assert.equal(item.itemNo, 2);
    await assert.rejects(pool.query(`UPDATE order_service_items SET price_amount = 1 WHERE id = $1`, [item.id]));
    const sug = await require("../src/services/finance/pricingEngine").suggestQuoteForOrder(order.id);
    assert.ok(sug.lines.some((l) => l.itemNo === 2 && l.amount === "35.00"));
    const { rows: off } = await pool.query(`SELECT id FROM order_assignment_offers WHERE order_id = $1`, [order.id]);
    await commercial.acceptOffer({ freelancerUserId: f1, offerId: off[0].id });
    await commercial.issueQuote({ orderId: order.id, input: { baseAmount: "35", currency: "JOD" }, actorUserId: adminId, actorRole: "admin" });
    const { rows: q } = await pool.query(`SELECT snapshot FROM order_quotes WHERE order_id = $1`, [order.id]);
    assert.equal(q[0].snapshot.items[0].code, "website_development");
    const stripe = fakeStripe();
    await commercial.createQuoteCheckout({ orderId: order.id, clientUserId: clientId, deps: { stripe } });
    await commercial.applyQuoteCheckoutCompleted(paid([...stripe.sessions.values()][0]), pool, { stripe });
    await assert.rejects(() => items.removeItem({ orderId: order.id, itemId: item.id, actorUserId: adminId }), (e) => e.publicCode === "SMART_ORDER_ITEMS_LOCKED");
  });

  it("RBAC: plain admin / client / anonymous cannot read or write finance; super admin can", async () => {
    const login = async (email) => (await authService.loginUser(email, PASSWORD)).token;
    const tAdmin = await login(adminEmail);
    const tSuper = await login(superEmail);
    const tClient = await login(clientEmail);
    assert.equal((await api("GET", "/admin/finance/policies")).status, 401);
    assert.equal((await api("GET", "/admin/finance/policies", tClient)).status, 403);
    assert.equal((await api("GET", "/admin/finance/policies", tAdmin)).status, 403);
    assert.equal((await api("POST", "/admin/finance/policies/vat", tAdmin, { status: "active", config: { ratePercent: "5" }, approvalReference: "fake approval" })).status, 403);
    const r = await api("GET", "/admin/finance/policies", tSuper);
    assert.equal(r.status, 200);
    assert.equal(r.json.data.vat.active, false);
    assert.equal((await api("GET", "/admin/finance/payment-exceptions", tSuper)).status, 200);
  });
});
