/**
 * Postgres integration: client order creation idempotency — real parallel createClientOrder calls with
 * the same per-attempt key produce ONE order (advisory lock + unique index), distinct keys stay distinct.
 *
 * Run: node --test test/clientOrderCreationIdempotency.integration.test.js
 * Requires: INTEGRATION_TEST_DATABASE_URL (explicit non-Production DB; never DATABASE_URL), JWT_SECRET (16+ chars),
 * migration 211 applied. No Stripe (the service never calls it). Removes only the orders it creates.
 */
const crypto = require("node:crypto");
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { isIntegrationEnvConfigured } = require("./helpers/integrationEnv");

const integrationEnvOk = isIntegrationEnvConfigured();

describe("client order creation idempotency — real Postgres concurrency", { skip: !integrationEnvOk }, () => {
  let pool;
  let ordersService;
  let clientUserId;
  let categoryId;
  const TITLE = `[IT-CREATE-KEY] ${crypto.randomBytes(3).toString("hex")}`;

  before(async () => {
    ({ pool } = require("../src/config/db"));
    ordersService = require("../src/services/ordersService");
    const { rows: col } = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'client_creation_key'`,
    );
    assert.ok(col.length === 1, "migration 211 must be applied on the integration database");
    clientUserId = Number((await pool.query(`SELECT id FROM users WHERE role = 'client' AND is_active = TRUE ORDER BY id DESC LIMIT 1`)).rows[0].id);
    categoryId = Number((await pool.query(`SELECT id FROM categories WHERE slug = 'programming' LIMIT 1`)).rows[0].id);
  });

  after(async () => {
    if (pool) {
      const { rows } = await pool.query(`SELECT id FROM orders WHERE title = $1`, [TITLE]);
      for (const r of rows) {
        // eslint-disable-next-line no-await-in-loop
        await ordersService.purgeClientUnpaidFixedOrderDraft({ clientUserId, orderId: r.id }).catch(() => {});
      }
      await pool.end();
    }
  });

  const create = (creationKey) =>
    ordersService.createClientOrder({
      clientUserId,
      payload: {
        title: TITLE,
        description: "Integration test order for creation idempotency.",
        categoryId,
        projectType: "fixed",
        budget: 15,
        durationValue: 3,
        durationUnit: "days",
        preferredSkills: [],
        creationKey,
      },
      uploadedFiles: [],
    });

  it("5 simultaneous creates of one attempt → one order; replays are flagged", async () => {
    const key = `it-${crypto.randomUUID()}`;
    const results = await Promise.all(Array.from({ length: 5 }, () => create(key)));
    const ids = new Set(results.map((o) => String(o.id)));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((o) => o.idempotentReplay).length, 4);
    const { rows } = await pool.query(`SELECT COUNT(*)::int n FROM orders WHERE created_by_user_id = $1 AND client_creation_key = $2`, [clientUserId, key]);
    assert.equal(rows[0].n, 1);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ scenario: "parallel_same_attempt_5", orders: ids.size, replays: 4 }));
  });

  it("distinct attempts (two tabs / intentional second order) are never merged", async () => {
    const a = await create(`it-${crypto.randomUUID()}`);
    const b = await create(`it-${crypto.randomUUID()}`);
    assert.notEqual(String(a.id), String(b.id));
  });
});
