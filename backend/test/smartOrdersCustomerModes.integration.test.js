/**
 * Postgres integration — Smart Orders S1 customer modes (existing / new_account / guest).
 *
 * Run: node --test test/smartOrdersCustomerModes.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (explicit non-Production DB), JWT_SECRET (16+ chars), migration 216.
 * Creates throwaway users/orders and removes only what it created.
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const integrationEnvOk = isIntegrationEnvConfigured();
const TAG = `[IT-SMART-S1] ${crypto.randomBytes(3).toString("hex")}`;

describe("Smart Orders S1 — customer modes (Postgres)", { skip: !integrationEnvOk }, () => {
  let pool;
  let ordersService;
  let customers;
  let orderAuthz;
  let categoryId;
  const userIds = [];
  const orderIds = [];
  let adminId;
  let otherAdminId;
  let clientId;
  let client2Id;
  let unverifiedClientId;
  let freelancerId;
  const sharedPhone = `+96279${String(Math.floor(1000000 + Math.random() * 8999999))}`;

  async function makeUser(role, { verified = true, phone = "+962790000999" } = {}) {
    const accountId = crypto.randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
    const email = `it-smart-s1-${crypto.randomBytes(5).toString("hex")}@example.test`;
    const { rows } = await pool.query(
      `INSERT INTO users (account_id, first_name, father_name, family_name, email, password_hash, role,
         country, phone, whatsapp, gender, terms_accepted, email_verified, is_active)
       VALUES ($1, 'تجربة', 'ذكي', 'اختبار', $2, 'x', $3, 'JO', $4, $4, 'ذكر', true, $5, true)
       RETURNING id`,
      [accountId, email, role, phone, verified],
    );
    const id = Number(rows[0].id);
    userIds.push(id);
    return id;
  }

  async function userCount() {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM users`);
    return rows[0].n;
  }

  async function createOrder(customer, extra = {}) {
    const order = await ordersService.createInternalOrder({
      actorUserId: adminId,
      actorRole: "admin",
      payload: {
        title: `${TAG} ${extra.title || "order"}`,
        description: "Smart orders S1 integration test order description.",
        categoryId,
        projectType: "fixed",
        budget: "25",
        durationValue: 3,
        durationUnit: "days",
        preferredSkills: [],
        archive: true,
        customer: customer ? customers.parseCustomerInput(customer) : null,
      },
      options: { returnCustomerLink: true },
    });
    orderIds.push(Number(order.id));
    return order;
  }

  function tokenFrom(link) {
    return String(link.claimUrl).split("#t=")[1];
  }

  before(async () => {
    ({ pool } = require("../src/config/db"));
    ordersService = require("../src/services/ordersService");
    customers = require("../src/services/orderCustomerService");
    orderAuthz = require("../src/services/orderAuthorizationService");
    const { rows: col } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'guest_contact_id'`,
    );
    assert.equal(col.length, 1, "migration 216 must be applied on the integration database");
    categoryId = Number((await pool.query(`SELECT id FROM categories WHERE is_active = TRUE ORDER BY id LIMIT 1`)).rows[0].id);
    adminId = await makeUser("admin");
    otherAdminId = await makeUser("admin");
    clientId = await makeUser("client");
    client2Id = await makeUser("client", { phone: sharedPhone });
    unverifiedClientId = await makeUser("client", { verified: false });
    freelancerId = await makeUser("freelancer");
  });

  after(async () => {
    if (!pool) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '300s'");
      const { rows } = await client.query(`SELECT id, guest_contact_id FROM orders WHERE title LIKE $1`, [`${TAG}%`]);
      const ids = rows.map((r) => Number(r.id));
      const guestIds = rows.map((r) => r.guest_contact_id).filter(Boolean).map(Number);
      await client.query(`DELETE FROM notifications WHERE entity_type = 'order' AND entity_id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM notifications WHERE recipient_user_id = ANY($1::bigint[]) OR actor_user_id = ANY($1::bigint[])`, [userIds]);
      await client.query(`DELETE FROM orders WHERE id = ANY($1::bigint[])`, [ids]);
      await client.query(`DELETE FROM guest_contacts WHERE id = ANY($1::bigint[]) OR created_by_admin_id = ANY($2::bigint[])`, [guestIds, userIds]);
      await client.query(`DELETE FROM user_roles WHERE user_id = ANY($1::bigint[])`, [userIds]).catch(() => {});
      await client.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [userIds]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // eslint-disable-next-line no-console
      console.error("[smartOrdersCustomerModes.integration] cleanup failed:", err?.message || err);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("legacy internal Admin order (no customer block) is unchanged", async () => {
    const order = await createOrder(null, { title: "legacy" });
    const { rows } = await pool.query(`SELECT customer_mode, customer_user_id, guest_contact_id, order_channel FROM orders WHERE id = $1`, [order.id]);
    assert.deepEqual(rows[0], { customer_mode: null, customer_user_id: null, guest_contact_id: null, order_channel: null });
    assert.equal(order.customerLink, undefined);
  });

  it("existing account → linked immediately, no duplicate identity, read-only for the customer", async () => {
    const before = await userCount();
    const order = await createOrder(
      { mode: "existing", customerUserId: clientId, channel: "whatsapp", priceAmount: "120.5", priceCurrency: "AED" },
      { title: "existing" },
    );
    assert.equal(await userCount(), before);
    const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
    assert.equal(rows[0].customer_mode, "existing");
    assert.equal(Number(rows[0].customer_user_id), clientId);
    assert.equal(rows[0].order_channel, "whatsapp");
    assert.equal(rows[0].customer_price_amount, "120.50");
    assert.equal(Number(rows[0].account_manager_admin_id), adminId);

    const list = await ordersService.listClientOrders({ clientUserId: clientId });
    const mine = list.find((o) => String(o.id) === String(order.id));
    assert.ok(mine, "linked order visible in the customer list");
    assert.equal(mine.managedByAdmin, true);
    assert.equal(mine.budget, 120.5, "customer sees the customer price, never the freelancer budget");
    assert.equal(mine.currencyCode, "AED");
    assert.equal(mine.bidUsers.length, 0);

    const detail = await ordersService.getClientOrderByIdForOwner({ clientUserId: clientId, orderId: order.id });
    assert.equal(detail.orderCode, order.orderCode);
    await assert.rejects(
      () => orderAuthz.assertClientOwnsOrder(clientId, order.id),
      (e) => e.publicCode === "SMART_ORDER_MANAGED_BY_TEAM",
    );
    // Another client cannot see it (no IDOR).
    await assert.rejects(() => ordersService.getClientOrderByIdForOwner({ clientUserId: client2Id, orderId: order.id }));
  });

  it("existing mode rejects unverified / non-client accounts", async () => {
    await assert.rejects(
      () => createOrder({ mode: "existing", customerUserId: unverifiedClientId }, { title: "bad-unverified" }),
      (e) => e.publicCode === "SMART_ORDER_CUSTOMER_NOT_ELIGIBLE",
    );
    await assert.rejects(
      () => createOrder({ mode: "existing", customerUserId: freelancerId }, { title: "bad-freelancer" }),
      (e) => e.publicCode === "SMART_ORDER_CUSTOMER_NOT_ELIGIBLE",
    );
  });

  it("new account → pending activation → one-time claim links the SAME order", async () => {
    const usersBefore = await userCount();
    const order = await createOrder({ mode: "new_account", phone: "+962 79 123 4567" }, { title: "new-account" });
    assert.equal(await userCount(), usersBefore, "no users row is created for a pending activation");
    assert.ok(order.customerLink?.claimUrl.includes("/claim-order#t="));
    const token = tokenFrom(order.customerLink);

    const preview = await customers.previewClaim(token);
    assert.equal(preview.orderCode, order.orderCode);
    assert.equal(Object.keys(preview).includes("phone"), false);

    // Freelancers / unverified accounts cannot claim.
    await assert.rejects(() => customers.claimOrder({ token, userId: freelancerId, notify: false }), (e) => e.publicCode === "SMART_ORDER_CLAIM_CLIENT_ONLY");
    await assert.rejects(() => customers.claimOrder({ token, userId: unverifiedClientId, notify: false }), (e) => e.publicCode === "SMART_ORDER_CLAIM_CLIENT_ONLY");

    // Concurrent redemption → exactly one winner.
    const race = await Promise.allSettled([
      customers.claimOrder({ token, userId: clientId, notify: false }),
      customers.claimOrder({ token, userId: client2Id, notify: false }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    const { rows } = await pool.query(`SELECT customer_user_id, customer_account_linked_at FROM orders WHERE id = $1`, [order.id]);
    const winner = Number(rows[0].customer_user_id);
    assert.ok([clientId, client2Id].includes(winner));
    assert.ok(rows[0].customer_account_linked_at);
    const { rows: cnt } = await pool.query(`SELECT COUNT(*)::int AS n FROM orders WHERE order_code = $1`, [order.orderCode]);
    assert.equal(cnt[0].n, 1, "order is never cloned");

    // Token is single-use.
    await assert.rejects(() => customers.claimOrder({ token, userId: winner, notify: false }), (e) => e.publicCode === "SMART_ORDER_CLAIM_INVALID");
    await assert.rejects(() => customers.previewClaim(token), (e) => e.publicCode === "SMART_ORDER_CLAIM_INVALID");
    const detail = await ordersService.getClientOrderByIdForOwner({ clientUserId: winner, orderId: order.id });
    assert.equal(String(detail.id), String(order.id));
  });

  it("regenerating the activation link revokes the previous one; expired links fail", async () => {
    const order = await createOrder({ mode: "new_account", phone: "+962791112233" }, { title: "regen" });
    const first = tokenFrom(order.customerLink);
    const regen = await customers.regenerateActivationLink({ orderId: order.id, actorUserId: adminId, actorRole: "admin" });
    await assert.rejects(() => customers.previewClaim(first));
    const second = tokenFrom(regen);
    await pool.query(`UPDATE order_customer_invitations SET expires_at = NOW() - interval '1 minute' WHERE order_id = $1 AND status = 'pending'`, [order.id]);
    await assert.rejects(() => customers.claimOrder({ token: second, userId: clientId, notify: false }), (e) => e.publicCode === "SMART_ORDER_CLAIM_INVALID");
    await assert.rejects(() => customers.claimOrder({ token: "not-a-token", userId: clientId, notify: false }));
  });

  it("guest → no users row, no OTP/link, phone match never auto-links", async () => {
    const usersBefore = await userCount();
    const { rows: otpBefore } = await pool.query(`SELECT COUNT(*)::int AS n FROM auth_otps`);
    const order = await createOrder(
      { mode: "guest", referenceName: "أبو أحمد", phone: sharedPhone, contactChannel: "whatsapp", accountManagerAdminId: otherAdminId },
      { title: "guest" },
    );
    assert.equal(await userCount(), usersBefore, "guest creates NO users row");
    const { rows: otpAfter } = await pool.query(`SELECT COUNT(*)::int AS n FROM auth_otps`);
    assert.equal(otpAfter[0].n, otpBefore[0].n, "no OTP for guests");
    assert.equal(order.customerLink, undefined, "no activation link for guests");
    const { rows } = await pool.query(
      `SELECT o.customer_mode, o.customer_user_id, o.account_manager_admin_id, g.phone_e164, g.no_login
         FROM orders o JOIN guest_contacts g ON g.id = o.guest_contact_id WHERE o.id = $1`,
      [order.id],
    );
    assert.equal(rows[0].customer_mode, "guest");
    assert.equal(rows[0].customer_user_id, null);
    assert.equal(rows[0].phone_e164, sharedPhone);
    assert.equal(rows[0].no_login, true);
    assert.equal(Number(rows[0].account_manager_admin_id), otherAdminId);
    const { rows: inv } = await pool.query(`SELECT COUNT(*)::int AS n FROM order_customer_invitations WHERE order_id = $1`, [order.id]);
    assert.equal(inv[0].n, 0);

    // client2 owns the same phone number but must NOT see the guest order.
    const list = await ordersService.listClientOrders({ clientUserId: client2Id });
    assert.equal(list.some((o) => String(o.id) === String(order.id)), false);

    // Admin panel masks the phone; reveal is audited.
    const panel = await customers.getAdminOrderCustomer(order.id);
    assert.notEqual(panel.guest.maskedPhone, sharedPhone);
    const revealed = await customers.revealGuestContact({ orderId: order.id, actorUserId: adminId, actorRole: "admin" });
    assert.equal(revealed.phone, sharedPhone);
    const { rows: ev } = await pool.query(`SELECT action FROM order_customer_events WHERE order_id = $1 ORDER BY id`, [order.id]);
    assert.deepEqual(ev.map((e) => e.action), ["customer_mode_set", "guest_contact_revealed"]);

    // Database invariant: a guest order cannot silently gain a customer account.
    await assert.rejects(() => pool.query(`UPDATE orders SET customer_user_id = $2 WHERE id = $1`, [order.id, clientId]));
  });

  it("guest → account conversion: explicit evidence, same Order ID, audited", async () => {
    const order = await createOrder({ mode: "guest", referenceName: "سارة", contactChannel: "email" }, { title: "convert" });
    await assert.rejects(
      () => customers.createGuestConversionLink({ orderId: order.id, evidence: "", actorUserId: adminId, actorRole: "admin" }),
      (e) => e.publicCode === "SMART_ORDER_CONVERSION_EVIDENCE_REQUIRED",
    );
    const link = await customers.createGuestConversionLink({
      orderId: order.id,
      evidence: "طلب العميل عبر واتساب بتاريخ اليوم",
      actorUserId: adminId,
      actorRole: "admin",
    });
    const res = await customers.claimOrder({ token: tokenFrom(link), userId: clientId, notify: false });
    assert.equal(res.orderId, String(order.id));
    assert.equal(res.orderCode, order.orderCode);
    const { rows } = await pool.query(`SELECT customer_mode, customer_user_id, guest_contact_id, budget FROM orders WHERE id = $1`, [order.id]);
    assert.equal(rows[0].customer_mode, "guest", "historical mode preserved");
    assert.equal(Number(rows[0].customer_user_id), clientId);
    assert.ok(rows[0].guest_contact_id, "guest contact history kept");
    assert.equal(rows[0].budget, "25.00", "freelancer compensation untouched");
    const { rows: ev } = await pool.query(`SELECT action FROM order_customer_events WHERE order_id = $1 ORDER BY id`, [order.id]);
    assert.ok(ev.some((e) => e.action === "guest_converted"));
    // A second conversion is not possible.
    await assert.rejects(() =>
      customers.createGuestConversionLink({ orderId: order.id, evidence: "again", actorUserId: adminId, actorRole: "admin" }),
    );
  });

  it("pricing + account manager changes are audited; closed orders are protected", async () => {
    const order = await createOrder({ mode: "guest", contactChannel: "other" }, { title: "pricing" });
    let panel = await customers.getAdminOrderCustomer(order.id);
    assert.equal(panel.pricing.status, "pending_pricing");
    panel = await customers.setCustomerPricing({ orderId: order.id, priceAmount: "300", priceCurrency: "JOD", actorUserId: adminId, actorRole: "admin" });
    assert.deepEqual(panel.pricing, { status: "priced", amount: "300.00", currency: "JOD" });
    await assert.rejects(() =>
      customers.setCustomerPricing({ orderId: order.id, priceAmount: "1e3", priceCurrency: "JOD", actorUserId: adminId, actorRole: "admin" }),
    );
    panel = await customers.setAccountManager({ orderId: order.id, accountManagerAdminId: otherAdminId, actorUserId: adminId, actorRole: "admin" });
    assert.equal(panel.accountManager.id, String(otherAdminId));
    await assert.rejects(() =>
      customers.setAccountManager({ orderId: order.id, accountManagerAdminId: clientId, actorUserId: adminId, actorRole: "admin" }),
    );
    await pool.query(`UPDATE orders SET order_status = 'cancelled', is_archived = FALSE, is_published = FALSE, is_open_for_pool = FALSE WHERE id = $1`, [order.id]);
    await assert.rejects(() =>
      customers.setCustomerPricing({ orderId: order.id, priceAmount: "10", priceCurrency: "JOD", actorUserId: adminId, actorRole: "admin" }),
    );
  });

  it("customer search returns masked data for verified clients only; summary aggregates", async () => {
    const { rows } = await pool.query(`SELECT account_id FROM users WHERE id = $1`, [clientId]);
    const found = await customers.searchCustomerAccounts({ q: rows[0].account_id });
    assert.equal(found.length, 1);
    assert.equal(found[0].maskedEmail.includes("it-smart-s1"), false);
    const { rows: u } = await pool.query(`SELECT account_id FROM users WHERE id = $1`, [unverifiedClientId]);
    assert.equal((await customers.searchCustomerAccounts({ q: u[0].account_id })).length, 0);
    const phoneHint = await customers.phoneMatchesExistingClient(sharedPhone);
    assert.equal(phoneHint.matchesExistingAccount, true);
    const summary = await customers.getCustomerModeSummary();
    assert.ok(summary.byMode.guest >= 3);
    assert.ok(summary.newAccountActivated >= 1);
  });

  it("admin list filters by customer mode and carries badges", async () => {
    const guests = await ordersService.listAdminInternalOrders({ limit: 20, customerMode: "guest" });
    assert.ok(guests.length >= 1);
    assert.ok(guests.every((o) => o.customerSummary?.mode === "guest"));
  });
});
