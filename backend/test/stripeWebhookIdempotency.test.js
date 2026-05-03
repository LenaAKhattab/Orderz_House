/**
 * Stripe webhook claim / lifecycle (atomic INSERT ... ON CONFLICT, status columns, failed retry).
 * Run: npm run test:stripe-webhook
 *
 * `db.js` requires DATABASE_URL at load time; tests inject a mock pool and never connect.
 */
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://127.0.0.1:5432/stripe_webhook_test_placeholder";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  claimStripeWebhookEvent,
  markStripeWebhookEventProcessed,
  markStripeWebhookEventFailed,
  releaseStripeWebhookEventClaim,
} = require("../src/controllers/stripeWebhookController");

/** In-memory store mirroring Postgres PK + lifecycle updates. */
function createLifecycleMockPool() {
  /** @type {Map<string, { status: string, processed_at?: Date, failed_at?: Date, last_error?: string }>} */
  const rows = new Map();

  return {
    rows,
    query: async (sql, params) => {
      const s = String(sql);
      const id = params[0];

      if (s.includes("INSERT INTO stripe_webhook_events") && s.includes("ON CONFLICT")) {
        if (!rows.has(id)) {
          rows.set(id, { status: "processing" });
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (s.includes("SELECT status FROM stripe_webhook_events")) {
        const r = rows.get(id);
        return { rows: r ? [{ status: r.status }] : [] };
      }

      // Reclaim after failure: WHERE ... status = 'failed'
      if (s.includes("WHERE id = $1 AND status = 'failed'") && s.includes("SET status = 'processing'")) {
        const r = rows.get(id);
        if (r?.status === "failed") {
          r.status = "processing";
          r.failed_at = undefined;
          r.last_error = undefined;
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (s.includes("SET status = 'processed'")) {
        const r = rows.get(id);
        if (r?.status === "processing") {
          r.status = "processed";
          r.processed_at = new Date();
          r.failed_at = undefined;
          r.last_error = undefined;
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (s.includes("SET status = 'failed'") && s.includes("last_error = $2")) {
        const r = rows.get(id);
        if (r?.status === "processing") {
          r.status = "failed";
          r.failed_at = new Date();
          r.last_error = params[1];
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      if (s.includes("DELETE FROM stripe_webhook_events")) {
        const had = rows.delete(id);
        return { rowCount: had ? 1 : 0 };
      }

      throw new Error(`unexpected sql in mock: ${s.slice(0, 120)}`);
    },
  };
}

describe("claimStripeWebhookEvent", () => {
  it("first INSERT claim succeeds with processing row", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_first";
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), true);
    assert.strictEqual(db.rows.get(evt)?.status, "processing");
  });

  it("duplicate skip when already processed", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_proc";
    db.rows.set(evt, { status: "processed" });
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), false);
  });

  it("duplicate skip when already processing (concurrent delivery)", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_inflight";
    await claimStripeWebhookEvent(evt, db);
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), false);
    assert.strictEqual(db.rows.get(evt)?.status, "processing");
  });

  it("many concurrent claims for same new event id: exactly one succeeds", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_concurrent";
    const n = 50;
    const results = await Promise.all(Array.from({ length: n }, () => claimStripeWebhookEvent(evt, db)));
    assert.strictEqual(results.filter(Boolean).length, 1);
    assert.strictEqual(results.filter((x) => x === false).length, n - 1);
  });

  it("failed event can be reclaimed for Stripe retry", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_retry";
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), true);
    await markStripeWebhookEventFailed(evt, "boom", db);
    assert.strictEqual(db.rows.get(evt)?.status, "failed");
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), true);
    assert.strictEqual(db.rows.get(evt)?.status, "processing");
  });

  it("successful handling marks processed", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_ok";
    await claimStripeWebhookEvent(evt, db);
    await markStripeWebhookEventProcessed(evt, db);
    assert.strictEqual(db.rows.get(evt)?.status, "processed");
    assert.ok(db.rows.get(evt)?.processed_at instanceof Date);
  });

  it("releaseStripeWebhookEventClaim still deletes row (deprecated escape hatch)", async () => {
    const db = createLifecycleMockPool();
    const evt = "evt_del";
    await claimStripeWebhookEvent(evt, db);
    await releaseStripeWebhookEventClaim(evt, db);
    assert.strictEqual(db.rows.has(evt), false);
    assert.strictEqual(await claimStripeWebhookEvent(evt, db), true);
  });
});
